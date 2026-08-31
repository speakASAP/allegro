import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';

export interface WarehouseStockAuditInput {
  reasonCode?: string;
  reference?: string;
}

/**
 * API client for warehouse-microservice
 * Fetches stock levels and manages stock reservations
 */
@Injectable()
export class WarehouseClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = process.env.WAREHOUSE_SERVICE_URL || 'http://warehouse-microservice:3201';
  }

  private requestOptions(): Record<string, any> {
    // JWT_TOKEN is deliberately NOT in this chain. It holds the shared legacy
    // HS256 credential, which warehouse-microservice rejects (RS256 required).
    // Falling through to it turns a missing-credential misconfiguration into a
    // confusing 401 from warehouse instead of the loud failure below.
    const token =
      process.env.WAREHOUSE_SERVICE_TOKEN ||
      process.env.WAREHOUSE_INTERNAL_SERVICE_TOKEN ||
      process.env.INTERNAL_SERVICE_TOKEN;

    if (!token) {
      // Sending the request unauthenticated would surface as a confusing 401
      // from warehouse rather than as the misconfiguration it actually is.
      this.logger.error(
        'No warehouse credential configured (WAREHOUSE_SERVICE_TOKEN / WAREHOUSE_INTERNAL_SERVICE_TOKEN / INTERNAL_SERVICE_TOKEN); refusing to call warehouse-microservice unauthenticated',
        undefined,
        'WarehouseClient',
      );
      throw new Error('[MISSING: warehouse runtime credential]');
    }

    return {
      headers: {
        Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      },
    };
  }

  private normalizeReasonCode(value?: string): string {
    const normalized = String(value || 'WAREHOUSE_STOCK_SYNC')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100);

    return normalized || 'WAREHOUSE_STOCK_SYNC';
  }

  private normalizeReference(value?: string): string | undefined {
    const normalized = String(value || '').trim();
    return normalized ? normalized.slice(0, 200) : undefined;
  }

  private stockAuditPayload(audit?: string | WarehouseStockAuditInput): WarehouseStockAuditInput {
    if (typeof audit === 'string') {
      return {
        reasonCode: this.normalizeReasonCode(audit),
        reference: this.normalizeReference(audit),
      };
    }

    return {
      reasonCode: this.normalizeReasonCode(audit?.reasonCode),
      reference: this.normalizeReference(audit?.reference),
    };
  }

  /**
   * Get stock for a product across all warehouses
   */
  async getStockByProduct(productId: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/stock/${productId}`, this.requestOptions())
      );
      return response.data.data || [];
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // A 404 is genuinely "no stock rows for this product". Anything else --
      // above all 401/403 -- is a failed lookup, and returning [] for it makes
      // an outage indistinguishable from zero stock.
      if (status === 404) {
        this.logger.warn(`No stock rows for product ${productId}`, 'WarehouseClient');
        return [];
      }
      this.logger.error(
        `Stock lookup failed for product ${productId} (status ${status ?? 'none'}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
        'WarehouseClient',
      );
      throw error;
    }
  }

  /**
   * Get total available stock for a product
   */
  async getTotalAvailable(productId: string): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/stock/${productId}/total`, this.requestOptions())
      );
      return response.data.data?.totalAvailable || 0;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Returning 0 for a failed lookup reads as "out of stock" and silently
      // suppresses listings; only a real 404 means there is no such stock row.
      if (status === 404) {
        this.logger.warn(`No stock row for product ${productId}`, 'WarehouseClient');
        return 0;
      }
      this.logger.error(
        `Total stock lookup failed for product ${productId} (status ${status ?? 'none'}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
        'WarehouseClient',
      );
      throw error;
    }
  }

  /**
   * Reserve stock for an order
   */
  async reserveStock(productId: string, warehouseId: string, quantity: number, orderId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/stock/reserve`, {
          productId,
          warehouseId,
          quantity,
          orderId,
        }, this.requestOptions())
      );
      return response.data.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to reserve stock: ${errorMessage}`, errorStack, 'WarehouseClient');
      throw new HttpException(`Failed to reserve stock: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Release reserved stock
   */
  async unreserveStock(productId: string, warehouseId: string, quantity: number, orderId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/stock/unreserve`, {
          productId,
          warehouseId,
          quantity,
          orderId,
        }, this.requestOptions())
      );
      return response.data.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to unreserve stock: ${errorMessage}`, errorStack, 'WarehouseClient');
      throw new HttpException(`Failed to unreserve stock: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Set stock quantity (absolute value)
   */
  async setStock(productId: string, warehouseId: string, quantity: number, audit?: string | WarehouseStockAuditInput): Promise<any> {
    try {
      const auditPayload = this.stockAuditPayload(audit);
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/stock/set`, {
          productId,
          warehouseId,
          quantity,
          ...auditPayload,
        }, this.requestOptions())
      );
      return response.data.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to set stock: ${errorMessage}`, errorStack, 'WarehouseClient');
      throw new HttpException(`Failed to set stock: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Decrement stock (after order shipped)
   */
  async decrementStock(productId: string, warehouseId: string, quantity: number, reason?: string): Promise<any> {
    try {
      const auditPayload = this.stockAuditPayload(reason || 'ORDER_SHIPPED');
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/stock/decrement`, {
          productId,
          warehouseId,
          quantity,
          ...auditPayload,
        }, this.requestOptions())
      );
      return response.data.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to decrement stock: ${errorMessage}`, errorStack, 'WarehouseClient');
      throw new HttpException(`Failed to decrement stock: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get list of warehouses
   */
  async getWarehouses(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/warehouses`, this.requestOptions())
      );
      return response.data.data || [];
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Warehouse list lookup failed (status ${status ?? 'none'}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
        'WarehouseClient',
      );
      throw error;
    }
  }

  /**
   * Get default warehouse ID (from env or first active warehouse)
   */
  async getDefaultWarehouseId(): Promise<string | null> {
    // First try environment variable
    if (process.env.DEFAULT_WAREHOUSE_ID) {
      return process.env.DEFAULT_WAREHOUSE_ID;
    }

    // Fallback to first active warehouse
    try {
      const warehouses = await this.getWarehouses();
      if (warehouses.length > 0) {
        // Return first active warehouse (sorted by priority)
        return warehouses[0].id;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Default warehouse lookup failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
        'WarehouseClient',
      );
      throw error;
    }

    // Reached only when warehouse genuinely reports zero warehouses.
    return null;
  }
}
