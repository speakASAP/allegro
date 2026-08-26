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
  private readonly serviceName =
    process.env.ORDER_SERVICE_CALLER_SERVICE_NAME ||
    process.env.ALLEGRO_CALLER_SERVICE_NAME ||
    'allegro-service';

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = process.env.ORDER_SERVICE_URL || 'http://orders-microservice:3203';
  }

  /**
   * Per-pair RS256 principal for allegro-service -> orders-microservice, sent as
   * `Authorization: Bearer`. orders verifies it via /auth/validate and reads the
   * roles from the token, so a leak is revoked by deactivating one principal in
   * the auth DB rather than by editing env vars in four repos at once.
   */
  private resolveOrdersBearerToken(): string | null {
    return process.env.ORDERS_SERVICE_TOKEN?.trim() || null;
  }

  /**
   * Legacy shared static secret, compared byte-for-byte by orders'
   * `resolveInternalServiceActor`. The same value is held by allegro-imports,
   * orders and marketing, so it cannot be rotated for one caller alone. Retained
   * only as a cutover fallback; remove once ORDERS_SERVICE_TOKEN is mounted
   * everywhere and the lane is confirmed green.
   */
  private resolveInternalServiceToken(): string | null {
    const token =
      process.env.ALLEGRO_INTERNAL_SERVICE_TOKEN ||
      process.env.ORDERS_INTERNAL_SERVICE_TOKEN ||
      process.env.ORDER_SERVICE_INTERNAL_TOKEN ||
      process.env.INTERNAL_SERVICE_TOKEN;
    const normalized = token?.trim();
    return normalized || null;
  }

  private requestOptions(extra: Record<string, any> = {}): Record<string, any> | null {
    const bearer = this.resolveOrdersBearerToken();
    if (bearer) {
      return {
        ...extra,
        headers: {
          ...(extra.headers || {}),
          authorization: `Bearer ${bearer}`,
          'x-service-name': this.serviceName,
        },
      };
    }

    const token = this.resolveInternalServiceToken();
    if (!token) {
      return null;
    }

    this.logger.warn(
      'ORDERS_SERVICE_TOKEN is not set; falling back to the shared static ' +
        'x-internal-service-token for orders-microservice. This credential is shared ' +
        'with three other pods and cannot be revoked per caller.',
      'OrderClient',
    );

    return {
      ...extra,
      headers: {
        ...(extra.headers || {}),
        'x-internal-service-token': token,
        'x-service-name': this.serviceName,
      },
    };
  }

  private requireCreateOrderRequestOptions(): Record<string, any> {
    const options = this.requestOptions();
    if (!options) {
      this.logger.warn('Refusing to call orders-microservice create without [MISSING: Orders runtime credential]', 'OrderClient');
      throw new HttpException('[MISSING: Orders runtime credential]', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return options;
  }

  async createOrder(orderData: CreateCentralOrderRequest): Promise<any> {
    const payload = {
      contractVersion: CREATE_ORDER_CONTRACT_VERSION,
      ...orderData,
      channelAccountId: this.normalizeChannelAccountId(orderData.channelAccountId),
    };

    const requestOptions = this.requireCreateOrderRequestOptions();
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.baseUrl + '/api/orders', payload, requestOptions),
      );
      this.logger.log('Order accepted by orders-microservice: ' + response.data.data?.id, 'OrderClient');
      return response.data.data;
    } catch (error: any) {
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
          this.requestOptions() || {},
        ),
      );
      const order = response.data?.data || response.data || null;
      return {
        available: Boolean(order),
        order,
        reason: order ? undefined : ORDERS_LIFECYCLE_READ_UNAVAILABLE,
      };
    } catch (error: any) {
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
