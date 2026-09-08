import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';

const CREATE_ORDER_CONTRACT_VERSION = 'orders.create.v1';
const DEFAULT_CHANNEL_ACCOUNT_ID = 'default';
export const ORDERS_LIFECYCLE_READ_UNAVAILABLE = '[MISSING: Orders lifecycle read contract/client method]';

export interface CentralOrderLifecycleReadResult {
  available: boolean;
  order: any | null;
  reason?: string;
  statusCode?: number | null;
}

interface CreateCentralOrderRequest {
  externalOrderId: string;
  channel: string;
  channelAccountId?: string;
  customer?: any;
  shippingAddress?: any;
  billingAddress?: any;
  items: Array<{
    productId: string;
    sku?: string;
    title: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    warehouseId: string;
  }>;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  currency: string;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingMethod?: string;
  customerNote?: string;
  orderedAt?: Date;
}

/**
 * API client for orders-microservice.
 * Sends the Orders create contract idempotency fields so callers can retry safely.
 */
@Injectable()
export class OrderClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = process.env.ORDER_SERVICE_URL || 'http://orders-microservice:3203';
  }

  /** S2S: auth-microservice/docs/SERVICE_IDENTITY_CONSUMER_STANDARD.md */
  private resolveOrdersBearerToken(): string {
    const token = process.env.ORDERS_SERVICE_TOKEN?.trim();
    if (!token) {
      this.logger.error(
        'ORDERS_SERVICE_TOKEN is unset; refusing to call orders-microservice '
          + 'unauthenticated. Set the per-pair RS256 principal for '
          + 'allegro-service -> orders-microservice.',
        undefined,
        'OrderClient',
      );
      throw new HttpException('[MISSING: Orders runtime credential]', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return token;
  }

  private requestOptions(extra: Record<string, any> = {}): Record<string, any> {
    const bearer = this.resolveOrdersBearerToken();
    return {
      ...extra,
      headers: {
        ...(extra.headers || {}),
        authorization: bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`,
      },
    };
  }

  async createOrder(orderData: CreateCentralOrderRequest): Promise<any> {
    const payload = {
      contractVersion: CREATE_ORDER_CONTRACT_VERSION,
      ...orderData,
      channelAccountId: this.normalizeChannelAccountId(orderData.channelAccountId),
    };

    const requestOptions = this.requestOptions();
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.baseUrl + '/api/orders', payload, requestOptions),
      );
      this.logger.log('Order accepted by orders-microservice: ' + response.data.data?.id, 'OrderClient');
      return response.data.data;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const status = error?.response?.status;
      const message = status === HttpStatus.CONFLICT
        ? 'ORDER_IDEMPOTENCY_CONFLICT'
        : error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to create order in orders-microservice: ' + message, stack, 'OrderClient');
      throw new HttpException('Failed to create order: ' + message, status || HttpStatus.BAD_REQUEST);
    }
  }

  async getOrderLifecycle(orderId: string): Promise<CentralOrderLifecycleReadResult> {
    const normalizedOrderId = orderId?.trim();
    if (!normalizedOrderId) {
      return {
        available: false,
        order: null,
        reason: '[MISSING: central Orders id mapping]',
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          this.baseUrl + '/api/orders/' + encodeURIComponent(normalizedOrderId) + '/lifecycle',
          this.requestOptions(),
        ),
      );
      const order = response.data?.data || response.data || null;
      return {
        available: Boolean(order),
        order,
        reason: order ? undefined : ORDERS_LIFECYCLE_READ_UNAVAILABLE,
      };
    } catch (error: any) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
        throw error;
      }
      const status = error?.response?.status || null;
      const message = status ? `status_${status}` : error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Orders lifecycle read unavailable for central order ${normalizedOrderId}: ${message}`, 'OrderClient');
      return { available: false, order: null, reason: ORDERS_LIFECYCLE_READ_UNAVAILABLE, statusCode: status };
    }
  }

  private normalizeChannelAccountId(channelAccountId?: string): string {
    const normalized = channelAccountId?.trim();
    return normalized || DEFAULT_CHANNEL_ACCOUNT_ID;
  }
}
