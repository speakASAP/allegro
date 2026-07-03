import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CatalogClientRequestOptions, CatalogClientService, LoggerService, PrismaService, WarehouseClientService } from '@allegro/shared';
import { OffersService } from '../offers/offers.service';
import { PublishLifecycleService } from '../publish-lifecycle/publish-lifecycle.service';
import { BulkPrepareCatalogSellActionDto, PrepareCatalogSellActionDto } from './catalog-sell-action.dto';

const CATALOG_PRODUCT_QUALITY_POLICY_ID = 'catalog.product_quality.v1';
const CATALOG_BUNDLE_PUBLICATION_POLICY_ID = 'allegro.catalog_bundle_publication.v1';
const CATALOG_BUNDLE_CONTRACT = 'catalog.bundle.v1';
type CatalogProductQualityPreflight = any;

interface CatalogContentPreview {
  marketplace?: string;
  label?: string;
  format?: string;
  product?: Record<string, unknown>;
  content?: {
    title?: string | null;
    plainText?: string | null;
    html?: string | null;
    blocks?: unknown[];
    sections?: unknown[];
  };
  source?: {
    canonicalDocumentVersion?: string | null;
    legacyDescriptionFallback?: boolean | null;
    sourceHash?: string | null;
    generatedAt?: string | null;
  };
  overridesApplied?: boolean;
  warnings?: string[];
  propagation?: {
    status?: string | null;
    staleManualFields?: string[];
  };
  profile?: {
    manualOverrides?: Record<string, unknown>;
    sourceState?: Record<string, unknown>;
  } | null;
  fields?: Array<{
    key?: string;
    manualOverride?: boolean;
    stale?: boolean;
    requiresManualReview?: boolean;
  }>;
  manualOverride?: boolean;
  stale?: boolean;
  requiresManualReview?: boolean;
}

@Injectable()
export class CatalogSellActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly offersService: OffersService,
    private readonly publishLifecycleService: PublishLifecycleService,
    private readonly catalogClient: CatalogClientService,
    private readonly warehouseClient: WarehouseClientService,
  ) {
    this.logger.setContext('CatalogSellActionService');
  }

  async prepare(dto: PrepareCatalogSellActionDto, requestedByUserId: string, humanAuthorization?: string): Promise<any> {
    const catalogAccess = this.catalogAccessOptions(humanAuthorization);
    const catalogProduct = await this.loadCatalogProduct(dto.catalogProductId, catalogAccess);
    const catalogQualityPreflight = await this.assertCatalogQualityAllowsAllegro(catalogProduct.id || dto.catalogProductId, catalogAccess);
    const catalogBundlePublicationPolicy = this.assertCatalogBundlePublicationAllowsAllegro(catalogProduct, catalogQualityPreflight);
    const accountChoices = await this.listAccountChoices(requestedByUserId);
    const selectedAccountId = dto.accountId || accountChoices[0]?.id || null;

    let draft = dto.forceNewDraft
      ? null
      : await this.findReusableDraft(dto, requestedByUserId, selectedAccountId);
    const draftCreated = !draft;

    if (!draft) {
      draft = await this.createDraftFromCatalog(dto, catalogProduct, selectedAccountId, requestedByUserId);
    } else {
      draft = await this.enforceDraftWarehouseQuantity(draft, catalogProduct);
      draft = await this.enforceDraftCanonicalContent(draft, catalogProduct, dto);
    }

    const contentPreviewEvidence = this.toCatalogContentPreviewEvidence(
      this.getAllegroContentPreview(catalogProduct),
      draft?.rawData?.catalogContentPreview?.descriptionApplied === true
        || draft?.rawData?.catalogSnapshot?.contentPreview?.descriptionApplied === true,
    );

    const attempt = await this.publishLifecycleService.prepare(
      {
        action: 'PUBLISH',
        offerId: draft.id,
        accountId: selectedAccountId || draft.accountId || null,
        catalogProductId: dto.catalogProductId,
        idempotencyKey: dto.idempotencyKey,
        commandPayload: {
          source: 'catalog-sell-action',
          catalogProductId: dto.catalogProductId,
          localDraftOfferId: draft.id,
          catalogContentPreview: contentPreviewEvidence,
        },
      },
      requestedByUserId,
    );

    return {
      status: attempt.status,
      nextAction: this.deriveNextAction(attempt),
      draftCreated,
      draft: this.toDraftSummary(draft),
      attempt,
      accountChoices,
      categoryChoice: this.buildCategoryChoice(dto, draft, catalogProduct),
      catalogProduct: this.toCatalogSummary(catalogProduct),
      catalogQualityPreflight,
      catalogBundlePublicationPolicy,
      catalogContentPreview: this.toCatalogContentPreview(this.getAllegroContentPreview(catalogProduct)),
    };
  }

  async bulkPrepare(dto: BulkPrepareCatalogSellActionDto, requestedByUserId: string, humanAuthorization?: string): Promise<any> {
    const results = [] as any[];
    const perAccountCount = new Map<string, number>();

    for (const item of dto.items) {
      const prepared = await this.prepare(item, requestedByUserId, humanAuthorization);
      const accountKey = prepared.attempt.accountId || 'no-account';
      const slotOffsetSeconds = perAccountCount.get(accountKey) || 0;
      perAccountCount.set(accountKey, slotOffsetSeconds + 1);
      results.push({
        ...prepared,
        rateLimitSlot: {
          accountId: prepared.attempt.accountId || null,
          slotOffsetSeconds,
        },
      });
    }

    return {
      total: results.length,
      results,
      accountRateLimitPlan: Array.from(perAccountCount.entries()).map(([accountId, count]) => ({
        accountId: accountId == 'no-account' ? null : accountId,
        maxOneRequestPerSecond: true,
        reservedSlots: count,
      })),
    };
  }

  async confirm(attemptId: string, requestedByUserId: string, previewToken: string): Promise<any> {
    const attempt = await this.publishLifecycleService.confirm(attemptId, requestedByUserId, previewToken);
    const draft = attempt.offerId ? await (this.prisma as any).allegroOffer.findUnique({ where: { id: attempt.offerId } }) : null;

    return {
      status: attempt.status,
      nextAction: this.deriveNextAction(attempt),
      attempt,
      draft: this.toDraftSummary(draft),
    };
  }

  async getStatus(attemptId: string): Promise<any> {
    const attempt = await this.publishLifecycleService.getAttempt(attemptId);
    const draft = attempt.offerId ? await (this.prisma as any).allegroOffer.findUnique({ where: { id: attempt.offerId } }) : null;

    return {
      status: attempt.status,
      nextAction: this.deriveNextAction(attempt),
      attempt,
      draft: this.toDraftSummary(draft),
    };
  }

  async getProductStatus(catalogProductId: string, requestedByUserId: string, humanAuthorization?: string): Promise<any> {
    const accountChoices = await this.listAccountChoices(requestedByUserId);
    const accountIds = accountChoices.map((account) => account.id).filter(Boolean);
    const prismaAny = this.prisma as any;
    const catalogProduct = await this.loadCatalogProduct(catalogProductId, this.catalogAccessOptions(humanAuthorization)).catch((error) => {
      this.logger.warn('Failed to load catalog product while reading Allegro sell-action status', {
        catalogProductId,
        error: error.message,
      });
      return null;
    });
    const catalogQualityPreflight = await this.loadCatalogQualityPreflightForStatus(catalogProductId, this.catalogAccessOptions(humanAuthorization));
    const catalogBundlePublicationPolicy = this.toCatalogBundlePublicationPolicy(catalogProduct, catalogQualityPreflight);
    const catalogQualityBlocked = this.catalogQualityBlocks(catalogQualityPreflight);
    const catalogBundleBlocked = catalogBundlePublicationPolicy.canPublishExternally !== true;
    const draft = await prismaAny.allegroOffer.findFirst({
      where: {
        catalogProductId,
        ...(accountIds.length ? { accountId: { in: accountIds } } : { accountId: null }),
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    const attempt = await prismaAny.allegroPublishAttempt.findFirst({
      where: {
        catalogProductId,
        requestedByUserId,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return {
      status: attempt?.status || draft?.publicationStatus || null,
      nextAction: catalogQualityBlocked
        ? 'resolve_catalog_quality_blockers'
        : catalogBundleBlocked
          ? 'resolve_allegro_bundle_publication_policy'
          : attempt
            ? this.deriveNextAction(attempt)
            : draft
              ? 'confirm_publish'
              : 'prepare_draft',
      draft: this.toDraftSummary(draft),
      attempt: attempt || null,
      accountChoices,
      categoryChoice: this.buildCategoryChoice({ catalogProductId } as any, draft, catalogProduct),
      catalogProduct: this.toCatalogSummary(catalogProduct),
      catalogQualityPreflight,
      catalogBundlePublicationPolicy,
      catalogContentPreview: this.toCatalogContentPreview(this.getAllegroContentPreview(catalogProduct)),
      listingUrl: this.toListingUrl(draft),
      canEditDraft: !catalogQualityBlocked && !catalogBundleBlocked && Boolean(draft && !['ACTIVE'].includes(String(draft.publicationStatus || '').toUpperCase())),
      canConfirmPublish: !catalogQualityBlocked && !catalogBundleBlocked && Boolean(attempt && attempt.status === 'PREPARED'),
    };
  }

  async updateProductDraft(catalogProductId: string, dto: PrepareCatalogSellActionDto, requestedByUserId: string, humanAuthorization?: string): Promise<any> {
    const catalogAccess = this.catalogAccessOptions(humanAuthorization);
    const current = await this.getProductStatus(catalogProductId, requestedByUserId, humanAuthorization);
    const draftId = dto.offerId || current.draft?.id;
    if (!draftId) {
      throw new HttpException('Prepare an Allegro draft before editing the product presentation', HttpStatus.CONFLICT);
    }
    this.ensureCatalogQualityAllowsAllegro(current.catalogQualityPreflight);
    this.ensureCatalogBundlePublicationAllowsAllegro(current.catalogBundlePublicationPolicy);

    const updatePayload = this.toDraftUpdatePayload(dto);
    if (dto.quantity !== undefined) {
      const catalogProduct = await this.loadCatalogProduct(catalogProductId, catalogAccess);
      const requestedQuantity = this.toNonNegativeNumber(dto.quantity, 0);
      const safeQuantity = this.capQuantityToWarehouse(requestedQuantity, catalogProduct.warehouseAvailable);
      updatePayload.quantity = safeQuantity;
      updatePayload.stockQuantity = safeQuantity;
    }
    if (Object.keys(updatePayload).length > 0) {
      await this.offersService.updateOffer(draftId, { ...updatePayload, syncToAllegro: false }, requestedByUserId);
    }

    const draft = await (this.prisma as any).allegroOffer.findUnique({ where: { id: draftId } });
    return {
      status: current.attempt?.status || draft?.publicationStatus || null,
      nextAction: current.attempt ? this.deriveNextAction(current.attempt) : 'confirm_publish',
      draft: this.toDraftSummary(draft),
      attempt: current.attempt || null,
      accountChoices: current.accountChoices || [],
      categoryChoice: current.categoryChoice || null,
      catalogProduct: current.catalogProduct || null,
      catalogQualityPreflight: current.catalogQualityPreflight || null,
      catalogBundlePublicationPolicy: current.catalogBundlePublicationPolicy || null,
      catalogContentPreview: current.catalogContentPreview || null,
      listingUrl: this.toListingUrl(draft),
      canEditDraft: current.catalogBundlePublicationPolicy?.canPublishExternally === true && Boolean(draft && !['ACTIVE'].includes(String(draft.publicationStatus || '').toUpperCase())),
      canConfirmPublish: current.catalogBundlePublicationPolicy?.canPublishExternally === true && Boolean(current.attempt && current.attempt.status === 'PREPARED'),
    };
  }

  async confirmProductPublish(catalogProductId: string, requestedByUserId: string, previewToken: string, humanAuthorization?: string): Promise<any> {
    const current = await this.getProductStatus(catalogProductId, requestedByUserId, humanAuthorization);
    this.ensureCatalogQualityAllowsAllegro(current.catalogQualityPreflight);
    this.ensureCatalogBundlePublicationAllowsAllegro(current.catalogBundlePublicationPolicy);
    if (!current.attempt?.id) {
      throw new HttpException('Prepare an Allegro publish attempt before confirmation', HttpStatus.CONFLICT);
    }
    const confirmed = await this.confirm(current.attempt.id, requestedByUserId, previewToken);
    return {
      ...confirmed,
      accountChoices: current.accountChoices || [],
      categoryChoice: current.categoryChoice || null,
      catalogProduct: current.catalogProduct || null,
      catalogQualityPreflight: current.catalogQualityPreflight || null,
      catalogBundlePublicationPolicy: current.catalogBundlePublicationPolicy || null,
      catalogContentPreview: current.catalogContentPreview || null,
      listingUrl: this.toListingUrl(confirmed.draft),
      canEditDraft: Boolean(confirmed.draft && !['ACTIVE'].includes(String(confirmed.draft.publicationStatus || '').toUpperCase())),
      canConfirmPublish: false,
    };
  }

  private async assertCatalogQualityAllowsAllegro(catalogProductId: string, catalogAccess: CatalogClientRequestOptions): Promise<CatalogProductQualityPreflight> {
    const preflight = await this.loadCatalogQualityPreflight(catalogProductId, catalogAccess);
    this.ensureCatalogQualityAllowsAllegro(preflight);
    return preflight;
  }

  private async loadCatalogQualityPreflight(catalogProductId: string, catalogAccess: CatalogClientRequestOptions): Promise<CatalogProductQualityPreflight> {
    try {
      const getProductQualityPreflight = (this.catalogClient as any).getProductQualityPreflight;
      if (typeof getProductQualityPreflight !== 'function') {
        throw new Error('[MISSING: CatalogClientService.getProductQualityPreflight]');
      }
      return await getProductQualityPreflight.call(this.catalogClient, catalogProductId, catalogAccess);
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function' ? error.getResponse() : null;
      const responseMessage = response && typeof response === 'object' && 'message' in response
        ? String((response as any).message)
        : error?.message || 'Catalog quality preflight unavailable';
      throw new HttpException(
        {
          code: 'CATALOG_QUALITY_PREFLIGHT_UNAVAILABLE',
          message: 'Catalog product quality preflight is unavailable; Allegro must fail closed.',
          catalogProductId,
          policyId: CATALOG_PRODUCT_QUALITY_POLICY_ID,
          detail: responseMessage,
        },
        error.status || error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async loadCatalogQualityPreflightForStatus(catalogProductId: string, catalogAccess: CatalogClientRequestOptions): Promise<any> {
    try {
      return await this.loadCatalogQualityPreflight(catalogProductId, catalogAccess);
    } catch (error: any) {
      return this.unavailableCatalogQualityPreflight(catalogProductId, error);
    }
  }

  private ensureCatalogQualityAllowsAllegro(preflight: any): void {
    if (!this.catalogQualityBlocks(preflight)) {
      return;
    }

    throw new HttpException(
      {
        code: 'CATALOG_QUALITY_BLOCKED',
        message: 'Catalog product quality blockers must be resolved before Allegro draft or publish.',
        policyId: preflight?.policyId || CATALOG_PRODUCT_QUALITY_POLICY_ID,
        catalogProductId: preflight?.productId || null,
        blockers: Array.isArray(preflight?.blockingIssues) ? preflight.blockingIssues : [],
        nextAction: preflight?.nextAction || 'resolve_catalog_quality_blockers',
        catalogQualityPreflight: preflight || null,
      },
      HttpStatus.CONFLICT,
    );
  }

  private catalogQualityBlocks(preflight: any): boolean {
    return !preflight || preflight.canPublish !== true || (Array.isArray(preflight.blockingIssues) && preflight.blockingIssues.length > 0);
  }

  private assertCatalogBundlePublicationAllowsAllegro(catalogProduct: any, preflight: any): any {
    const policy = this.toCatalogBundlePublicationPolicy(catalogProduct, preflight);
    this.ensureCatalogBundlePublicationAllowsAllegro(policy);
    return policy;
  }

  private ensureCatalogBundlePublicationAllowsAllegro(policy: any): void {
    if (!policy || policy.canPublishExternally === true) {
      return;
    }

    throw new HttpException(
      {
        code: 'CATALOG_BUNDLE_PUBLICATION_BLOCKED',
        message: 'Allegro external marketplace bundle publication is blocked for catalog.bundle.v1.',
        policyId: CATALOG_BUNDLE_PUBLICATION_POLICY_ID,
        contract: CATALOG_BUNDLE_CONTRACT,
        catalogProductId: policy.catalogProductId || null,
        blockers: policy.blockingIssues || [],
        missingContracts: policy.missingContracts || [],
        nextAction: 'resolve_allegro_bundle_publication_policy',
        catalogBundlePublicationPolicy: policy,
      },
      HttpStatus.CONFLICT,
    );
  }

  private toCatalogBundlePublicationPolicy(catalogProduct: any, preflight: any): any {
    const source = this.firstDefined(catalogProduct, preflight) || {};
    const contract = this.catalogContract(source, catalogProduct, preflight);
    const isBundle = contract === CATALOG_BUNDLE_CONTRACT
      || this.catalogTargetType(source, catalogProduct, preflight) === 'bundle';
    const catalogProductId = catalogProduct?.id || preflight?.productId || source?.productId || source?.id || null;

    if (!isBundle) {
      return {
        policyId: CATALOG_BUNDLE_PUBLICATION_POLICY_ID,
        catalogProductId,
        contract,
        canPublishExternally: true,
        status: 'PASS',
        allowedUse: 'ordinary_catalog_product_publication',
      };
    }

    return {
      policyId: CATALOG_BUNDLE_PUBLICATION_POLICY_ID,
      catalogProductId,
      contract: CATALOG_BUNDLE_CONTRACT,
      canPublishExternally: false,
      status: 'BLOCKED',
      allowedUse: 'operator_suggestion_or_local_draft_review_only',
      forbiddenUse: 'external_allegro_offer_or_listing_publication',
      blockingIssues: [{
        code: 'catalog_bundle_external_publication_not_approved',
        field: 'catalog.bundle.v1',
        severity: 'blocking',
        message: 'Allegro cannot publish a Catalog bundle as one external offer/listing until an owner-approved channel policy and downstream commerce contracts exist.',
        source: CATALOG_BUNDLE_PUBLICATION_POLICY_ID,
      }],
      missingContracts: [
        '[MISSING: Allegro one-listing bundle representation contract for catalog.bundle.v1]',
        '[MISSING: Warehouse bundle reservation/stock allocation contract]',
        '[MISSING: Orders bundle create-order and line-item decomposition contract]',
        '[MISSING: Payments/free-shipping/discount total contract]',
      ],
      nextAction: 'resolve_allegro_bundle_publication_policy',
    };
  }

  private catalogContract(...sources: any[]): string | null {
    for (const source of sources) {
      const candidates = [
        source?.target?.contract,
        source?.contract,
        source?.resourceType,
        source?.productType,
        source?.type,
      ];
      const match = candidates.map((value) => String(value || '').trim()).find((value) => value === CATALOG_BUNDLE_CONTRACT);
      if (match) return match;
    }
    return null;
  }

  private catalogTargetType(...sources: any[]): string | null {
    for (const source of sources) {
      const candidates = [source?.target?.type, source?.productType, source?.type];
      const match = candidates.map((value) => String(value || '').trim().toLowerCase()).find(Boolean);
      if (match) return match;
    }
    return null;
  }

  private firstDefined(...sources: any[]): any {
    return sources.find((source) => source && typeof source === 'object') || null;
  }

  private unavailableCatalogQualityPreflight(catalogProductId: string, error: any): any {
    const response = typeof error?.getResponse === 'function' ? error.getResponse() : null;
    const detail = response && typeof response === 'object' && 'message' in response
      ? String((response as any).message)
      : error?.message || 'Catalog quality preflight unavailable';
    return {
      policyId: CATALOG_PRODUCT_QUALITY_POLICY_ID,
      productId: catalogProductId,
      canActivate: false,
      canPublish: false,
      blockingIssues: [{
        code: 'catalog_quality_preflight_unavailable',
        field: 'catalog',
        severity: 'blocking',
        message: 'Catalog product quality preflight is unavailable; Allegro must fail closed.',
        source: CATALOG_PRODUCT_QUALITY_POLICY_ID,
      }],
      blockingMissingFields: ['catalog_quality_preflight'],
      optionalOpportunities: [],
      nextAction: 'retry_catalog_quality_preflight',
      readiness: null,
      sourceEndpoint: 'GET /api/products/:id/readiness',
      reviewContractEndpoint: 'GET /api/products/review/quality',
      evaluatedAt: new Date().toISOString(),
      unavailable: true,
      detail,
    };
  }

  private catalogAccessOptions(humanAuthorization?: string): CatalogClientRequestOptions {
    return {
      authorization: humanAuthorization,
      catalogScope: 'effective',
    };
  }

  private async loadCatalogProduct(catalogProductId: string, catalogAccess: CatalogClientRequestOptions = { catalogScope: 'effective' }): Promise<any> {
    try {
      const catalogProduct = await this.catalogClient.getProductById(catalogProductId, catalogAccess);
      return await this.enrichCatalogProductForAllegro(catalogProduct, catalogAccess);
    } catch (error: any) {
      throw new HttpException(
        `Failed to load catalog product ${catalogProductId}: ${error.message}`,
        error.status || error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async enrichCatalogProductForAllegro(catalogProduct: any, catalogAccess: CatalogClientRequestOptions = {}): Promise<any> {
    let marketplaceFields: any = null;
    let currentPricing: any = null;
    let contentPreview: CatalogContentPreview | null = null;

    try {
      marketplaceFields = await this.catalogClient.getProductMarketplaceFields(catalogProduct.id, 'allegro', catalogAccess);
    } catch (error: any) {
      this.logger.warn('Failed to load Allegro marketplace fields for catalog sell-action', {
        catalogProductId: catalogProduct.id,
        error: error.message,
      });
    }

    try {
      currentPricing = await this.catalogClient.getProductPricing(catalogProduct.id, catalogAccess);
    } catch (error: any) {
      this.logger.warn('Failed to load Catalog pricing for catalog sell-action', {
        catalogProductId: catalogProduct.id,
        error: error.message,
      });
    }

    try {
      const getContentPreview = (this.catalogClient as any).getProductContentPreview;
      if (typeof getContentPreview === 'function') {
        contentPreview = await getContentPreview.call(this.catalogClient, catalogProduct.id, 'allegro', catalogAccess);
      }
    } catch (error: any) {
      this.logger.warn('Failed to load Allegro canonical content preview for catalog sell-action', {
        catalogProductId: catalogProduct.id,
        error: error.message,
      });
    }

    const warehouseAvailable = await this.getWarehouseAvailable(catalogProduct.id);
    const profile = marketplaceFields?.profile || null;
    const overrides = profile?.overrides || {};
    const overridePrice = overrides.price !== undefined && overrides.price !== null ? Number(overrides.price) : null;
    const priceAmount = Number.isFinite(overridePrice) && overridePrice > 0
      ? overridePrice
      : this.toNonNegativeNumber(currentPricing?.salePrice, currentPricing?.basePrice, catalogProduct?.price?.gross, catalogProduct?.price);
    const overrideQuantity = overrides.quantity !== undefined && overrides.quantity !== null ? Number(overrides.quantity) : undefined;
    const requestedQuantity = Number.isFinite(overrideQuantity)
      ? Number(overrideQuantity)
      : this.toNonNegativeNumber(catalogProduct?.stockQuantity, catalogProduct?.quantity, catalogProduct?.stock, warehouseAvailable, 0);
    const safeQuantity = this.capQuantityToWarehouse(requestedQuantity, warehouseAvailable);

    return {
      ...catalogProduct,
      allegroCategoryId: overrides.categoryId || catalogProduct?.allegroCategoryId || null,
      price: priceAmount > 0 ? {
        gross: priceAmount,
        currency: String(overrides.currency || currentPricing?.currency || catalogProduct?.currency || 'CZK').toUpperCase(),
      } : catalogProduct?.price,
      currency: String(overrides.currency || currentPricing?.currency || catalogProduct?.currency || 'CZK').toUpperCase(),
      quantity: safeQuantity,
      stockQuantity: safeQuantity,
      warehouseAvailable,
      warehouseStock: {
        source: 'warehouse-microservice',
        totalAvailable: warehouseAvailable,
        requestedQuantity,
        capped: safeQuantity < requestedQuantity,
      },
      images: Array.isArray(overrides.images) && overrides.images.length > 0 ? overrides.images : catalogProduct?.images,
      marketplaceProfiles: {
        ...(catalogProduct?.marketplaceProfiles || {}),
        allegro: profile,
      },
      contentPreviews: {
        ...(catalogProduct?.contentPreviews || {}),
        allegro: this.withMarketplaceReview(contentPreview, marketplaceFields),
      },
      allegroContentPreview: this.withMarketplaceReview(contentPreview, marketplaceFields),
    };
  }

  private async listAccountChoices(requestedByUserId: string): Promise<any[]> {
    const prismaAny = this.prisma as any;
    const accounts = await prismaAny.allegroAccount.findMany({
      where: { userId: requestedByUserId, isActive: true },
      select: {
        id: true,
        name: true,
        isActive: true,
        tokenExpiresAt: true,
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });

    return accounts.map((account: any) => ({
      id: account.id,
      name: account.name,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt,
    }));
  }

  private async findReusableDraft(
    dto: PrepareCatalogSellActionDto,
    requestedByUserId: string,
    selectedAccountId: string | null,
  ): Promise<any | null> {
    const prismaAny = this.prisma as any;
    if (dto.offerId) {
      return prismaAny.allegroOffer.findFirst({
        where: {
          id: dto.offerId,
          account: dto.accountId || selectedAccountId ? { id: dto.accountId || selectedAccountId, userId: requestedByUserId } : undefined,
        },
      });
    }

    return prismaAny.allegroOffer.findFirst({
      where: {
        catalogProductId: dto.catalogProductId,
        accountId: selectedAccountId || undefined,
        publicationStatus: { in: ['INACTIVE', 'ENDED'] },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  private async createDraftFromCatalog(
    dto: PrepareCatalogSellActionDto,
    catalogProduct: any,
    accountId: string | null,
    requestedByUserId: string,
  ): Promise<any> {
    const mapped = this.mapCatalogProductToLocalDraft(dto, catalogProduct, accountId, requestedByUserId);
    const draft = await this.offersService.createOffer(mapped, requestedByUserId);
    if (accountId && draft.accountId !== accountId) {
      return (this.prisma as any).allegroOffer.update({
        where: { id: draft.id },
        data: { accountId },
      });
    }
    return draft;
  }

  private async enforceDraftWarehouseQuantity(draft: any, catalogProduct: any): Promise<any> {
    if (!draft) return draft;
    const warehouseAvailable = Number.isFinite(Number(catalogProduct?.warehouseAvailable)) ? Number(catalogProduct.warehouseAvailable) : 0;
    const requestedQuantity = this.toNonNegativeNumber(draft.stockQuantity, draft.quantity, 0);
    const safeQuantity = this.capQuantityToWarehouse(requestedQuantity, warehouseAvailable);
    if (safeQuantity === requestedQuantity && draft.rawData?.warehouseStock?.totalAvailable === warehouseAvailable) {
      return draft;
    }

    const rawData = {
      ...(draft.rawData || {}),
      warehouseStock: {
        source: 'warehouse-microservice',
        totalAvailable: warehouseAvailable,
        requestedQuantity,
        capped: safeQuantity < requestedQuantity,
      },
    };

    return (this.prisma as any).allegroOffer.update({
      where: { id: draft.id },
      data: { quantity: safeQuantity, stockQuantity: safeQuantity, rawData },
    });
  }

  private async enforceDraftCanonicalContent(draft: any, catalogProduct: any, dto: PrepareCatalogSellActionDto): Promise<any> {
    if (!draft) return draft;
    const contentPreview = this.getAllegroContentPreview(catalogProduct);
    const generatedDescription = this.getGeneratedDescription(contentPreview);
    const shouldApplyDescription = dto.description === undefined
      && Boolean(generatedDescription)
      && !String(draft.description || '').trim();
    const previewEvidence = this.toCatalogContentPreviewEvidence(contentPreview, shouldApplyDescription);

    if (!previewEvidence && !shouldApplyDescription) {
      return draft;
    }

    const rawData = {
      ...(draft.rawData || {}),
      catalogContentPreview: previewEvidence,
      catalogSnapshot: {
        ...(draft.rawData?.catalogSnapshot || {}),
        contentPreview: previewEvidence,
      },
    };
    const data: Record<string, unknown> = { rawData };
    if (shouldApplyDescription) {
      data.description = generatedDescription;
    }

    return (this.prisma as any).allegroOffer.update({
      where: { id: draft.id },
      data,
    });
  }

  private mapCatalogProductToLocalDraft(
    dto: PrepareCatalogSellActionDto,
    catalogProduct: any,
    accountId: string | null,
    requestedByUserId: string,
  ): Record<string, unknown> {
    const images = this.extractImageUrls(catalogProduct);
    const allegroOverrides = catalogProduct?.marketplaceProfiles?.allegro?.overrides || {};
    const contentPreview = this.getAllegroContentPreview(catalogProduct);
    const generatedDescription = this.getGeneratedDescription(contentPreview);
    const title = dto.title || catalogProduct?.title || catalogProduct?.name || `Catalog product ${dto.catalogProductId}`;
    const description = dto.description !== undefined
      ? dto.description
      : generatedDescription || catalogProduct?.description || catalogProduct?.shortDescription || null;
    const descriptionSource = dto.description !== undefined
      ? 'request'
      : generatedDescription
        ? 'catalog-content-preview'
        : catalogProduct?.description
          ? 'catalog-description'
          : catalogProduct?.shortDescription
            ? 'catalog-short-description'
            : '[MISSING: catalog description]';
    const categoryId = dto.categoryId || allegroOverrides.categoryId || catalogProduct?.allegroCategoryId || catalogProduct?.categoryId || 'UNASSIGNED';
    const requestedQuantity = this.toNonNegativeNumber(dto.quantity, allegroOverrides.quantity, catalogProduct?.stockQuantity, catalogProduct?.quantity, catalogProduct?.stock, 0);
    const warehouseAvailable = Number.isFinite(Number(catalogProduct?.warehouseAvailable)) ? Number(catalogProduct.warehouseAvailable) : requestedQuantity;
    const quantity = this.capQuantityToWarehouse(requestedQuantity, warehouseAvailable);
    const price = this.toNonNegativeNumber(dto.price, allegroOverrides.price, catalogProduct?.price?.gross, catalogProduct?.price, catalogProduct?.salePrice, 0);
    const currency = allegroOverrides.currency || catalogProduct?.price?.currency || catalogProduct?.currency || 'PLN';

    return {
      title,
      description,
      categoryId,
      price,
      quantity,
      stockQuantity: quantity,
      currency,
      images,
      status: 'DRAFT',
      publicationStatus: 'INACTIVE',
      catalogProductId: dto.catalogProductId,
      accountId,
      syncToAllegro: false,
      rawData: {
        source: 'catalog-sell-action',
        createdBy: 'TASK-004',
        requestedByUserId,
        catalogSnapshot: {
          id: catalogProduct?.id || dto.catalogProductId,
          sku: catalogProduct?.sku || null,
          title,
          brand: catalogProduct?.brand || null,
          ean: catalogProduct?.ean || null,
          price,
          currency,
          quantity,
          imageCount: images.length,
          selectedCategoryId: categoryId,
          warehouseStock: {
            source: 'warehouse-microservice',
            totalAvailable: warehouseAvailable,
            requestedQuantity,
            capped: quantity < requestedQuantity,
          },
          contentPreview: this.toCatalogContentPreviewEvidence(contentPreview, descriptionSource === 'catalog-content-preview'),
          descriptionSource,
        },
        catalogContentPreview: this.toCatalogContentPreviewEvidence(contentPreview, descriptionSource === 'catalog-content-preview'),
      },
    };
  }

  private async getWarehouseAvailable(catalogProductId: string): Promise<number> {
    const available = Number(await this.warehouseClient.getTotalAvailable(catalogProductId));
    return Number.isFinite(available) && available > 0 ? Math.floor(available) : 0;
  }

  private capQuantityToWarehouse(quantity: number, warehouseAvailable: number): number {
    const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 0;
    const safeAvailable = Number.isFinite(Number(warehouseAvailable)) && Number(warehouseAvailable) > 0 ? Math.floor(Number(warehouseAvailable)) : 0;
    return Math.min(safeQuantity, safeAvailable);
  }

  private getAllegroContentPreview(catalogProduct: any): CatalogContentPreview | null {
    return catalogProduct?.allegroContentPreview || catalogProduct?.contentPreviews?.allegro || null;
  }

  private getGeneratedDescription(preview: CatalogContentPreview | null): string | null {
    const content = preview?.content || {};
    const value = typeof content.plainText === 'string' && content.plainText.trim()
      ? content.plainText
      : typeof content.html === 'string' && content.html.trim()
        ? content.html
        : null;
    return value && value.trim() ? value : null;
  }

  private withMarketplaceReview(preview: CatalogContentPreview | null, marketplaceFields: any): CatalogContentPreview | null {
    if (!preview) return null;
    const review = this.toMarketplaceReview(marketplaceFields);
    return {
      ...preview,
      propagation: review.propagation,
      profile: review.profile,
      fields: review.fields,
      manualOverride: review.manualOverride,
      stale: review.stale,
      requiresManualReview: review.requiresManualReview,
    };
  }

  private toMarketplaceReview(marketplaceFields: any) {
    const fields = Array.isArray(marketplaceFields?.fields) ? marketplaceFields.fields : [];
    const profileManualOverrides = marketplaceFields?.profile?.manualOverrides && typeof marketplaceFields.profile.manualOverrides === 'object'
      ? marketplaceFields.profile.manualOverrides
      : {};
    const sourceState = marketplaceFields?.profile?.sourceState && typeof marketplaceFields.profile.sourceState === 'object'
      ? marketplaceFields.profile.sourceState
      : {};
    const staleManualFields = Array.isArray(marketplaceFields?.propagation?.staleManualFields)
      ? marketplaceFields.propagation.staleManualFields.map((field: unknown) => String(field)).filter(Boolean)
      : [];
    const normalizedFields = fields
      .map((field: any) => ({
        key: typeof field?.key === 'string' ? field.key : null,
        manualOverride: field?.manualOverride === true,
        stale: field?.stale === true,
        requiresManualReview: field?.requiresManualReview === true,
      }))
      .filter((field: any) => field.key);
    const manualOverride = Object.keys(profileManualOverrides).length > 0 || normalizedFields.some((field: any) => field.manualOverride);
    const stale = staleManualFields.length > 0 || normalizedFields.some((field: any) => field.stale || field.requiresManualReview);
    const propagationStatus = typeof marketplaceFields?.propagation?.status === 'string'
      ? marketplaceFields.propagation.status
      : null;

    return {
      propagation: {
        status: propagationStatus,
        staleManualFields,
      },
      profile: {
        manualOverrides: profileManualOverrides,
        sourceState,
      },
      fields: normalizedFields,
      manualOverride,
      stale,
      requiresManualReview: propagationStatus === 'manual_review_required' || stale,
    };
  }

  private toCatalogContentPreview(preview: CatalogContentPreview | null): any {
    if (!preview) return null;
    const content = preview.content || {};
    return {
      marketplace: preview.marketplace || 'allegro',
      label: preview.label || null,
      format: preview.format || null,
      product: preview.product || null,
      content: {
        title: content.title || null,
        plainText: content.plainText || null,
        html: content.html || null,
        blockCount: Array.isArray(content.blocks) ? content.blocks.length : 0,
        sectionCount: Array.isArray(content.sections) ? content.sections.length : 0,
      },
      source: {
        canonicalDocumentVersion: preview.source?.canonicalDocumentVersion || null,
        legacyDescriptionFallback: Boolean(preview.source?.legacyDescriptionFallback),
        sourceHash: preview.source?.sourceHash || null,
        generatedAt: preview.source?.generatedAt || null,
      },
      overridesApplied: Boolean(preview.overridesApplied),
      warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
      manualOverride: preview.manualOverride === true,
      stale: preview.stale === true,
      requiresManualReview: preview.requiresManualReview === true,
      propagation: {
        status: preview.propagation?.status || null,
        staleManualFields: Array.isArray(preview.propagation?.staleManualFields) ? preview.propagation.staleManualFields : [],
      },
      profile: {
        manualOverrides: preview.profile?.manualOverrides || {},
        sourceState: preview.profile?.sourceState || {},
      },
      fields: Array.isArray(preview.fields) ? preview.fields : [],
    };
  }

  private toCatalogContentPreviewEvidence(preview: CatalogContentPreview | null, descriptionApplied: boolean): any {
    if (!preview) return null;
    const content = preview.content || {};
    return {
      marketplace: preview.marketplace || 'allegro',
      label: preview.label || null,
      format: preview.format || null,
      descriptionApplied,
      content: {
        titlePresent: Boolean(content.title),
        plainTextLength: typeof content.plainText === 'string' ? content.plainText.length : 0,
        htmlLength: typeof content.html === 'string' ? content.html.length : 0,
        blockCount: Array.isArray(content.blocks) ? content.blocks.length : 0,
        sectionCount: Array.isArray(content.sections) ? content.sections.length : 0,
      },
      source: {
        canonicalDocumentVersion: preview.source?.canonicalDocumentVersion || null,
        legacyDescriptionFallback: Boolean(preview.source?.legacyDescriptionFallback),
        sourceHash: preview.source?.sourceHash || null,
        generatedAt: preview.source?.generatedAt || null,
      },
      overridesApplied: Boolean(preview.overridesApplied),
      warningCount: Array.isArray(preview.warnings) ? preview.warnings.length : 0,
      manualOverride: preview.manualOverride === true,
      stale: preview.stale === true,
      requiresManualReview: preview.requiresManualReview === true,
      propagation: {
        status: preview.propagation?.status || null,
        staleManualFields: Array.isArray(preview.propagation?.staleManualFields) ? preview.propagation.staleManualFields : [],
      },
    };
  }

  private extractImageUrls(catalogProduct: any): string[] {
    const candidates = [
      ...(Array.isArray(catalogProduct?.marketplaceProfiles?.allegro?.overrides?.images) ? catalogProduct.marketplaceProfiles.allegro.overrides.images : []),
      ...(Array.isArray(catalogProduct?.images) ? catalogProduct.images : []),
      ...(Array.isArray(catalogProduct?.media) ? catalogProduct.media : []),
    ];

    return candidates
      .map((entry: any) => {
        if (typeof entry === 'string') return entry;
        if (typeof entry?.url === 'string') return entry.url;
        if (typeof entry?.src === 'string') return entry.src;
        return null;
      })
      .filter((value: string | null): value is string => !!value)
      .slice(0, 16);
  }

  private toNonNegativeNumber(...values: unknown[]): number {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return numeric;
      }
    }
    return 0;
  }

  private buildCategoryChoice(dto: PrepareCatalogSellActionDto, draft: any, catalogProduct: any): any {
    const profileCategoryId = catalogProduct?.marketplaceProfiles?.allegro?.overrides?.categoryId;
    const selectedCategoryId = dto.categoryId || draft?.categoryId || profileCategoryId || catalogProduct?.allegroCategoryId || catalogProduct?.categoryId || null;
    return {
      selectedCategoryId,
      source: dto.categoryId
        ? 'request'
        : draft?.categoryId && draft.categoryId != 'UNASSIGNED'
          ? 'existing-draft'
          : profileCategoryId
            ? 'catalog-allegro-marketplace-profile'
            : catalogProduct?.allegroCategoryId || catalogProduct?.categoryId
            ? 'catalog'
            : '[MISSING: catalog category mapping contract]',
    };
  }

  private toDraftSummary(draft: any): any {
    if (!draft) return null;
    return {
      id: draft.id,
      accountId: draft.accountId || null,
      catalogProductId: draft.catalogProductId || null,
      allegroOfferId: draft.allegroOfferId || null,
      title: draft.title,
      description: draft.description || null,
      categoryId: draft.categoryId,
      price: draft.price,
      currency: draft.currency,
      quantity: draft.quantity,
      stockQuantity: draft.stockQuantity,
      publicationStatus: draft.publicationStatus,
      status: draft.status,
      updatedAt: draft.updatedAt,
    };
  }

  private toDraftUpdatePayload(dto: PrepareCatalogSellActionDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const field of ['title', 'description', 'categoryId', 'price', 'quantity'] as const) {
      if (dto[field] !== undefined) {
        payload[field] = dto[field];
      }
    }
    if (dto.quantity !== undefined) {
      payload.stockQuantity = dto.quantity;
    }
    return payload;
  }

  private toListingUrl(draft: any): string | null {
    const offerId = draft?.allegroOfferId || draft?.allegroListingId;
    if (!offerId) return null;
    return `https://allegro.cz/nabidka/${offerId}`;
  }

  private toCatalogSummary(catalogProduct: any): any {
    if (!catalogProduct) return null;
    return {
      id: catalogProduct.id || null,
      sku: catalogProduct.sku || null,
      title: catalogProduct.title || catalogProduct.name || null,
      brand: catalogProduct.brand || null,
      ean: catalogProduct.ean || null,
    };
  }

  private deriveNextAction(attempt: any): string {
    if (attempt.status === 'BLOCKED') return 'resolve_blockers';
    if (attempt.status === 'PREPARED') return 'confirm_publish';
    if (attempt.status === 'QUEUED' || attempt.status === 'RUNNING') return 'monitor_publish_queue';
    if (attempt.status === 'SUCCEEDED') return 'completed';
    if (attempt.status === 'FAILED') return 'review_failure';
    return 'inspect_status';
  }
}
