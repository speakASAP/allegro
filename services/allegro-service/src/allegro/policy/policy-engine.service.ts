import { Injectable } from '@nestjs/common';
import { CatalogClientService, PrismaService } from '@allegro/shared';
import { PublishLifecycleAction } from '../publish-lifecycle/publish-lifecycle.dto';

type CatalogProductQualityPreflight = {
  policyId?: string;
  productId?: string;
  canActivate?: boolean;
  canPublish?: boolean;
  blockingIssues?: Array<{ code?: string }>;
  blockingMissingFields?: string[];
  nextAction?: string;
  sourceEndpoint?: string;
  reviewContractEndpoint?: string;
  target?: { type?: string; contract?: string };
  productType?: string;
  contract?: string;
  resourceType?: string;
};

const CATALOG_BUNDLE_CONTRACT = 'catalog.bundle.v1';

export type MarketplacePolicyStatus = 'PASS' | 'BLOCK' | 'WARN' | 'RECOMMEND';

export type MarketplacePolicyGateResult = {
  gate: string;
  status: MarketplacePolicyStatus;
  ownerService: string;
  remediation: string;
  reason?: string;
  evidence?: Record<string, unknown>;
};

export type MarketplacePolicyInput = {
  action: PublishLifecycleAction;
  offer?: any | null;
  accountId?: string | null;
  catalogProductId?: string | null;
  requestedByUserId: string;
};

export type MarketplacePolicyEvaluation = {
  version: 'TASK-003.v1';
  evaluatedAt: string;
  action: PublishLifecycleAction;
  target: {
    offerId: string | null;
    allegroOfferId: string | null;
    accountId: string | null;
    catalogProductId: string | null;
  };
  results: MarketplacePolicyGateResult[];
  summary: {
    blockers: number;
    warnings: number;
    recommendations: number;
  };
};

@Injectable()
export class MarketplacePolicyEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogClient: CatalogClientService,
  ) {}

  async evaluate(input: MarketplacePolicyInput): Promise<MarketplacePolicyEvaluation> {
    const results: MarketplacePolicyGateResult[] = [];
    const now = new Date();

    results.push(await this.evaluateCatalogGate(input));
    results.push(await this.evaluateCatalogProductQualityGate(input));
    results.push(await this.evaluateCatalogBundlePublicationGate(input));
    results.push(await this.evaluateAccountGate(input, now));
    results.push(this.pass('rate-limit-readiness', 'allegro-service', 'Confirmed attempts enter the governed queue before Allegro execution.', {
      policy: 'Allegro account max 1 request per second unless an approved newer policy exists',
    }));

    const duplicateGate = await this.evaluateDuplicateGate(input);
    if (duplicateGate) results.push(duplicateGate);

    results.push(...this.evaluateOfferGates(input));

    if (input.action === 'UPDATE') {
      results.push(this.pass('update-terminal-contract', 'allegro-service', 'Remote updates execute through terminal lifecycle result handling.', {
        terminalStatuses: ['SUCCEEDED', 'FAILED'],
      }));
    }

    results.push(this.warn(
      'legacy-direct-path-review',
      'allegro-service',
      'Legacy mutation paths must stay wrapped by the governed lifecycle.',
      'Keep POST and PUT offer mutation endpoints lifecycle-routed or explicitly local-only.',
    ));

    return {
      version: 'TASK-003.v1',
      evaluatedAt: now.toISOString(),
      action: input.action,
      target: {
        offerId: input.offer?.id || null,
        allegroOfferId: input.offer?.allegroOfferId || null,
        accountId: input.accountId || input.offer?.accountId || null,
        catalogProductId: input.catalogProductId || input.offer?.catalogProductId || null,
      },
      results,
      summary: {
        blockers: results.filter((result) => result.status === 'BLOCK').length,
        warnings: results.filter((result) => result.status === 'WARN').length,
        recommendations: results.filter((result) => result.status === 'RECOMMEND').length,
      },
    };
  }

  private async evaluateCatalogGate(input: MarketplacePolicyInput): Promise<MarketplacePolicyGateResult> {
    if (!input.catalogProductId) {
      return this.block('catalog-validation', 'catalog-microservice', 'catalogProductId is required before Allegro offer mutation', 'Attach the offer to an approved catalog product before preparing the mutation.');
    }

    try {
      const product = await this.catalogClient.getProductById(input.catalogProductId);
      return product
        ? this.pass('catalog-validation', 'catalog-microservice', 'Catalog product exists.', { catalogProductId: input.catalogProductId, productFound: true })
        : this.block('catalog-validation', 'catalog-microservice', 'catalog product was not returned', 'Resolve the catalog product mapping before preparing the mutation.', { catalogProductId: input.catalogProductId, productFound: false });
    } catch (error: any) {
      return this.block('catalog-validation', 'catalog-microservice', `catalog validation unavailable: ${error.message}`, 'Retry after catalog-microservice is reachable or resolve the product mapping with the catalog owner.', {
        catalogProductId: input.catalogProductId,
        errorCode: error.status || error.response?.status || 'CATALOG_UNAVAILABLE',
      });
    }
  }

  private async evaluateCatalogProductQualityGate(input: MarketplacePolicyInput): Promise<MarketplacePolicyGateResult> {
    if (!input.catalogProductId) {
      return this.block('catalog-product-quality', 'catalog-microservice', 'catalogProductId is required for Catalog product quality preflight', 'Attach the offer to a Catalog product before preparing Allegro publication.');
    }

    try {
      const getProductQualityPreflight = (this.catalogClient as any).getProductQualityPreflight;
      if (typeof getProductQualityPreflight !== 'function') {
        throw new Error('[MISSING: CatalogClientService.getProductQualityPreflight]');
      }
      const preflight = await getProductQualityPreflight.call(this.catalogClient, input.catalogProductId);
      const blockingIssues = Array.isArray(preflight.blockingIssues) ? preflight.blockingIssues : [];
      const evidence = this.catalogQualityEvidence(preflight);
      if (blockingIssues.length > 0 || preflight.canPublish !== true) {
        const codes = blockingIssues.map((issue) => issue.code).filter(Boolean).join(',') || 'catalog_quality_preflight_not_publishable';
        return this.block(
          'catalog-product-quality',
          'catalog-microservice',
          `${preflight.policyId} blockers remain: ${codes}`,
          'Resolve mandatory Catalog product quality blockers before preparing Allegro publication.',
          evidence,
        );
      }

      return this.pass('catalog-product-quality', 'catalog-microservice', 'Catalog product quality preflight passed.', evidence);
    } catch (error: any) {
      return this.block(
        'catalog-product-quality',
        'catalog-microservice',
        `catalog product quality preflight unavailable: ${error.message}`,
        'Retry after Catalog product quality readiness is reachable; Allegro must fail closed meanwhile.',
        {
          policyId: 'catalog.product_quality.v1',
          catalogProductId: input.catalogProductId,
          errorCode: error.status || error.response?.status || 'CATALOG_QUALITY_UNAVAILABLE',
        },
      );
    }
  }

  private catalogQualityEvidence(preflight: CatalogProductQualityPreflight): Record<string, unknown> {
    return {
      policyId: preflight.policyId,
      productId: preflight.productId,
      canActivate: preflight.canActivate,
      canPublish: preflight.canPublish,
      blockingIssueCodes: Array.isArray(preflight.blockingIssues) ? preflight.blockingIssues.map((issue) => issue.code) : [],
      blockingMissingFields: Array.isArray(preflight.blockingMissingFields) ? preflight.blockingMissingFields : [],
      nextAction: preflight.nextAction,
      sourceEndpoint: preflight.sourceEndpoint,
      reviewContractEndpoint: preflight.reviewContractEndpoint,
    };
  }

  private async evaluateCatalogBundlePublicationGate(input: MarketplacePolicyInput): Promise<MarketplacePolicyGateResult> {
    if (!input.catalogProductId) {
      return this.block('catalog-bundle-publication-policy', 'catalog-microservice', 'catalogProductId is required before bundle policy evaluation', 'Attach the offer to a Catalog product before preparing Allegro publication.');
    }

    try {
      const preflight = await this.loadCatalogBundlePolicySource(input.catalogProductId);
      const evidence = this.catalogBundlePublicationEvidence(preflight);
      if (!this.isCatalogBundleContract(preflight)) {
        return this.pass('catalog-bundle-publication-policy', 'allegro-service', 'Catalog target is not catalog.bundle.v1.', evidence);
      }

      return this.block(
        'catalog-bundle-publication-policy',
        'allegro-service',
        'Allegro external marketplace bundle publication is blocked for catalog.bundle.v1.',
        'Keep the Catalog bundle as an operator suggestion or Catalog-owned aggregate until Allegro has an owner-approved one-listing bundle contract with Catalog, Orders, Warehouse, Payments, and shipping policy.',
        {
          ...evidence,
          allowedUse: 'operator_suggestion_or_local_draft_review_only',
          forbiddenUse: 'external_allegro_offer_or_listing_publication',
          missingContracts: [
            '[MISSING: Allegro one-listing bundle representation contract for catalog.bundle.v1]',
            '[MISSING: Warehouse bundle reservation/stock allocation contract]',
            '[MISSING: Orders bundle create-order and line-item decomposition contract]',
            '[MISSING: Payments/free-shipping/discount total contract]',
          ],
        },
      );
    } catch (error: any) {
      return this.block(
        'catalog-bundle-publication-policy',
        'catalog-microservice',
        `catalog bundle publication policy source unavailable: ${error.message}`,
        'Retry after Catalog readiness is reachable; Allegro must fail closed meanwhile.',
        {
          catalogProductId: input.catalogProductId,
          contract: CATALOG_BUNDLE_CONTRACT,
          errorCode: error.status || error.response?.status || 'CATALOG_BUNDLE_POLICY_UNAVAILABLE',
        },
      );
    }
  }

  private async loadCatalogBundlePolicySource(catalogProductId: string): Promise<any> {
    const getProductQualityPreflight = (this.catalogClient as any).getProductQualityPreflight;
    if (typeof getProductQualityPreflight === 'function') {
      return getProductQualityPreflight.call(this.catalogClient, catalogProductId);
    }
    return this.catalogClient.getProductById(catalogProductId);
  }

  private catalogBundlePublicationEvidence(source: any): Record<string, unknown> {
    return {
      policyId: 'allegro.catalog_bundle_publication.v1',
      catalogProductId: source?.productId || source?.id || null,
      contract: this.catalogContract(source),
      targetType: source?.target?.type || source?.productType || source?.type || source?.resourceType || null,
      sourceEndpoint: source?.sourceEndpoint || 'GET /api/products/:id/readiness',
      evaluatedSource: source?.policyId || source?.contract || 'catalog-product',
    };
  }

  private isCatalogBundleContract(source: any): boolean {
    return this.catalogContract(source) === CATALOG_BUNDLE_CONTRACT
      || source?.target?.type === 'bundle'
      || source?.productType === 'bundle'
      || source?.type === 'bundle';
  }

  private catalogContract(source: any): string | null {
    const candidates = [
      source?.target?.contract,
      source?.target?.type,
      source?.contract,
      source?.resourceType,
      source?.productType,
      source?.type,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return candidates.find((value) => value === CATALOG_BUNDLE_CONTRACT) || null;
  }

  private async evaluateAccountGate(input: MarketplacePolicyInput, now: Date): Promise<MarketplacePolicyGateResult> {
    if (!input.accountId) {
      return this.block('account-readiness', 'allegro-service', 'accountId is required before Allegro offer mutation', 'Select an active Allegro account before preparing the mutation.');
    }

    const prismaAny = this.prisma as any;
    const account = await prismaAny.allegroAccount.findFirst({
      where: { id: input.accountId, userId: input.requestedByUserId },
      select: { id: true, isActive: true, tokenExpiresAt: true },
    });
    const tokenExpiresAt = account?.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
    const tokenPresent = account
      ? (await prismaAny.allegroAccount.count({ where: { id: account.id, accessToken: { not: null } } })) > 0
      : false;
    const hasUsableToken = !!account?.isActive && tokenPresent && (!tokenExpiresAt || tokenExpiresAt > now);

    return hasUsableToken
      ? this.pass('account-readiness', 'allegro-service', 'Account exists and token state is usable.', { accountId: input.accountId, accountFound: true, tokenState: 'present' })
      : this.block('account-readiness', 'allegro-service', account ? 'OAuth token missing or expired' : 'account not found for requester', 'Re-authorize or select an active Allegro account before preparing the mutation.', {
          accountId: input.accountId,
          accountFound: !!account,
          tokenState: hasUsableToken ? 'present' : 'missing_or_expired',
        });
  }

  private async evaluateDuplicateGate(input: MarketplacePolicyInput): Promise<MarketplacePolicyGateResult | null> {
    const prismaAny = this.prisma as any;
    if (!input.catalogProductId || !input.accountId || !prismaAny.allegroOffer?.count) {
      return this.recommend('duplicate-offer-check', 'allegro-service', 'Duplicate check needs catalog product and account context.', 'Run duplicate checks when catalogProductId and accountId are available.');
    }

    const duplicateCount = await prismaAny.allegroOffer.count({
      where: {
        catalogProductId: input.catalogProductId,
        accountId: input.accountId,
        id: input.offer?.id ? { not: input.offer.id } : undefined,
      },
    });

    return duplicateCount > 0
      ? this.block('duplicate-offer-check', 'allegro-service', 'another local Allegro offer already targets this catalog product and account', 'Review the existing offer before creating or publishing a duplicate listing.', { duplicateCount })
      : this.pass('duplicate-offer-check', 'allegro-service', 'No duplicate local offer found for catalog product and account.', { duplicateCount });
  }

  private evaluateOfferGates(input: MarketplacePolicyInput): MarketplacePolicyGateResult[] {
    if (!input.offer) {
      return [
        this.recommend('offer-readiness', 'allegro-service', 'No local offer snapshot was available for field-level readiness checks.', 'Run offer readiness checks when an offer draft exists.'),
      ];
    }

    const offer = input.offer;
    const gates: MarketplacePolicyGateResult[] = [];

    gates.push(!this.present(offer.categoryId) || offer.categoryId === 'UNASSIGNED'
      ? this.block('category-readiness', 'catalog-microservice', 'missing category', 'Map the catalog product to an Allegro category before preparing mutation.')
      : this.pass('category-readiness', 'catalog-microservice', 'Category is present.', { categoryId: offer.categoryId }));

    gates.push(!this.present(offer.title)
      ? this.block('attribute-readiness', 'catalog-microservice', 'missing title', 'Complete required title and attributes in catalog or the local offer draft.')
      : this.pass('attribute-readiness', 'catalog-microservice', 'Required title is present.'));

    const media = Array.isArray(offer.images) ? offer.images : [];
    gates.push(media.length === 0
      ? this.warn('media-readiness', 'catalog-microservice', 'missing local image evidence', 'Attach approved product media before publish to improve listing conversion and reduce policy risk.')
      : this.pass('media-readiness', 'catalog-microservice', 'Local image evidence is present.', { imageCount: media.length }));

    const stockQuantity = Number(offer.stockQuantity ?? offer.quantity);
    gates.push(Number.isFinite(stockQuantity) && stockQuantity >= 0
      ? this.pass('stock-readiness', 'warehouse-microservice', 'Stock quantity is non-negative.', { stockQuantity })
      : this.block('stock-readiness', 'warehouse-microservice', 'invalid stock quantity', 'Resolve warehouse availability before preparing Allegro mutation.'));

    const price = Number(offer.price);
    gates.push(Number.isFinite(price) && price > 0
      ? this.pass('price-margin-readiness', 'catalog-microservice', 'Price is positive; margin validation awaits TASK-006 contracts.', { price, currency: offer.currency || 'PLN', marginContract: 'TASK-006' })
      : this.block('price-margin-readiness', 'catalog-microservice', 'invalid price', 'Set a positive catalog-backed price before preparing Allegro mutation.'));

    gates.push(offer.deliveryOptions || offer.rawData?.delivery
      ? this.pass('delivery-readiness', 'allegro-service', 'Delivery evidence is present.')
      : this.warn('delivery-readiness', 'allegro-service', 'missing delivery evidence', 'Attach delivery options before publish.'));

    gates.push(offer.paymentOptions || offer.rawData?.payments
      ? this.pass('payment-readiness', 'allegro-service', 'Payment evidence is present.')
      : this.warn('payment-readiness', 'allegro-service', 'missing payment evidence', 'Attach payment options before publish.'));

    gates.push(input.action === 'PUBLISH' && !offer.responsibleProducerId
      ? this.warn('gpsr-producer-readiness', 'allegro-service', 'responsible producer evidence is missing', 'Add responsible producer/GPSR evidence before publishing categories that require it.')
      : this.pass('gpsr-producer-readiness', 'allegro-service', 'Responsible producer gate is non-blocking for this snapshot.', { responsibleProducerId: offer.responsibleProducerId || null }));

    return gates;
  }

  private present(value: unknown): boolean {
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
  }

  private pass(gate: string, ownerService: string, remediation: string, evidence?: Record<string, unknown>): MarketplacePolicyGateResult {
    return { gate, status: 'PASS', ownerService, remediation, evidence };
  }

  private block(gate: string, ownerService: string, reason: string, remediation: string, evidence?: Record<string, unknown>): MarketplacePolicyGateResult {
    return { gate, status: 'BLOCK', ownerService, reason, remediation, evidence };
  }

  private warn(gate: string, ownerService: string, reason: string, remediation: string, evidence?: Record<string, unknown>): MarketplacePolicyGateResult {
    return { gate, status: 'WARN', ownerService, reason, remediation, evidence };
  }

  private recommend(gate: string, ownerService: string, reason: string, remediation: string, evidence?: Record<string, unknown>): MarketplacePolicyGateResult {
    return { gate, status: 'RECOMMEND', ownerService, reason, remediation, evidence };
  }
}
