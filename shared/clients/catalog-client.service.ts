import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';

/**
 * API client for catalog-microservice
 * Fetches product data from the central catalog
 */
@Injectable()
export class CatalogClientService {
  private readonly baseUrl: string;
  private readonly timeout: number;

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
  async getProductById(productId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products/${productId}`, {
          timeout: this.timeout,
        })
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
        this.httpService.get(`${this.baseUrl}/api/products/sku/${sku}`, {
          timeout: this.timeout,
        })
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
  }): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    try {
      const params = new URLSearchParams();
      if (query.search) params.append('search', query.search);
      if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
      if (query.categoryId) params.append('categoryId', query.categoryId);
      if (query.page) params.append('page', String(query.page));
      if (query.limit) params.append('limit', String(query.limit));

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/products?${params.toString()}`, {
          timeout: this.timeout,
        })
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
        this.httpService.post(`${this.baseUrl}/api/products`, productData, {
          timeout: this.timeout,
        })
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
        this.httpService.put(`${this.baseUrl}/api/products/${productId}`, productData, {
          timeout: this.timeout,
        })
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
  async getProductPricing(productId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/pricing/product/${productId}/current`, {
          timeout: this.timeout,
        })
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
        this.httpService.get(`${this.baseUrl}/api/media/product/${productId}`, {
          timeout: this.timeout,
        })
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
}

