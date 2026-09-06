import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';

export interface CatalogClientRequestOptions {
  authorization?: string;
  catalogScope?: 'own' | 'effective' | 'alfares' | 'community' | 'all';
  catalogSources?: string | string[];
}

export const CATALOG_PRODUCT_QUALITY_POLICY_ID = 'catalog.product_quality.v1';
export const CATALOG_PRODUCT_QUALITY_MANDATORY_BLOCKER_CODES = [
  'missing_sku',
  'duplicate_sku',
  'missing_title',
  'missing_description',
  'missing_current_price',
  'missing_image',
  'placeholder_image_only',
  'archived_product',
  'invalid_lifecycle_for_quality',
] as const;

const CATALOG_PRODUCT_QUALITY_MANDATORY_BLOCKER_SET = new Set<string>(CATALOG_PRODUCT_QUALITY_MANDATORY_BLOCKER_CODES);

export interface CatalogProductQualityIssue {
  code: string;
  field?: string;
  severity?: string;
  message?: string;
  source?: string;
}

export interface CatalogProductQualityPreflight {
  policyId: string;
  productId: string;
  canActivate: boolean;
  canPublish: boolean;
  blockingIssues: CatalogProductQualityIssue[];
  blockingMissingFields: string[];
  optionalOpportunities: CatalogProductQualityIssue[];
  nextAction: string;
  readiness: any;
  sourceEndpoint: string;
  reviewContractEndpoint: string;
  evaluatedAt: string;
}

/**
 * API client for catalog-microservice
 * Fetches product data from the central catalog
 */
@Injectable()
export class CatalogClientService {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly serviceName = process.env.CATALOG_CALLER_SERVICE_NAME || 'allegro-service';

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200';
    // Use CATALOG_SERVICE_TIMEOUT from env, or HTTP_TIMEOUT, or default to 5 seconds for local service
    // Local services on same Docker network should respond quickly (typically <100ms)
    // 5 seconds is enough to handle temporary slowdowns but fail fast if service is down
    this.timeout = parseInt(process.env.CATALOG_SERVICE_TIMEOUT || process.env.HTTP_TIMEOUT || '5000');
  }

  private requestOptions(extra: Record<string, any> = {}, options: CatalogClientRequestOptions = {}): Record<string, any> {
    const headers: Record<string, any> = {
      ...(extra.headers || {}),
    };
    const authorization = this.toAuthorizationHeader(options.authorization);

    // A caller-supplied user token wins: some catalog routes resolve per-user
    // settings and reject a service actor outright, so the human identity must
    // not be replaced by the service one.
    //
    // Otherwise this is a service-to-service call and uses the per-pair
    // principal for allegro-service -> catalog-microservice
    // (role internal:catalog-microservice:write -- this client POSTs and PUTs
    // products, media and pricing). The former x-internal-service-token
    // fallback is deliberately gone: it was one shared static secret held by
    // seven services plus a self-asserted x-service-name header, the shape
    // SERVICE_IDENTITY_CONSUMER_STANDARD.md prohibits. Catalog still accepts it
    // until the last caller migrates, so falling back would authenticate
    // successfully and hide the regression rather than surfacing it.
    if (authorization) {
      headers.Authorization = authorization;
    } else {
      const pairToken = (process.env.CATALOG_SERVICE_TOKEN || '').trim();
      if (pairToken) {
        headers.Authorization = pairToken.startsWith('Bearer ') ? pairToken : `Bearer ${pairToken}`;
      }
    }

    return {
      timeout: this.timeout,
      ...extra,
      headers,
    };
  }

  private catalogAccessParams(options: CatalogClientRequestOptions): Record<string, string> {
    const params: Record<string, string> = {};
    if (options.catalogScope) {
      params.catalogScope = options.catalogScope;
    }
    if (options.catalogSources) {
      params.catalogSources = Array.isArray(options.catalogSources) ? options.catalogSources.join(',') : options.catalogSources;
    }
    return params;
  }

  private toAuthorizationHeader(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
  }

  /**
   * Check if error is a connection/timeout error
   */
  private isServiceUnavailableError(error: any): boolean {
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ENOTFOUND')
    );
  }

  /**
   * Get product by ID
   */
  async getProductById(productId: string, options: CatalogClientRequestOptions = {}): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/${productId}`, this.requestOptions({ params: this.catalogAccessParams(options) }, options))
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting product ${productId}: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      this.logger.error(`Failed to get product ${productId}: ${errorMessage}`, errorStack, 'CatalogClient');
      throw new HttpException(`Product not found: ${productId}`, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Get product by SKU
   */
  async getProductBySku(sku: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/sku/${sku}`, this.requestOptions())
      );
      if (!response.data.success || !response.data.data) {
        return null;
      }
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting product by SKU ${sku}: ${errorMessage}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      this.logger.warn(`Product not found by SKU ${sku}: ${errorMessage}`, 'CatalogClient');
      return null;
    }
  }

  /**
   * Search products
   */
  async searchProducts(query: {
    search?: string;
    isActive?: boolean;
    categoryId?: string;
    page?: number;
    limit?: number;
    catalogScope?: CatalogClientRequestOptions['catalogScope'];
    catalogSources?: CatalogClientRequestOptions['catalogSources'];
  }): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    try {
      const params = new URLSearchParams();
      if (query.search) params.append('search', query.search);
      if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
      if (query.categoryId) params.append('categoryId', query.categoryId);
      if (query.page) params.append('page', String(query.page));
      if (query.limit) params.append('limit', String(query.limit));
      if (query.catalogScope) params.append('catalogScope', query.catalogScope);
      if (query.catalogSources) params.append('catalogSources', Array.isArray(query.catalogSources) ? query.catalogSources.join(',') : query.catalogSources);

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products?${params.toString()}`, this.requestOptions())
      );
      return {
        items: response.data.data || [],
        total: response.data.pagination?.total || 0,
        page: response.data.pagination?.page || 1,
        limit: response.data.pagination?.limit || 20,
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when searching products: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      this.logger.error(`Failed to search products: ${errorMessage}`, errorStack, 'CatalogClient');
      throw new HttpException(
        `Failed to search products: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create product in catalog
   */
  async createProduct(productData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/products`, productData, this.requestOptions())
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when creating product: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      this.logger.error(`Failed to create product: ${errorMessage}`, errorStack, 'CatalogClient');
      throw new HttpException(`Failed to create product: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Update product in catalog
   */
  async updateProduct(productId: string, productData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.put(`${this.baseUrl}/api/products/${productId}`, productData, this.requestOptions())
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when updating product ${productId}: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      this.logger.error(`Failed to update product ${productId}: ${errorMessage}`, errorStack, 'CatalogClient');
      throw new HttpException(`Failed to update product: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get product pricing
   */
  async getProductPricing(productId: string, options: CatalogClientRequestOptions = {}): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/pricing/product/${productId}/current`, this.requestOptions({}, options))
      );
      return response.data.data;
    } catch (error: any) {
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting pricing for product ${productId}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        return null; // Pricing is optional, don't throw
      }
      this.logger.warn(`Pricing not found for product ${productId}`, 'CatalogClient');
      return null;
    }
  }

  /**
   * Get product media
   */
  async getProductMedia(productId: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/media/product/${productId}`, this.requestOptions())
      );
      return response.data.data || [];
    } catch (error: any) {
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting media for product ${productId}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        return []; // Media is optional, don't throw
      }
      this.logger.warn(`Media not found for product ${productId}`, 'CatalogClient');
      return [];
    }
  }

  async createProductMedia(mediaData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/media`, mediaData, this.requestOptions())
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when creating media: ${errorMessage}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        throw new HttpException(`Catalog service is unavailable: ${errorMessage}`, HttpStatus.SERVICE_UNAVAILABLE);
      }
      this.logger.warn(`Failed to create catalog media: ${error.response?.data?.message || errorMessage}`, 'CatalogClient');
      throw new HttpException(`Failed to create catalog media: ${error.response?.data?.message || errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  async upsertProductPricing(pricingData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/pricing`, pricingData, this.requestOptions())
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when upserting pricing: ${errorMessage}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        throw new HttpException(`Catalog service is unavailable: ${errorMessage}`, HttpStatus.SERVICE_UNAVAILABLE);
      }
      this.logger.warn(`Failed to upsert catalog pricing: ${error.response?.data?.message || errorMessage}`, 'CatalogClient');
      throw new HttpException(`Failed to upsert catalog pricing: ${error.response?.data?.message || errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  async getProductReadiness(productId: string, options: CatalogClientRequestOptions = {}): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/${productId}/readiness`, this.requestOptions({}, options))
      );
      return response.data?.data || response.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting readiness for product ${productId}: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const status = error.status || error.response?.status || HttpStatus.BAD_GATEWAY;
      const responseMessage = error.response?.data?.message || error.response?.data?.error?.message || errorMessage;
      this.logger.warn(`Product readiness unavailable for ${productId}: ${responseMessage}`, 'CatalogClient');
      throw new HttpException(`Product readiness unavailable for ${productId}: ${responseMessage}`, status);
    }
  }

  async getProductQualityReview(query: Record<string, any> = {}, options: CatalogClientRequestOptions = {}): Promise<any> {
    try {
      const params: Record<string, any> = { ...query };
      for (const [key, value] of Object.entries(this.catalogAccessParams(options))) {
        if (params[key] === undefined) params[key] = value;
      }
      if (Array.isArray(params.catalogSources)) {
        params.catalogSources = params.catalogSources.join(',');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/review/quality`, this.requestOptions({ params }, options))
      );
      return {
        policyId: response.data?.policyId || CATALOG_PRODUCT_QUALITY_POLICY_ID,
        blockers: response.data?.blockers || [],
        items: response.data?.data || response.data?.items || [],
        pagination: response.data?.pagination || null,
        raw: response.data,
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting product quality review: ${errorMessage}`, errorStack, 'CatalogClient');
        throw new HttpException(
          `Catalog service is unavailable: ${errorMessage}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const status = error.status || error.response?.status || HttpStatus.BAD_GATEWAY;
      const responseMessage = error.response?.data?.message || error.response?.data?.error?.message || errorMessage;
      this.logger.warn(`Product quality review unavailable: ${responseMessage}`, 'CatalogClient');
      throw new HttpException(`Product quality review unavailable: ${responseMessage}`, status);
    }
  }

  async getProductQualityPreflight(productId: string, options: CatalogClientRequestOptions = {}): Promise<CatalogProductQualityPreflight> {
    const readiness = await this.getProductReadiness(productId, options);
    const issues = Array.isArray(readiness?.issues) ? readiness.issues : null;
    if (!issues) {
      throw new HttpException(
        `Catalog product readiness returned no issues array for ${productId}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const blockingIssues = issues
      .filter((issue: any) => issue?.severity === 'blocking' && CATALOG_PRODUCT_QUALITY_MANDATORY_BLOCKER_SET.has(String(issue?.code || '')))
      .map((issue: any) => this.toCatalogProductQualityIssue(issue));
    const optionalOpportunities = issues
      .filter((issue: any) => issue?.severity !== 'blocking')
      .map((issue: any) => this.toCatalogProductQualityIssue(issue));
    const blockingMissingFields: string[] = Array.from(new Set<string>(blockingIssues.map((issue) => this.productQualityFieldKey(issue))));

    return {
      policyId: CATALOG_PRODUCT_QUALITY_POLICY_ID,
      productId: String(readiness?.productId || productId),
      canActivate: blockingIssues.length === 0,
      canPublish: blockingIssues.length === 0,
      blockingIssues,
      blockingMissingFields,
      optionalOpportunities,
      nextAction: blockingIssues.length
        ? `resolve_catalog_quality_blockers:${blockingMissingFields.join(',')}`
        : 'ready_for_allegro_publish',
      readiness,
      sourceEndpoint: 'GET /api/products/:id/readiness',
      reviewContractEndpoint: 'GET /api/products/review/quality',
      evaluatedAt: new Date().toISOString(),
    };
  }

  private toCatalogProductQualityIssue(issue: any): CatalogProductQualityIssue {
    return {
      code: String(issue?.code || 'unknown_quality_issue'),
      field: issue?.field ? String(issue.field) : undefined,
      severity: issue?.severity ? String(issue.severity) : undefined,
      message: issue?.message ? String(issue.message) : undefined,
      source: issue?.source ? String(issue.source) : CATALOG_PRODUCT_QUALITY_POLICY_ID,
    };
  }

  private productQualityFieldKey(issue: CatalogProductQualityIssue): string {
    if (issue.code === 'missing_current_price') return 'price';
    if (issue.code === 'missing_image' || issue.code === 'placeholder_image_only') return 'image';
    return issue.field || issue.code;
  }

  async getProductMarketplaceFields(productId: string, marketplace: string, options: CatalogClientRequestOptions = {}): Promise<any | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/${productId}/marketplace-fields/${marketplace}`, this.requestOptions({}, options))
      );
      return response.data.data || response.data;
    } catch (error: any) {
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting ${marketplace} fields for product ${productId}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        return null;
      }
      this.logger.warn(`Marketplace fields not found for product ${productId}/${marketplace}: ${error.message}`, 'CatalogClient');
      return null;
    }
  }

  async getProductContentPreview(productId: string, marketplace: string, options: CatalogClientRequestOptions = {}): Promise<any | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/${productId}/content-previews/${marketplace}`, this.requestOptions({}, options))
      );
      return response.data?.data || response.data || null;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when getting ${marketplace} content preview for product ${productId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        return null;
      }
      this.logger.warn(`Content preview not found for product ${productId}/${marketplace}: ${error.response?.data?.message || errorMessage}`, 'CatalogClient');
      return null;
    }
  }

  async updateProductMarketplaceFields(productId: string, marketplace: string, fieldsData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.put(`${this.baseUrl}/api/products/${productId}/marketplace-fields/${marketplace}`, fieldsData, this.requestOptions())
      );
      return response.data.data;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.isServiceUnavailableError(error)) {
        this.logger.error(`Catalog service unavailable when updating ${marketplace} fields for product ${productId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined, 'CatalogClient');
        throw new HttpException(`Catalog service is unavailable: ${errorMessage}`, HttpStatus.SERVICE_UNAVAILABLE);
      }
      this.logger.warn(`Failed to update ${marketplace} fields for product ${productId}: ${error.response?.data?.message || errorMessage}`, 'CatalogClient');
      throw new HttpException(`Failed to update marketplace fields: ${error.response?.data?.message || errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }
}
