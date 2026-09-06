/**
 * Migration Script: Migrate all products from allegro-service to catalog-microservice
 *
 * This script migrates products from:
 * 1. Product table (deprecated) -> catalog-microservice
 * 2. AllegroProduct table -> catalog-microservice (if not already migrated)
 *
 * Usage:
 *   npm run migrate:products
 *   or
 *   ts-node scripts/migrate-products-to-catalog.ts
 *
 * The script is idempotent - it can be run multiple times safely.
 * It checks if products already exist in catalog-microservice before creating.
 */

import { PrismaClient } from '../shared/node_modules/.prisma/client';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

interface MigrationStats {
  totalProducts: number;
  totalAllegroProducts: number;
  totalOffers: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  stockSynced: number;
  stockSkipped: number;
  mediaCreated: number;
  mediaSkipped: number;
  marketplaceProfilesSynced: number;
  marketplaceProfilesSkipped: number;
  pricingSynced: number;
  pricingSkipped: number;
  errorDetails: Array<{ productId: string; sku: string; error: string }>;
}

interface CatalogMediaInput {
  type: 'image';
  url: string;
  thumbnailUrl?: string | null;
  altText?: string | null;
  title?: string | null;
  position: number;
  isPrimary: boolean;
  metadata?: Record<string, any>;
}

interface NormalizedRecord {
  source: 'allegro-product' | 'allegro-raw';
  legacyId: string;
  sku: string | null;
  ean: string | null;
  name: string | null;
  stockQuantity: number;
  price: number | null;
  currency: string | null;
  updatedAt?: string | null;
  needsManualReview: boolean;
  notes: string[];
  catalogPayload: any;
}

interface CatalogMappingRecord {
  source: 'Product' | 'AllegroProduct' | 'AllegroOffer';
  legacyId: string;
  sku: string;
  ean?: string | null;
  catalogProductId: string;
  stockQuantity: number;
}

class ProductMigrationService {
  private prisma: PrismaClient;
  private catalogClient: AxiosInstance;
  private loggingClient: AxiosInstance;
  private warehouseClient: AxiosInstance;
  private stats: MigrationStats;
  private dryRun: boolean;
  private exportOnly: boolean;
  private exportPath: string;
  private skipStock: boolean;
  private defaultWarehouseId: string | null = null;
  private mappingPath: string;
  private mappings: CatalogMappingRecord[] = [];
  private offerStockByProductId: Map<string, { stock: number; updatedAt?: Date }> = new Map();
  private offerStockByAllegroProductId: Map<string, { stock: number; updatedAt?: Date }> = new Map();

  constructor(
    dryRun: boolean = false,
    exportOnly: boolean = false,
    exportPath?: string,
    skipStock: boolean = false,
    mappingPath?: string,
  ) {
    this.dryRun = dryRun;
    this.exportOnly = exportOnly;
    this.exportPath = exportPath || path.resolve(process.cwd(), 'tmp/migration/allegro-products-normalized.json');
    this.skipStock = skipStock;
    this.mappingPath = mappingPath || path.resolve(process.cwd(), 'tmp/migration/allegro-catalog-mapping.json');

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    const catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200';
    this.catalogClient = axios.create({
      baseURL: catalogUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.configureCatalogAuthHeaders();

    const loggingUrl = process.env.LOGGING_SERVICE_URL || 'http://logging-microservice:3367';
    this.loggingClient = axios.create({
      baseURL: loggingUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const warehouseUrl = process.env.WAREHOUSE_SERVICE_URL || 'http://warehouse-microservice:3201';
    this.warehouseClient = axios.create({
      baseURL: warehouseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.stats = {
      totalProducts: 0,
      totalAllegroProducts: 0,
      totalOffers: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      stockSynced: 0,
      stockSkipped: 0,
      mediaCreated: 0,
      mediaSkipped: 0,
      marketplaceProfilesSynced: 0,
      marketplaceProfilesSkipped: 0,
      pricingSynced: 0,
      pricingSkipped: 0,
      errorDetails: [],
    };
  }

  private configureCatalogAuthHeaders(): void {
    // Per-pair principal for allegro-service -> catalog-microservice. No
    // fallback to the shared CATALOG_INTERNAL_SERVICE_TOKEN /
    // INTERNAL_SERVICE_TOKEN: that was one static secret held by seven services
    // with a self-asserted x-service-name header, the shape
    // SERVICE_IDENTITY_CONSUMER_STANDARD.md prohibits.
    const internalToken = process.env.CATALOG_SERVICE_TOKEN;
    if (!internalToken) {
      return;
    }

    this.catalogClient.defaults.headers.common['Authorization'] = internalToken.startsWith('Bearer ')
      ? internalToken
      : `Bearer ${internalToken}`;
  }

  /**
   * Centralized logging (console + logging microservice)
   */
  private async log(level: 'info' | 'warn' | 'error' | 'debug', message: string, metadata: Record<string, any> = {}) {
    const payload = {
      level,
      message,
      service: 'allegro-migration',
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        pid: process.pid,
      },
    };

    try {
      await this.loggingClient.post('/api/logs', payload);
    } catch {
      // ignore logging errors to keep migration flowing
    }

    const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}]`;
    // eslint-disable-next-line no-console
    console.log(prefix, message, Object.keys(metadata).length ? metadata : '');
  }

  private normalizeSku(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeEan(value?: string | null): string | null {
    if (!value) return null;
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 14) {
      return null;
    }
    return digitsOnly;
  }

  private firstText(...values: any[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private collectTextFromDescription(description: any): string | null {
    if (!description) return null;
    if (typeof description === 'string') return description.trim() || null;

    const sections = Array.isArray(description.sections) ? description.sections : [];
    const parts: string[] = [];
    for (const section of sections) {
      const items = Array.isArray(section?.items) ? section.items : [];
      for (const item of items) {
        if (typeof item?.content === 'string') {
          const text = item.content
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text) parts.push(text);
        }
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  private parameterValues(parameter: any): string[] {
    if (!parameter) return [];
    const directValues = Array.isArray(parameter.values) ? parameter.values : [];
    const directValueIds = Array.isArray(parameter.valuesIds) ? parameter.valuesIds : [];
    const rawValues = Array.isArray(parameter?.values) ? parameter.values : [];
    return [...directValues, ...directValueIds, ...rawValues]
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  private findParameterValue(parameters: any[] | undefined, names: string[], ids: string[] = []): string | null {
    if (!Array.isArray(parameters)) return null;
    const normalizedNames = names.map((name) => name.toLowerCase());
    const normalizedIds = ids.map((id) => id.toLowerCase());

    for (const parameter of parameters) {
      const name = String(parameter?.name || '').toLowerCase();
      const id = String(parameter?.parameterId || parameter?.id || '').toLowerCase();
      if (!normalizedNames.includes(name) && !normalizedIds.includes(id)) {
        continue;
      }

      const values = this.parameterValues(parameter);
      if (values.length > 0) {
        return values[0];
      }
    }

    return null;
  }

  private extractImageUrls(...sources: any[]): CatalogMediaInput[] {
    const urls: string[] = [];
    const addUrl = (value: any) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        urls.push(trimmed);
      }
    };

    const visit = (value: any) => {
      if (!value) return;
      if (typeof value === 'string') {
        addUrl(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') {
        addUrl(value.url);
        addUrl(value.originalUrl);
        addUrl(value.thumbnailUrl);
        addUrl(value.location);
        if (Array.isArray(value.images)) visit(value.images);
        if (Array.isArray(value.photos)) visit(value.photos);
        if (Array.isArray(value.pictures)) visit(value.pictures);
      }
    };

    sources.forEach(visit);

    return Array.from(new Set(urls)).map((url, index) => ({
      type: 'image',
      url,
      thumbnailUrl: null,
      altText: 'Allegro product image',
      title: 'Allegro image',
      position: index,
      isPrimary: index === 0,
      metadata: { source: 'allegro' },
    }));
  }

  private enrichWithAllegroData(base: any, source: any, offers: any[] = []): any {
    const rawData = source?.rawData || {};
    const parameters = Array.isArray(source?.parameters) ? source.parameters : [];
    const newestOffer = offers[0] || {};
    const offerRawData = newestOffer.rawData || {};
    const description = this.collectTextFromDescription(newestOffer.description)
      || this.collectTextFromDescription(offerRawData.description)
      || this.collectTextFromDescription(rawData.description);
    const brand = this.firstText(
      base.brand,
      source?.brand,
      rawData.brand,
      rawData.product?.brand,
      this.findParameterValue(parameters, ['brand', 'marka'])
    );
    const manufacturer = this.firstText(
      base.manufacturer,
      source?.manufacturer,
      source?.manufacturerCode,
      rawData.manufacturer,
      rawData.producer,
      rawData.product?.manufacturer,
      this.findParameterValue(parameters, ['manufacturer', 'producer', 'producent'])
    );
    const ean = this.normalizeEan(
      this.firstText(
        base.ean,
        source?.ean,
        rawData.ean,
        rawData.product?.ean,
        this.findParameterValue(parameters, ['ean', 'gtin'], ['225693'])
      )
    );

    return {
      ...base,
      description: description || base.description || null,
      brand: brand || null,
      manufacturer: manufacturer || null,
      ean: ean || base.ean || null,
    };
  }

  private extractMedia(source: any, offers: any[] = []): CatalogMediaInput[] {
    const rawData = source?.rawData || {};
    const offerImages = offers.flatMap((offer) => [offer.images, offer.rawData?.images, offer.rawData?.productSet]);
    return this.extractImageUrls(source?.images, rawData.images, rawData.photos, rawData.product?.images, rawData.productSet, ...offerImages);
  }

  private firstDefined(...values: any[]): any {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  private extractAllegroParameters(source: any, offers: any[] = []): any[] {
    const rawData = source?.rawData || {};
    const productSetParameters = (offers || [])
      .flatMap((offer) => Array.isArray(offer.rawData?.productSet) ? offer.rawData.productSet : [])
      .flatMap((item) => item?.product?.parameters || item?.parameters || []);
    return [
      ...(Array.isArray(source?.parameters) ? source.parameters : []),
      ...(Array.isArray(rawData.parameters) ? rawData.parameters : []),
      ...(Array.isArray(rawData.product?.parameters) ? rawData.product.parameters : []),
      ...productSetParameters,
    ];
  }

  private buildCanonicalAliases() {
    return {
      title: {
        canonicalPath: 'title',
        aliases: ['name', 'productName', 'product', 'goods', 'goodsName', 'idName', 'název', 'nazwa', 'товар', 'название'],
      },
      description: {
        canonicalPath: 'description',
        aliases: ['description', 'longDescription', 'opis', 'popis', 'описание'],
      },
      brand: {
        canonicalPath: 'brand',
        aliases: ['brand', 'marka', 'značka', 'марка'],
      },
      manufacturer: {
        canonicalPath: 'manufacturer',
        aliases: ['manufacturer', 'manufacturerCode', 'producer', 'producent', 'výrobce', 'производитель'],
      },
      ean: {
        canonicalPath: 'ean',
        aliases: ['ean', 'gtin', 'EAN (GTIN)', 'barcode', 'kod kreskowy', 'штрихкод'],
      },
      sku: {
        canonicalPath: 'sku',
        aliases: ['sku', 'code', 'product_code', 'catalogCode', 'external.id'],
      },
    };
  }

  private buildAllegroMarketplaceProfile(source: any, offers: any[] = [], catalogData: any = {}) {
    const newestOffer = offers[0] || {};
    const rawData = source?.rawData || {};
    const newestRaw = newestOffer.rawData || {};
    const parameters = this.extractAllegroParameters(source, offers);
    const media = this.extractMedia(source, offers);
    const categoryId = this.firstText(
      newestOffer.categoryId,
      newestRaw.category?.id,
      rawData.category?.id,
      rawData.product?.category?.id,
    );
    const price = this.firstDefined(
      newestOffer.price != null ? Number(newestOffer.price) : undefined,
      newestRaw.sellingMode?.price?.amount != null ? Number(newestRaw.sellingMode.price.amount) : undefined,
      newestRaw.price?.amount != null ? Number(newestRaw.price.amount) : undefined,
    );
    const currency = this.firstText(
      newestOffer.currency,
      newestRaw.sellingMode?.price?.currency,
      newestRaw.price?.currency,
    );
    const quantity = this.firstDefined(
      newestOffer.stockQuantity,
      newestOffer.quantity,
      newestRaw.stock?.available,
      newestRaw.quantity,
    );

    return {
      canonical: {
        title: catalogData.title,
        description: catalogData.description,
        brand: catalogData.brand,
        manufacturer: catalogData.manufacturer,
        ean: catalogData.ean,
      },
      overrides: {
        categoryId,
        parameters,
        price,
        currency,
        quantity,
        images: media.map((item) => item.url),
        sellingMode: newestRaw.sellingMode || null,
        delivery: newestOffer.deliveryOptions || newestRaw.delivery || null,
        payments: newestOffer.paymentOptions || newestRaw.payments || null,
        location: newestRaw.location || null,
        responsibleProducer: newestRaw.productSet?.[0]?.responsibleProducer || rawData.responsibleProducer || null,
        publication: newestRaw.publication || { status: newestOffer.publicationStatus || newestOffer.status || null },
        afterSalesServices: newestRaw.afterSalesServices || null,
        taxSettings: newestRaw.taxSettings || null,
      },
      externalRefs: {
        allegroProductId: source?.allegroProductId || newestRaw.productSet?.[0]?.product?.id || rawData.product?.id || null,
        allegroOfferIds: offers.map((offer) => offer.allegroOfferId).filter(Boolean),
        listingIds: offers.map((offer) => offer.allegroListingId).filter(Boolean),
        accountIds: Array.from(new Set(offers.map((offer) => offer.accountId).filter(Boolean))),
        categoryIds: Array.from(new Set([categoryId, ...offers.map((offer) => offer.categoryId)].filter(Boolean))),
      },
      sourceData: {
        importedAt: new Date().toISOString(),
        source: 'allegro-service',
        aliases: this.buildCanonicalAliases(),
        product: {
          id: source?.id,
          allegroProductId: source?.allegroProductId,
          name: source?.name,
          brand: source?.brand,
          manufacturerCode: source?.manufacturerCode,
          ean: source?.ean,
          publicationStatus: source?.publicationStatus,
          isAiCoCreated: source?.isAiCoCreated,
          marketedBeforeGPSR: source?.marketedBeforeGPSR,
          rawData,
          parameters,
        },
        offers: offers.map((offer) => ({
          id: offer.id,
          allegroOfferId: offer.allegroOfferId,
          allegroListingId: offer.allegroListingId,
          title: offer.title,
          categoryId: offer.categoryId,
          price: offer.price != null ? Number(offer.price) : null,
          currency: offer.currency,
          quantity: offer.quantity,
          stockQuantity: offer.stockQuantity,
          status: offer.status,
          publicationStatus: offer.publicationStatus,
          deliveryOptions: offer.deliveryOptions,
          paymentOptions: offer.paymentOptions,
          images: offer.images,
          rawData: offer.rawData,
          accountId: offer.accountId,
          syncStatus: offer.syncStatus,
          syncSource: offer.syncSource,
          lastSyncedAt: offer.lastSyncedAt,
        })),
      },
      status: 'imported',
    };
  }

  private extractPrice(source: any, offers: any[] = []): { amount: number; currency: string } | null {
    const profile = this.buildAllegroMarketplaceProfile(source, offers, {});
    const amount = Number(profile.overrides.price);
    const currency = String(profile.overrides.currency || '').trim().toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      return null;
    }
    return { amount, currency };
  }

  /**
   * Check if product exists in catalog-microservice by SKU or EAN
   */
  private async findProductInCatalog(sku: string, ean?: string | null): Promise<any | null> {
    try {
      // Try by SKU first
      const skuResponse = await this.catalogClient.get(`/api/products/sku/${sku}`);
      if (skuResponse.data?.success && skuResponse.data?.data) {
        return skuResponse.data.data;
      }
    } catch (error: any) {
      // Product not found by SKU, continue
    }

    // Try by EAN if provided
    if (ean) {
      try {
        const searchResponse = await this.catalogClient.get(`/api/products?search=${ean}&limit=100`);
        const items = searchResponse.data?.data || [];
        const found = items.find((p: any) => p.ean === ean);
        if (found) {
          return found;
        }
      } catch (error: any) {
        // Product not found by EAN, continue
      }
    }

    return null;
  }

  private async findAllegroProductInCatalog(sku: string, ean: string | null | undefined, offers: any[] = []): Promise<any | null> {
    const direct = await this.findProductInCatalog(sku, ean);
    if (direct) {
      return direct;
    }

    for (const offer of offers) {
      if (!offer?.allegroOfferId) {
        continue;
      }
      const offerSku = `ALLEGRO-OFFER-${offer.allegroOfferId}`;
      const found = await this.findProductInCatalog(offerSku, ean);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Map Product table data to catalog-microservice format
   */
  private mapProductToCatalog(product: any): any {
    const catalogProduct: any = {
      sku: product.code || `ALLEGRO-${product.id}`,
      title: product.name || 'Product',
      description: product.description || product.shortDescription || null,
      brand: product.brand || null,
      manufacturer: product.manufacturer || null,
      ean: product.ean || null,
      isActive: product.active !== false,
    };

    // Map weight
    if (product.weight) {
      catalogProduct.weightKg = Number(product.weight);
    }

    // Map dimensions
    if (product.height || product.width || product.depth || product.length) {
      catalogProduct.dimensionsCm = {
        height: product.height ? Number(product.height) : undefined,
        width: product.width ? Number(product.width) : undefined,
        depth: product.depth ? Number(product.depth) : undefined,
        length: product.length ? Number(product.length) : undefined,
      };
    }

    // Map SEO data
    if (product.seoTitle || product.seoDescription || product.seoKeywords) {
      catalogProduct.seoData = {
        metaTitle: product.seoTitle || null,
        metaDescription: product.seoDescription || null,
        keywords: product.seoKeywords ? (typeof product.seoKeywords === 'string' ? product.seoKeywords.split(',') : product.seoKeywords) : [],
      };
    }

    // Map tags
    if (product.tags) {
      if (Array.isArray(product.tags)) {
        catalogProduct.tags = product.tags;
      } else if (typeof product.tags === 'string') {
        catalogProduct.tags = product.tags.split(',').map((t: string) => t.trim());
      }
    }

    return catalogProduct;
  }

  /**
   * Map AllegroProduct data to catalog-microservice format
   */
  private mapAllegroProductToCatalog(allegroProduct: any): any {
    const catalogProduct: any = {
      sku: allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`,
      title: allegroProduct.name || 'Product',
      brand: allegroProduct.brand || null,
      manufacturer: allegroProduct.manufacturerCode || null,
      ean: allegroProduct.ean || null,
      isActive: true,
    };

    return catalogProduct;
  }

  private mapAllegroOfferToCatalog(offer: any, productSource?: any): any {
    const base = {
      sku: `ALLEGRO-OFFER-${offer.allegroOfferId}`,
      title: offer.title || offer.rawData?.name || 'Product',
      description: this.collectTextFromDescription(offer.description) || this.collectTextFromDescription(offer.rawData?.description) || null,
      brand: productSource?.brand || null,
      manufacturer: productSource?.manufacturerCode || null,
      ean: productSource?.ean || null,
      isActive: offer.status !== 'ENDED',
    };
    return this.enrichWithAllegroData(base, productSource || offer, [offer]);
  }

  private async syncCatalogMedia(catalogProductId: string, mediaItems: CatalogMediaInput[], sku: string): Promise<void> {
    if (this.dryRun) {
      this.stats.mediaSkipped += mediaItems.length;
      return;
    }

    if (mediaItems.length === 0) {
      return;
    }

    let existing: any[] = [];
    try {
      const response = await this.catalogClient.get(`/api/media/product/${catalogProductId}`);
      existing = response.data?.data || [];
    } catch (error: any) {
      this.stats.mediaSkipped += mediaItems.length;
      await this.log('warn', 'Failed to fetch existing catalog media; skipping media sync', {
        sku,
        catalogProductId,
        error: error?.message || String(error),
      });
      return;
    }

    const existingUrls = new Set(existing.map((item) => item.url).filter(Boolean));
    for (const item of mediaItems) {
      if (existingUrls.has(item.url)) {
        this.stats.mediaSkipped++;
        continue;
      }

      try {
        await this.catalogClient.post('/api/media', {
          productId: catalogProductId,
          ...item,
        });
        existingUrls.add(item.url);
        this.stats.mediaCreated++;
      } catch (error: any) {
        this.stats.mediaSkipped++;
        await this.log('warn', 'Failed to create catalog media', {
          sku,
          catalogProductId,
          url: item.url,
          error: error.response?.data?.message || error.message || String(error),
        });
      }
    }
  }

  private async syncMarketplaceProfile(catalogProductId: string, profile: any, sku: string): Promise<void> {
    if (this.dryRun) {
      this.stats.marketplaceProfilesSkipped++;
      return;
    }

    try {
      await this.catalogClient.put(`/api/products/${catalogProductId}/marketplace-fields/allegro`, profile);
      this.stats.marketplaceProfilesSynced++;
    } catch (error: any) {
      this.stats.marketplaceProfilesSkipped++;
      await this.log('warn', 'Failed to sync Allegro marketplace profile', {
        sku,
        catalogProductId,
        error: error.response?.data?.message || error.response?.data?.error?.message || error.message || String(error),
      });
    }
  }

  private async syncCatalogPricing(catalogProductId: string, price: { amount: number; currency: string } | null, sku: string): Promise<void> {
    if (this.dryRun) {
      if (price) {
        this.stats.pricingSkipped++;
      }
      return;
    }

    if (!price) {
      this.stats.pricingSkipped++;
      return;
    }

    try {
      const currentResponse = await this.catalogClient.get(`/api/pricing/product/${catalogProductId}/current`);
      const current = currentResponse.data?.data;
      const currentAmount = current?.basePrice != null ? Number(current.basePrice) : null;
      const currentCurrency = current?.currency ? String(current.currency).toUpperCase() : null;
      if (current?.isActive && currentAmount === price.amount && currentCurrency === price.currency) {
        this.stats.pricingSkipped++;
        return;
      }
    } catch {
      // No current price or pricing endpoint unavailable; try to write below.
    }

    try {
      await this.catalogClient.post('/api/pricing', {
        productId: catalogProductId,
        basePrice: price.amount,
        currency: price.currency,
        priceType: 'regular',
        isActive: true,
        validFrom: new Date().toISOString(),
      });
      this.stats.pricingSynced++;
    } catch (error: any) {
      this.stats.pricingSkipped++;
      await this.log('warn', 'Failed to sync Allegro price to Catalog pricing', {
        sku,
        catalogProductId,
        amount: price.amount,
        currency: price.currency,
        error: error.response?.data?.message || error.response?.data?.error?.message || error.message || String(error),
      });
    }
  }

  /**
   * Create or update product in catalog-microservice
   */
  private async createOrUpdateProduct(productData: any, existingProduct?: any): Promise<any> {
    if (this.dryRun) {
      // In dry-run mode, just return mock data
      return {
        id: existingProduct?.id || 'mock-id-' + Date.now(),
        ...productData,
      };
    }

    try {
      if (existingProduct) {
        // Update existing product
        const response = await this.catalogClient.put(`/api/products/${existingProduct.id}`, productData);
        return response.data?.data;
      } else {
        // Create new product
        const response = await this.catalogClient.post('/api/products', productData);
        return response.data?.data;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new Error(errorMessage);
    }
  }

  /**
   * Resolve default warehouse ID for stock synchronization
   */
  private async resolveDefaultWarehouseId(): Promise<void> {
    if (this.skipStock) {
      return;
    }

    if (process.env.DEFAULT_WAREHOUSE_ID) {
      this.defaultWarehouseId = process.env.DEFAULT_WAREHOUSE_ID;
      return;
    }

    try {
      const response = await this.warehouseClient.get('/api/warehouses');
      const warehouses = response.data?.data || [];
      if (warehouses.length > 0) {
        this.defaultWarehouseId = warehouses[0].id;
        return;
      }
      await this.log('warn', 'No active warehouses found; stock sync will be skipped');
    } catch (error: any) {
      await this.log('warn', 'Failed to resolve default warehouse; stock sync skipped', {
        error: error?.message || String(error),
      });
    }
    this.defaultWarehouseId = null;
  }

  private getProductStock(product: any): number {
    const offerStock = this.offerStockByProductId.get(product.id)?.stock;
    const stock = offerStock ?? product.stockQuantity ?? 0;
    return Number.isFinite(stock) ? Number(stock) : 0;
  }

  private getAllegroProductStock(allegroProduct: any): number {
    const offerStock = this.offerStockByAllegroProductId.get(allegroProduct.id)?.stock;
    const stock = offerStock ?? 0;
    return Number.isFinite(stock) ? Number(stock) : 0;
  }

  /**
   * Sync stock to warehouse-microservice
   */
  private async syncWarehouseStock(catalogProductId: string, quantity: number, sku: string, source: string): Promise<void> {
    if (this.dryRun || this.skipStock) {
      this.stats.stockSkipped++;
      return;
    }

    if (!this.defaultWarehouseId) {
      this.stats.stockSkipped++;
      await this.log('warn', 'Default warehouse not resolved; skipping stock sync', {
        sku,
        catalogProductId,
      });
      return;
    }

    try {
      await this.warehouseClient.post('/api/stock/set', {
        productId: catalogProductId,
        warehouseId: this.defaultWarehouseId,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        reason: `Initial migration from ${source}`,
      });
      this.stats.stockSynced++;
      await this.log('info', 'Stock synced to warehouse-microservice', {
        sku,
        catalogProductId,
        warehouseId: this.defaultWarehouseId,
        quantity,
      });
    } catch (error: any) {
      this.stats.stockSkipped++;
      await this.log('warn', 'Failed to sync stock', {
        sku,
        catalogProductId,
        warehouseId: this.defaultWarehouseId,
        error: error?.message || String(error),
      });
    }
  }

  private recordMapping(record: CatalogMappingRecord): void {
    this.mappings.push(record);
  }

  private saveMappings(): void {
    if (this.dryRun) {
      console.log(`\nℹ️  Dry-run: mapping not written (target: ${this.mappingPath})`);
      return;
    }

    fs.mkdirSync(path.dirname(this.mappingPath), { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      defaultWarehouseId: this.defaultWarehouseId,
      total: this.mappings.length,
      items: this.mappings,
    };
    fs.writeFileSync(this.mappingPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\n✅ Mapping saved to ${this.mappingPath}`);
  }

  /**
   * Migrate a single product from Product table
   */
  private async migrateProduct(product: any): Promise<void> {
    const sku = product.code || `ALLEGRO-${product.id}`;
    
    try {
      // Check if product already exists in catalog
      const existing = await this.findProductInCatalog(sku, product.ean);

      // Map product data
      const relatedOffers = await this.prisma.allegroOffer.findMany({
        where: { productId: product.id },
        orderBy: { updatedAt: 'desc' },
      });
      const catalogData = this.enrichWithAllegroData(this.mapProductToCatalog(product), product, relatedOffers);

      // Create or update
      const catalogProduct = await this.createOrUpdateProduct(catalogData, existing);

      const quantity = this.getProductStock(product);
      await this.syncWarehouseStock(catalogProduct.id, quantity, sku, 'allegro Product');
      await this.syncCatalogMedia(catalogProduct.id, this.extractMedia(product, relatedOffers), sku);
      await this.syncMarketplaceProfile(catalogProduct.id, this.buildAllegroMarketplaceProfile(product, relatedOffers, catalogData), sku);
      await this.syncCatalogPricing(catalogProduct.id, this.extractPrice(product, relatedOffers), sku);

      this.recordMapping({
        source: 'Product',
        legacyId: product.id,
        sku,
        ean: product.ean,
        catalogProductId: catalogProduct.id,
        stockQuantity: quantity,
      });

      if (existing) {
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} product: ${sku} (${product.name})`);
      } else {
        this.stats.created++;
        const action = this.dryRun ? 'Would create' : 'Created';
        console.log(`✅ ${action} product: ${sku} (${product.name})`);
      }
    } catch (error: any) {
      this.stats.errors++;
      this.stats.errorDetails.push({
        productId: product.id,
        sku,
        error: error.message,
      });
      console.error(`❌ Error migrating product ${sku}: ${error.message}`);
    }
  }

  /**
   * Migrate a single AllegroProduct
   */
  private async migrateAllegroProduct(allegroProduct: any): Promise<void> {
    const sku = allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`;
    
    try {
      const relatedOffers = await this.prisma.allegroOffer.findMany({
        where: { allegroProductId: allegroProduct.id },
        orderBy: { updatedAt: 'desc' },
      });

      // Check if product already exists in catalog. Earlier imports used offer IDs as SKUs.
      const existing = await this.findAllegroProductInCatalog(sku, allegroProduct.ean, relatedOffers);

      // Map product data
      const catalogData = this.enrichWithAllegroData(this.mapAllegroProductToCatalog(allegroProduct), allegroProduct, relatedOffers);
      if (existing?.sku) {
        catalogData.sku = existing.sku;
      }

      // Create or update
      const catalogProduct = await this.createOrUpdateProduct(catalogData, existing);

      const quantity = this.getAllegroProductStock(allegroProduct);
      await this.syncWarehouseStock(catalogProduct.id, quantity, sku, 'allegro AllegroProduct');
      await this.syncCatalogMedia(catalogProduct.id, this.extractMedia(allegroProduct, relatedOffers), sku);
      await this.syncMarketplaceProfile(catalogProduct.id, this.buildAllegroMarketplaceProfile(allegroProduct, relatedOffers, catalogData), sku);
      await this.syncCatalogPricing(catalogProduct.id, this.extractPrice(allegroProduct, relatedOffers), sku);
      await this.syncRelatedOfferCatalogProducts(relatedOffers, catalogProduct.id, allegroProduct);

      this.recordMapping({
        source: 'AllegroProduct',
        legacyId: allegroProduct.id,
        sku,
        ean: allegroProduct.ean,
        catalogProductId: catalogProduct.id,
        stockQuantity: quantity,
      });

      if (existing) {
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} AllegroProduct: ${sku} (${allegroProduct.name || allegroProduct.allegroProductId})`);
      } else {
        this.stats.created++;
        const action = this.dryRun ? 'Would create' : 'Created';
        console.log(`✅ ${action} AllegroProduct: ${sku} (${allegroProduct.name || allegroProduct.allegroProductId})`);
      }
    } catch (error: any) {
      this.stats.errors++;
      this.stats.errorDetails.push({
        productId: allegroProduct.id,
        sku,
        error: error.message,
      });
      console.error(`❌ Error migrating AllegroProduct ${sku}: ${error.message}`);
    }
  }

  private async migrateAllegroOffer(offer: any): Promise<void> {
    const sku = `ALLEGRO-OFFER-${offer.allegroOfferId}`;

    try {
      const existing = await this.findProductInCatalog(sku, null);
      const catalogData = this.mapAllegroOfferToCatalog(offer);
      if (existing?.sku) {
        catalogData.sku = existing.sku;
      }

      const catalogProduct = await this.createOrUpdateProduct(catalogData, existing);
      await this.syncWarehouseStock(catalogProduct.id, Number(offer.stockQuantity || 0), sku, 'allegro AllegroOffer');
      await this.syncCatalogMedia(catalogProduct.id, this.extractMedia(offer, [offer]), sku);
      await this.syncMarketplaceProfile(catalogProduct.id, this.buildAllegroMarketplaceProfile(offer, [offer], catalogData), sku);
      await this.syncCatalogPricing(catalogProduct.id, this.extractPrice(offer, [offer]), sku);

      this.recordMapping({
        source: 'AllegroOffer',
        legacyId: offer.id,
        sku,
        ean: null,
        catalogProductId: catalogProduct.id,
        stockQuantity: Number(offer.stockQuantity || 0),
      });

      if (existing) {
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} AllegroOffer: ${sku} (${offer.title || offer.allegroOfferId})`);
      } else {
        this.stats.created++;
        const action = this.dryRun ? 'Would create' : 'Created';
        console.log(`✅ ${action} AllegroOffer: ${sku} (${offer.title || offer.allegroOfferId})`);
      }
    } catch (error: any) {
      this.stats.errors++;
      this.stats.errorDetails.push({
        productId: offer.id,
        sku,
        error: error.message,
      });
      console.error(`❌ Error migrating AllegroOffer ${sku}: ${error.message}`);
    }
  }

  private async syncRelatedOfferCatalogProducts(offers: any[], primaryCatalogProductId: string, productSource: any): Promise<void> {
    for (const offer of offers) {
      if (!offer?.allegroOfferId) {
        continue;
      }

      const sku = `ALLEGRO-OFFER-${offer.allegroOfferId}`;
      const existing = await this.findProductInCatalog(sku, null);
      if (!existing || existing.id === primaryCatalogProductId) {
        continue;
      }

      try {
        const catalogData = this.mapAllegroOfferToCatalog(offer, productSource);
        catalogData.sku = existing.sku;
        const catalogProduct = await this.createOrUpdateProduct(catalogData, existing);
        await this.syncCatalogMedia(catalogProduct.id, this.extractMedia(offer, [offer]), sku);
        await this.syncMarketplaceProfile(catalogProduct.id, this.buildAllegroMarketplaceProfile(productSource || offer, [offer], catalogData), sku);
        await this.syncCatalogPricing(catalogProduct.id, this.extractPrice(productSource || offer, [offer]), sku);
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} related AllegroOffer catalog product: ${sku} (${offer.title || offer.allegroOfferId})`);
      } catch (error: any) {
        this.stats.errors++;
        this.stats.errorDetails.push({
          productId: offer.id,
          sku,
          error: error.message,
        });
        console.error(`❌ Error syncing related AllegroOffer catalog product ${sku}: ${error.message}`);
      }
    }
  }

  /**
   * Migrate all products from Product table
   */
  private async migrateProductsTable(): Promise<void> {
    console.log('\n📦 Migrating products from Product table...\n');

    if (!(this.prisma as any).product) {
      this.stats.totalProducts = 0;
      console.log('Legacy Product model is not available in Prisma schema; skipping Product table\n');
      return;
    }

    const products = await this.prisma.product.findMany({
      orderBy: { createdAt: 'asc' },
    });

    this.stats.totalProducts = products.length;
    console.log(`Found ${products.length} products to migrate\n`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[${i + 1}/${products.length}] Processing product: ${product.code || product.id}`);
      await this.migrateProduct(product);
      
      // ⚠️ NOTE: This small delay is for rate limiting only - if delays are needed, check logs!
      // Issues are NOT timing issues - we have max 30 items, Docker network is fast.
      // ⚠️ NOTE: This small delay is for rate limiting only - if delays are needed, check logs!
      // Issues are NOT timing issues - we have max 30 items, Docker network is fast.
      // Small delay to avoid overwhelming the API
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Migrate all products from AllegroProduct table
   */
  private async migrateAllegroProductsTable(): Promise<void> {
    console.log('\n📦 Migrating products from AllegroProduct table...\n');

    const allegroProducts = await this.prisma.allegroProduct.findMany({
      include: { parameters: true },
      orderBy: { createdAt: 'asc' },
    });

    this.stats.totalAllegroProducts = allegroProducts.length;
    console.log(`Found ${allegroProducts.length} AllegroProducts to migrate\n`);

    for (let i = 0; i < allegroProducts.length; i++) {
      const allegroProduct = allegroProducts[i];
      console.log(`[${i + 1}/${allegroProducts.length}] Processing AllegroProduct: ${allegroProduct.allegroProductId}`);

      await this.migrateAllegroProduct(allegroProduct);
      
      // Small delay to avoid overwhelming the API
      if (i < allegroProducts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private async migrateUnlinkedAllegroOffersTable(): Promise<void> {
    console.log('\n📦 Migrating unlinked products from AllegroOffer table...\n');

    const offers = await this.prisma.allegroOffer.findMany({
      where: { allegroProductId: null },
      orderBy: { updatedAt: 'desc' },
    });

    this.stats.totalOffers = offers.length;
    console.log(`Found ${offers.length} unlinked AllegroOffers to migrate\n`);

    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];
      console.log(`[${i + 1}/${offers.length}] Processing AllegroOffer: ${offer.allegroOfferId}`);
      await this.migrateAllegroOffer(offer);

      if (i < offers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Print migration statistics
   */
  private printStats(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Statistics');
    console.log('='.repeat(60));
    console.log(`Total Products (Product table): ${this.stats.totalProducts}`);
    console.log(`Total AllegroProducts: ${this.stats.totalAllegroProducts}`);
    console.log(`Total unlinked AllegroOffers: ${this.stats.totalOffers}`);
    console.log(`✅ Created: ${this.stats.created}`);
    console.log(`🔄 Updated: ${this.stats.updated}`);
    console.log(`⏭️  Skipped: ${this.stats.skipped}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log(`📦 Stock synced: ${this.stats.stockSynced}`);
    console.log(`📦 Stock skipped: ${this.stats.stockSkipped}`);
    console.log(`🖼️  Media created: ${this.stats.mediaCreated}`);
    console.log(`🖼️  Media skipped: ${this.stats.mediaSkipped}`);
    console.log(`🧩 Marketplace profiles synced: ${this.stats.marketplaceProfilesSynced}`);
    console.log(`🧩 Marketplace profiles skipped: ${this.stats.marketplaceProfilesSkipped}`);
    console.log(`💰 Pricing synced: ${this.stats.pricingSynced}`);
    console.log(`💰 Pricing skipped: ${this.stats.pricingSkipped}`);
    console.log('='.repeat(60));

    if (this.stats.errorDetails.length > 0) {
      console.log('\n❌ Error Details:');
      this.stats.errorDetails.forEach((error, index) => {
        console.log(`${index + 1}. Product ID: ${error.productId}, SKU: ${error.sku}`);
        console.log(`   Error: ${error.error}\n`);
      });
    }
  }

  /**
   * Run the migration
   */
  async run(): Promise<void> {
    try {
      if (this.exportOnly) {
        await this.exportNormalizedData();
        return;
      }

      const mode = this.dryRun ? '🔍 DRY-RUN MODE (no changes will be made)' : '🚀 LIVE MODE';
      console.log(`${mode} - Starting product migration to catalog-microservice...\n`);
      console.log(`Catalog Service URL: ${process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200'}\n`);
      
      if (this.dryRun) {
        console.log('⚠️  DRY-RUN MODE: No products will be created or updated in catalog-microservice\n');
      }

      // Test connection to catalog-microservice
      try {
        await this.catalogClient.get('/api/products?limit=1');
        console.log('✅ Connected to catalog-microservice\n');
      } catch (error: any) {
        console.warn('⚠️  Could not connect to catalog-microservice, continuing anyway...');
        console.warn(`   Error: ${error.message}\n`);
      }

      // Load offer stock snapshots to prefer freshest stock values
      const offers = await this.prisma.allegroOffer.findMany({
        select: {
          allegroProductId: true,
          stockQuantity: true,
          updatedAt: true,
        },
      });
      const { byProductId, byAllegroProductId } = this.buildOfferStockMaps(offers);
      this.offerStockByProductId = byProductId;
      this.offerStockByAllegroProductId = byAllegroProductId;

      // Resolve default warehouse for stock sync
      await this.resolveDefaultWarehouseId();

      // Migrate Product table
      await this.migrateProductsTable();

      // Migrate AllegroProduct table
      await this.migrateAllegroProductsTable();

      // Migrate offers that do not have an AllegroProduct row but already exist in Catalog by offer SKU
      await this.migrateUnlinkedAllegroOffersTable();

      // Print statistics
      this.printStats();

      // Persist mapping for downstream linking
      this.saveMappings();

      console.log('\n✅ Migration completed!');
    } catch (error: any) {
      console.error('\n❌ Migration failed:', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private dedupeRecords(records: NormalizedRecord[]): NormalizedRecord[] {
    const recordMap = new Map<string, NormalizedRecord>();

    for (const record of records) {
      const key = record.sku || record.ean;
      if (!key) {
        recordMap.set(`__missing__${record.legacyId}`, record);
        continue;
      }

      const existing = recordMap.get(key);
      if (!existing) {
        recordMap.set(key, record);
        continue;
      }

      const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentUpdated = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
      const chooseCurrent =
        record.stockQuantity > existing.stockQuantity ||
        (record.stockQuantity === existing.stockQuantity && currentUpdated > existingUpdated);

      if (chooseCurrent) {
        recordMap.set(key, record);
      }
    }

    return Array.from(recordMap.values());
  }

  private buildOfferStockMaps(offers: any[]) {
    const byProductId = new Map<string, { stock: number; updatedAt?: Date }>();
    const byAllegroProductId = new Map<string, { stock: number; updatedAt?: Date }>();

    offers.forEach((offer) => {
      const { productId, allegroProductId, stockQuantity, updatedAt } = offer;
      if (productId) {
        const existing = byProductId.get(productId);
        if (!existing || stockQuantity > existing.stock || (stockQuantity === existing.stock && updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt))) {
          byProductId.set(productId, { stock: stockQuantity, updatedAt });
        }
      }

      if (allegroProductId) {
        const existing = byAllegroProductId.get(allegroProductId);
        if (!existing || stockQuantity > existing.stock || (stockQuantity === existing.stock && updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt))) {
          byAllegroProductId.set(allegroProductId, { stock: stockQuantity, updatedAt });
        }
      }
    });

    return { byProductId, byAllegroProductId };
  }

  private async exportNormalizedData(): Promise<void> {
    await this.log('info', 'Starting export-only mode for allegro products', {
      exportPath: this.exportPath,
    });

    const [products, allegroProducts, offers] = await Promise.all([
      (this.prisma as any).product
        ? (this.prisma as any).product.findMany({ orderBy: { updatedAt: 'desc' } })
        : Promise.resolve([]),
      this.prisma.allegroProduct.findMany({ include: { parameters: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.allegroOffer.findMany({
        select: {
          allegroProductId: true,
          stockQuantity: true,
          updatedAt: true,
          price: true,
          currency: true,
        },
      }),
    ]);

    const { byProductId, byAllegroProductId } = this.buildOfferStockMaps(offers);

    const rawRecords: NormalizedRecord[] = [];

    for (const product of products) {
      const sku = this.normalizeSku(product.code || `ALLEGRO-${product.id}`);
      const ean = this.normalizeEan(product.ean);
      const stock = byProductId.get(product.id)?.stock ?? product.stockQuantity ?? 0;
      const payload = this.mapProductToCatalog(product);
      const notes: string[] = [];
      if (!sku && !ean) {
        notes.push('Missing SKU and EAN');
      }

      rawRecords.push({
        source: 'allegro-product',
        legacyId: product.id,
        sku,
        ean,
        name: product.name || null,
        stockQuantity: stock,
        price: product.sellingPrice ? Number(product.sellingPrice) : null,
        currency: product.sellingPriceCurrency || 'CZK',
        updatedAt: product.updatedAt ? product.updatedAt.toISOString() : null,
        needsManualReview: !sku && !ean,
        notes,
        catalogPayload: payload,
      });
    }

    for (const allegroProduct of allegroProducts) {
      const sku = this.normalizeSku(allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`);
      const ean = this.normalizeEan(allegroProduct.ean);
      const stock = byAllegroProductId.get(allegroProduct.id)?.stock ?? 0;
      const payload = this.mapAllegroProductToCatalog(allegroProduct);
      const notes: string[] = [];
      if (!ean) {
        notes.push('No EAN found on AllegroProduct');
      }

      rawRecords.push({
        source: 'allegro-raw',
        legacyId: allegroProduct.id,
        sku,
        ean,
        name: allegroProduct.name || null,
        stockQuantity: stock,
        price: null,
        currency: null,
        updatedAt: allegroProduct.updatedAt ? allegroProduct.updatedAt.toISOString() : null,
        needsManualReview: !ean,
        notes,
        catalogPayload: payload,
      });
    }

    const deduped = this.dedupeRecords(rawRecords);
    const payload = {
      generatedAt: new Date().toISOString(),
      sourceTotals: {
        products: products.length,
        allegroProducts: allegroProducts.length,
        offers: offers.length,
      },
      totalRaw: rawRecords.length,
      totalNormalized: deduped.length,
      records: deduped,
    };

    fs.mkdirSync(path.dirname(this.exportPath), { recursive: true });
    fs.writeFileSync(this.exportPath, JSON.stringify(payload, null, 2), 'utf-8');

    await this.log('info', 'Export completed', {
      exportPath: this.exportPath,
      totalRaw: rawRecords.length,
      totalNormalized: deduped.length,
    });
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const exportOnly = args.includes('--export-only') || args.includes('--export');
  const skipStock = args.includes('--skip-stock');

  let exportPath: string | undefined;
  const outputArgIndex = args.findIndex((arg) => arg === '--output' || arg === '-o');
  const inlineOutputArg = args.find((arg) => arg.startsWith('--output='));
  let mappingPath: string | undefined;
  const mappingArgIndex = args.findIndex((arg) => arg === '--mapping-output' || arg === '-m');
  const inlineMappingArg = args.find((arg) => arg.startsWith('--mapping-output='));

  if (inlineOutputArg) {
    exportPath = inlineOutputArg.split('=')[1];
  } else if (outputArgIndex !== -1 && args[outputArgIndex + 1]) {
    exportPath = args[outputArgIndex + 1];
  }

  if (inlineMappingArg) {
    mappingPath = inlineMappingArg.split('=')[1];
  } else if (mappingArgIndex !== -1 && args[mappingArgIndex + 1]) {
    mappingPath = args[mappingArgIndex + 1];
  }

  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode - no changes will be made\n');
  }

  if (exportOnly) {
    console.log(`📤 Export-only mode enabled. Output file: ${exportPath || 'tmp/migration/allegro-products-normalized.json'}\n`);
  }

  if (skipStock) {
    console.log('ℹ️  Stock sync disabled via --skip-stock');
  }

  const migration = new ProductMigrationService(dryRun, exportOnly, exportPath, skipStock, mappingPath);
  migration.run()
    .then(() => {
      if (dryRun) {
        console.log('\n✅ Dry-run completed successfully - no changes were made');
        console.log('   Run without --dry-run to perform actual migration');
      } else {
        console.log('\n✅ Migration script finished successfully');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { ProductMigrationService };
