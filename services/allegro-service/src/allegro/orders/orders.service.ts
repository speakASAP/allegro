/**
 * Orders Service
 */

import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CentralOrderLifecycleReadResult, ORDERS_LIFECYCLE_READ_UNAVAILABLE, PrismaService, LoggerService, OrderClientService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';
import { AllegroForwardingOffer, ForwardedOrderPayload, buildOrderForwardingPayload, getAllegroLineOfferIds } from './order-forwarding.mapper';

export const ALLEGRO_ORDER_FORWARDING_CONFIRMATION = 'ALLEGRO_ORDER_FORWARDING_TO_ORDERS_MICROSERVICE';
export const ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT = 'marketplace.order_affinity_candidate.v1';

const ORDER_CREATE_CONTRACT_VERSION = 'orders.create.v1';
const DEFAULT_CHANNEL_ACCOUNT_ID = 'default';
const MISSING_CENTRAL_ORDER_ID_MAPPING = '[MISSING: central Orders id mapping]';
const MISSING_CENTRAL_FORWARDING_ATTEMPT = '[MISSING: central Orders forwarding attempt]';

type ForwardingAttemptStatus = 'DISABLED' | 'BLOCKED' | 'FORWARDED' | 'FAILED';

function normalizeChannelAccountId(channelAccountId?: string | null): string {
  const normalized = channelAccountId?.trim();
  return normalized || DEFAULT_CHANNEL_ACCOUNT_ID;
}

function stableForHash(value: any): any {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => stableForHash(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc: any, key) => {
        const nested = stableForHash(value[key]);
        if (nested !== undefined) {
          acc[key] = nested;
        }
        return acc;
      }, {});
  }
  return value;
}

function hashPayload(value: any): string {
  return createHash('sha256').update(JSON.stringify(stableForHash(value))).digest('hex');
}

function buildOrderForwardingIdempotencyKey(payload: ForwardedOrderPayload): string {
  return [
    ORDER_CREATE_CONTRACT_VERSION,
    payload.channel,
    normalizeChannelAccountId(payload.channelAccountId),
    payload.externalOrderId,
  ].join(':');
}

function summarizeForwardingRequest(payload: ForwardedOrderPayload): any {
  return {
    contractVersion: ORDER_CREATE_CONTRACT_VERSION,
    channel: payload.channel,
    channelAccountId: normalizeChannelAccountId(payload.channelAccountId),
    externalOrderId: payload.externalOrderId,
    itemCount: payload.items.length,
    productIds: payload.items.map((item) => item.productId).sort(),
    warehouseIds: Array.from(new Set(payload.items.map((item) => item.warehouseId))).sort(),
    currency: payload.currency,
    total: payload.total,
    paymentStatus: payload.paymentStatus || null,
    orderedAt: payload.orderedAt instanceof Date ? payload.orderedAt.toISOString() : payload.orderedAt,
  };
}

function summarizeForwardingResponse(response: any): any {
  if (!response || typeof response !== 'object') {
    return response ? { accepted: true } : null;
  }
  return {
    id: response.id || response.orderId || null,
    externalOrderId: response.externalOrderId || null,
    channel: response.channel || null,
    status: response.status || null,
    createdAt: response.createdAt || null,
    updatedAt: response.updatedAt || null,
  };
}

function summarizeForwardingError(error: any): any {
  return {
    message: error?.message || 'Unknown error',
    status: error?.status || error?.response?.status || null,
    name: error?.name || null,
  };
}

function normalizeReadModelString(value: any): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeReadModelDate(value: any): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function readModelRecord(value: any): any {
  return value && typeof value === 'object' ? value : {};
}

function extractCentralOrderId(responseSummary: any): string | null {
  const summary = readModelRecord(responseSummary);
  return normalizeReadModelString(summary.id || summary.orderId);
}

function extractCentralLifecycle(order: any): any {
  const payload = readModelRecord(order);
  const fulfillment = readModelRecord(payload.fulfillment);
  const warehouseHandoff = readModelRecord(payload.warehouseHandoff || payload.warehouseHandoffSummary || payload.reservation);
  const lifecycleStage = normalizeReadModelString(
    payload.lifecycleStage ||
    payload.lifecycleStatus ||
    payload.stage ||
    payload.state ||
    payload.status,
  );

  return {
    lifecycleStage,
    status: normalizeReadModelString(payload.status),
    paymentStatus: normalizeReadModelString(payload.paymentStatus),
    fulfillmentStatus: normalizeReadModelString(payload.fulfillmentStatus || fulfillment.status),
    warehouseHandoffStatus: normalizeReadModelString(warehouseHandoff.status || payload.warehouseHandoffStatus),
    updatedAt: normalizeReadModelDate(payload.updatedAt),
  };
}

function summarizeLatestForwardingAttempt(attempt: any): any {
  if (!attempt) {
    return null;
  }
  return {
    id: attempt.id,
    status: attempt.status,
    attemptedAt: normalizeReadModelDate(attempt.attemptedAt),
    completedAt: normalizeReadModelDate(attempt.completedAt),
    blockedReasons: attempt.blockedReasons || [],
    errorSummary: attempt.errorSummary || null,
  };
}

function buildOrderQueryWhere(query: any = {}): any {
  const where: any = {};
  if (query.status) {
    where.status = query.status;
  }
  if (query.paymentStatus) {
    where.paymentStatus = query.paymentStatus;
  }
  return where;
}

function formatStatisticGroups(rows: any[], field: string): Array<{ value: string; count: number }> {
  return rows
    .map((row) => ({
      value: normalizeReadModelString(row[field]) || "UNKNOWN",
      count: Number(row._count?._all || 0),
    }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function statisticCount(groups: Array<{ value: string; count: number }>, value: string): number {
  return groups.find((group) => group.value === value)?.count || 0;
}


export type SyncOrdersFromAllegroOptions = {
  forwardToOrdersMicroservice?: boolean;
  confirmForwarding?: string;
};

export type OrderAffinityReplayQuery = {
  from?: string;
  to?: string;
  limit?: string | number;
  cursor?: string;
  dryRun?: string | boolean;
};

function positiveInteger(value: any, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isoOrNull(value: any): string | null {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function decimalToNumber(value: any, fallback = 0): number {
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hashedReplayRef(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function buildOrderAffinityReplayEvent(order: any): any | null {
  const safeRef = hashedReplayRef(String(order.allegroOrderId || order.id));
  const mappedItems = (Array.isArray(order.lineItems) ? order.lineItems : [])
    .filter((lineItem) => normalizeReadModelString(lineItem.catalogProductId))
    .map((lineItem) => ({
      productId: normalizeReadModelString(lineItem.catalogProductId),
      ...(normalizeReadModelString(lineItem.allegroOfferExternalId) ? { sku: normalizeReadModelString(lineItem.allegroOfferExternalId) } : {}),
      quantity: Math.max(1, Number.parseInt(String(lineItem.quantity || 1), 10) || 1),
      unitPrice: decimalToNumber(lineItem.price),
      totalPrice: decimalToNumber(lineItem.totalPrice),
    }));
  const distinctProductIds = new Set(mappedItems.map((item) => item.productId));
  if (distinctProductIds.size < 2) return null;
  const occurredAt = order.paidAt || order.orderDate || order.createdAt || new Date();
  return {
    type: ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT,
    eventVersion: 1,
    eventId: `allegro.order-affinity:${safeRef}`,
    occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt),
    source: 'allegro-service',
    payload: {
      orderId: `allegro-replay:${safeRef}`,
      channel: 'allegro',
      currency: normalizeReadModelString(order.currency) || 'PLN',
      items: mappedItems,
    },
  };
}

function resolveOrderForwardingEnabled(options: SyncOrdersFromAllegroOptions): boolean {
  if (!options.forwardToOrdersMicroservice) {
    return false;
  }

  if (options.confirmForwarding !== ALLEGRO_ORDER_FORWARDING_CONFIRMATION) {
    throw new Error(`Refusing to forward Allegro orders without confirmForwarding=${ALLEGRO_ORDER_FORWARDING_CONFIRMATION}. Run local projection/dry-run evidence first.`);
  }

  return true;
}

function parseMoney(value: any, fallback = 0): number {
  const amount = typeof value === 'object' && value !== null ? value.amount : value;
  const parsed = Number.parseFloat(String(amount ?? fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: any): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveOrderForwardingWarehouseId(configService: ConfigService): string | null {
  const configured =
    configService.get<string>('ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID') ||
    configService.get<string>('DEFAULT_WAREHOUSE_ID') ||
    configService.get<string>('STOCK_PRIMARY_WAREHOUSE');
  const normalized = configured?.trim();
  return normalized || null;
}

function getOrderTotal(order: any): { amount: number; currency: string } {
  const total = order?.totalPrice || order?.summary?.totalToPay || {};
  return {
    amount: parseMoney(total),
    currency: total.currency || 'PLN',
  };
}

function getPaymentStatus(order: any): string | null {
  if (order?.payment?.status) {
    return order.payment.status;
  }
  return order?.payment?.finishedAt ? 'PAID' : null;
}

function buildLineItemPayload(lineItem: any, offer: AllegroForwardingOffer | undefined, index: number) {
  const quantity = Number(lineItem?.quantity || 1);
  const price = parseMoney(lineItem?.price);
  const originalPrice = lineItem?.originalPrice ? parseMoney(lineItem.originalPrice) : null;
  const currency = lineItem?.price?.currency || lineItem?.originalPrice?.currency || 'PLN';

  return {
    allegroLineItemId: String(lineItem?.id || `${index}:${lineItem?.offer?.id || 'unknown'}:${lineItem?.boughtAt || ''}`),
    allegroOfferExternalId: lineItem?.offer?.id ? String(lineItem.offer.id) : null,
    allegroOfferId: offer?.id || null,
    catalogProductId: offer?.catalogProductId || null,
    title: String(lineItem?.offer?.name || offer?.title || 'Product').slice(0, 500),
    quantity,
    price,
    originalPrice,
    totalPrice: price * quantity,
    currency,
    tax: lineItem?.tax || null,
    discounts: lineItem?.discounts || null,
    vouchers: lineItem?.vouchers || null,
    selectedAdditionalServices: lineItem?.selectedAdditionalServices || null,
    rawData: lineItem || null,
    boughtAt: parseDate(lineItem?.boughtAt),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
    private readonly configService: ConfigService,
    private readonly orderClient: OrderClientService,
  ) {}

  private orderForwardingAttemptReadModelSelect(): any {
    return {
      id: true,
      status: true,
      responseSummary: true,
      errorSummary: true,
      blockedReasons: true,
      attemptedAt: true,
      completedAt: true,
      channel: true,
      channelAccountId: true,
      externalOrderId: true,
    };
  }

  private async attachCentralOrderReadModels(orders: any[]): Promise<any[]> {
    const centralOrderIds = Array.from(new Set(
      orders
        .map((order) => {
          const latestAttempt = order.forwardingAttempts?.[0];
          return latestAttempt?.status === 'FORWARDED' ? extractCentralOrderId(latestAttempt.responseSummary) : null;
        })
        .filter((orderId): orderId is string => Boolean(orderId)),
    ));
    const centralReads = new Map<string, CentralOrderLifecycleReadResult>();

    await Promise.all(centralOrderIds.map(async (centralOrderId) => {
      try {
        centralReads.set(centralOrderId, await this.orderClient.getOrderLifecycle(centralOrderId));
      } catch (error: any) {
        this.logger.warn('Orders lifecycle read failed while building Allegro order read model', {
          centralOrderId,
          error: error?.message || 'Unknown error',
        });
        centralReads.set(centralOrderId, {
          available: false,
          order: null,
          reason: ORDERS_LIFECYCLE_READ_UNAVAILABLE,
        });
      }
    }));

    return orders.map((order) => this.attachCentralOrderReadModel(order, centralReads));
  }

  private attachCentralOrderReadModel(order: any, centralReads: Map<string, CentralOrderLifecycleReadResult>): any {
    const forwardingAttempts = Array.isArray(order.forwardingAttempts) ? order.forwardingAttempts : [];
    const latestAttempt = forwardingAttempts[0] || null;
    const centralOrderId = extractCentralOrderId(latestAttempt?.responseSummary);
    const centralRead = centralOrderId ? centralReads.get(centralOrderId) : undefined;
    const { forwardingAttempts: _forwardingAttempts, ...orderWithoutInternalRelations } = order;

    return {
      ...orderWithoutInternalRelations,
      centralOrderReadModel: this.buildCentralOrderReadModel(latestAttempt, centralOrderId, centralRead),
    };
  }

  private buildCentralOrderReadModel(
    latestAttempt: any,
    centralOrderId: string | null,
    centralRead?: CentralOrderLifecycleReadResult,
  ): any {
    if (!latestAttempt) {
      return {
        state: 'unknown',
        id: null,
        displayStatus: 'Unknown',
        lifecycleStage: null,
        status: null,
        paymentStatus: null,
        fulfillmentStatus: null,
        warehouseHandoffStatus: null,
        reason: MISSING_CENTRAL_FORWARDING_ATTEMPT,
        forwardingAttempt: null,
        source: 'allegro-forwarding-attempt',
      };
    }

    const forwardingAttempt = summarizeLatestForwardingAttempt(latestAttempt);
    if (latestAttempt.status !== 'FORWARDED') {
      return {
        state: 'unknown',
        id: centralOrderId,
        displayStatus: 'Unavailable',
        lifecycleStage: null,
        status: null,
        paymentStatus: null,
        fulfillmentStatus: null,
        warehouseHandoffStatus: null,
        reason: `central forwarding attempt is ${latestAttempt.status || 'UNKNOWN'}`,
        forwardingAttempt,
        source: 'allegro-forwarding-attempt',
      };
    }

    if (!centralOrderId) {
      return {
        state: 'unknown',
        id: null,
        displayStatus: 'Unavailable',
        lifecycleStage: null,
        status: null,
        paymentStatus: null,
        fulfillmentStatus: null,
        warehouseHandoffStatus: null,
        reason: MISSING_CENTRAL_ORDER_ID_MAPPING,
        forwardingAttempt,
        source: 'allegro-forwarding-attempt',
      };
    }

    if (!centralRead?.available || !centralRead.order) {
      const responseSummary = readModelRecord(latestAttempt.responseSummary);
      const responseStatus = normalizeReadModelString(responseSummary.status);
      return {
        state: 'stale',
        id: centralOrderId,
        displayStatus: responseStatus || 'Unavailable',
        lifecycleStage: null,
        status: responseStatus,
        paymentStatus: null,
        fulfillmentStatus: null,
        warehouseHandoffStatus: null,
        reason: centralRead?.reason || ORDERS_LIFECYCLE_READ_UNAVAILABLE,
        forwardingAttempt,
        source: 'orders-microservice',
      };
    }

    const centralLifecycle = extractCentralLifecycle(centralRead.order);
    return {
      state: 'available',
      id: normalizeReadModelString(centralRead.order.id) || centralOrderId,
      displayStatus: centralLifecycle.lifecycleStage || centralLifecycle.status || 'Available',
      ...centralLifecycle,
      reason: null,
      forwardingAttempt,
      source: 'orders-microservice',
    };
  }

  async getOrderAffinityReplayCandidates(query: OrderAffinityReplayQuery = {}): Promise<any> {
    const limit = positiveInteger(query.limit, 50, 200);
    const fetchLimit = Math.min(limit * 5, 1000);
    const orderDate: any = {};
    const from = isoOrNull(query.from);
    const to = isoOrNull(query.to);
    if (from) orderDate.gte = new Date(from);
    if (to) orderDate.lte = new Date(to);
    const where: any = {
      status: 'READY_FOR_PROCESSING',
      OR: [
        { paymentStatus: 'PAID' },
        { paidAt: { not: null } },
      ],
      ...(Object.keys(orderDate).length > 0 ? { orderDate } : {}),
    };
    const rows = await this.prisma.allegroOrder.findMany({
      where,
      take: fetchLimit,
      orderBy: { orderDate: 'asc' },
      select: {
        id: true,
        allegroOrderId: true,
        status: true,
        paymentStatus: true,
        paidAt: true,
        orderDate: true,
        currency: true,
        createdAt: true,
        lineItems: {
          orderBy: { createdAt: 'asc' },
          select: {
            catalogProductId: true,
            allegroOfferExternalId: true,
            quantity: true,
            price: true,
            totalPrice: true,
            currency: true,
          },
        },
      },
    });
    const events = rows
      .map((order) => buildOrderAffinityReplayEvent(order))
      .filter((event): event is Record<string, unknown> => Boolean(event))
      .slice(0, limit);
    return {
      sourceOwner: 'allegro-service',
      consumerOwner: 'marketing-microservice',
      contract: ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT,
      channel: 'allegro',
      filters: {
        from,
        to,
        limit,
        cursor: query.cursor || null,
        dryRun: query.dryRun === true || query.dryRun === 'true',
      },
      cursorBefore: query.cursor || null,
      cursorAfter: null,
      count: events.length,
      events,
      skippedRecords: Math.max(0, rows.length - events.length),
    };
  }

  private async groupOrderCounts(field: string, where: any): Promise<Array<{ value: string; count: number }>> {
    const rows = await (this.prisma as any).allegroOrder.groupBy({
      by: [field],
      where,
      _count: { _all: true },
    });
    return formatStatisticGroups(rows, field);
  }

  private async groupOrderForwardingAttemptCounts(): Promise<Array<{ value: string; count: number }>> {
    const rows = await (this.prisma as any).allegroOrderForwardingAttempt.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return formatStatisticGroups(rows, "status");
  }

  /**
   * Get aggregate order and delivery statistics without returning customer rows.
   */
  async getOrderStatistics(query: any = {}): Promise<any> {
    const where = buildOrderQueryWhere(query);
    const trackingWhere = { ...where, trackingNumber: { not: null } };
    const missingTrackingWhere = { ...where, trackingNumber: null };
    const deliveryMethodWhere = { ...where, deliveryMethod: { not: null } };
    const missingDeliveryMethodWhere = { ...where, deliveryMethod: null };

    const [
      totalOrders,
      statusCounts,
      paymentStatusCounts,
      fulfillmentStatusCounts,
      deliveryMethodCounts,
      withTrackingNumber,
      missingTrackingNumber,
      withDeliveryMethod,
      missingDeliveryMethod,
      centralForwardingStatusCounts,
    ] = await Promise.all([
      this.prisma.allegroOrder.count({ where }),
      this.groupOrderCounts("status", where),
      this.groupOrderCounts("paymentStatus", where),
      this.groupOrderCounts("fulfillmentStatus", where),
      this.groupOrderCounts("deliveryMethod", where),
      this.prisma.allegroOrder.count({ where: trackingWhere }),
      this.prisma.allegroOrder.count({ where: missingTrackingWhere }),
      this.prisma.allegroOrder.count({ where: deliveryMethodWhere }),
      this.prisma.allegroOrder.count({ where: missingDeliveryMethodWhere }),
      this.groupOrderForwardingAttemptCounts(),
    ]);

    const centralForwardingAttempts = centralForwardingStatusCounts.reduce((sum, group) => sum + group.count, 0);

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        status: query.status || null,
        paymentStatus: query.paymentStatus || null,
      },
      totals: {
        orders: totalOrders,
        centralForwardingAttempts,
        withTrackingNumber,
        missingTrackingNumber,
        withDeliveryMethod,
        missingDeliveryMethod,
      },
      statusCounts,
      paymentStatusCounts,
      centralForwarding: {
        statusCounts: centralForwardingStatusCounts,
        forwarded: statisticCount(centralForwardingStatusCounts, "FORWARDED"),
        blocked: statisticCount(centralForwardingStatusCounts, "BLOCKED"),
        failed: statisticCount(centralForwardingStatusCounts, "FAILED"),
        disabled: statisticCount(centralForwardingStatusCounts, "DISABLED"),
      },
      delivery: {
        fulfillmentStatusCounts,
        deliveryMethodCounts,
        tracking: {
          withTrackingNumber,
          missingTrackingNumber,
        },
        deliveryMethodCoverage: {
          withDeliveryMethod,
          missingDeliveryMethod,
        },
      },
    };
  }

  /**
   * Get orders from database
   */
  async getOrders(query: any): Promise<{ items: any[]; pagination: any }> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const page = Math.max(1, Number.parseInt(String(query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const where = buildOrderQueryWhere(query);

    this.logger.log(`[${timestamp}] [TIMING] OrdersService.getOrders START`, {
      filters: {
        status: query.status,
        paymentStatus: query.paymentStatus,
      },
      pagination: { page, limit, skip },
    });

    // Optimized: Load orders without relations for faster list loading
    // Relations can be loaded on-demand when viewing order details
    const dbQueryStartTime = Date.now();
    const [items, total] = await Promise.all([
      this.prisma.allegroOrder.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          allegroOrderId: true,
          buyerEmail: true,
          buyerLogin: true,
          quantity: true,
          price: true,
          totalPrice: true,
          currency: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          deliveryMethod: true,
          marketplaceId: true,
          lineItemsCount: true,
          orderDate: true,
          createdAt: true,
          updatedAt: true,
          forwardingAttempts: {
            orderBy: { attemptedAt: 'desc' },
            take: 1,
            select: this.orderForwardingAttemptReadModelSelect(),
          },
          // Heavy relations removed for faster list loading - can be loaded on-demand when viewing details.
          // offer: {
          //   include: {
          //     product: true,
          //   },
          // },
          // product: true,
        },
        orderBy: { orderDate: 'desc' },
      }),
      this.prisma.allegroOrder.count({ where }),
    ]);
    const enrichedItems = await this.attachCentralOrderReadModels(items);
    const dbQueryDuration = Date.now() - dbQueryStartTime;
    const totalDuration = Date.now() - startTime;

    this.logger.log(`[${new Date().toISOString()}] [TIMING] OrdersService.getOrders: Database query completed (${dbQueryDuration}ms)`, {
      total,
      returned: enrichedItems.length,
      page,
      limit,
    });
    this.logger.log(`[${new Date().toISOString()}] [TIMING] OrdersService.getOrders COMPLETE (${totalDuration}ms total)`, {
      total,
      returned: enrichedItems.length,
      page,
      limit,
      dbQueryDurationMs: dbQueryDuration,
      totalDurationMs: totalDuration,
    });

    return {
      items: enrichedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get order by ID
   */
  async getOrder(id: string): Promise<any> {
    const order = await this.prisma.allegroOrder.findUnique({
      where: { id },
      include: {
        offer: true,
        lineItems: {
          orderBy: { createdAt: 'asc' },
        },
        forwardingAttempts: {
          orderBy: { attemptedAt: 'desc' },
          take: 1,
          select: this.orderForwardingAttemptReadModelSelect(),
        },
      },
    });

    if (!order) {
      throw new Error(`Order with ID ${id} not found`);
    }

    const [enrichedOrder] = await this.attachCentralOrderReadModels([order]);
    return enrichedOrder;
  }

  private async recordOrderForwardingAttempt(params: {
    savedOrder: any;
    allegroOrder: any;
    forwardingEnabled: boolean;
    status: ForwardingAttemptStatus;
    orderData?: ForwardedOrderPayload | null;
    blockedReasons: string[];
    missingOfferIds: string[];
    missingCatalogOfferIds: string[];
    response?: any;
    error?: any;
  }): Promise<void> {
    const prisma = this.prisma as any;
    const orderData = params.orderData || null;
    const channel = orderData?.channel || 'allegro';
    const channelAccountId = normalizeChannelAccountId(orderData?.channelAccountId || null);
    const externalOrderId = orderData?.externalOrderId || String(params.allegroOrder?.id || params.savedOrder.allegroOrderId);
    const accountId = channelAccountId !== DEFAULT_CHANNEL_ACCOUNT_ID ? channelAccountId : null;
    const idempotencyKey = orderData
      ? buildOrderForwardingIdempotencyKey(orderData)
      : [ORDER_CREATE_CONTRACT_VERSION, channel, channelAccountId, externalOrderId, params.status.toLowerCase()].join(':');
    const payloadHash = orderData ? hashPayload(orderData) : null;
    const currentAttempt = orderData
      ? await prisma.allegroOrderForwardingAttempt.findUnique({
        where: { idempotencyKey },
        select: { id: true, payloadHash: true },
      })
      : null;
    const previousAttempt = orderData
      ? currentAttempt || await prisma.allegroOrderForwardingAttempt.findFirst({
        where: {
          channel,
          channelAccountId,
          externalOrderId,
          payloadHash: { not: null },
          NOT: { idempotencyKey },
        },
        orderBy: { attemptedAt: 'desc' },
        select: { id: true, payloadHash: true },
      })
      : null;
    const payloadEqualityStatus = payloadHash && previousAttempt
      ? previousAttempt.payloadHash === payloadHash ? 'MATCHED_PREVIOUS' : 'MISMATCHED_PREVIOUS'
      : payloadHash ? 'FIRST_SEEN' : 'NOT_APPLICABLE';
    const previousAttemptId = currentAttempt ? null : previousAttempt?.id || null;
    const completedAt = params.status === 'FORWARDED' || params.status === 'FAILED' || params.status === 'BLOCKED'
      ? new Date()
      : null;

    await prisma.allegroOrderForwardingAttempt.upsert({
      where: { idempotencyKey },
      update: {
        localOrderId: params.savedOrder.id,
        accountId,
        allegroOrderId: String(params.allegroOrder?.id || params.savedOrder.allegroOrderId),
        payloadHash,
        payloadEqualityStatus,
        previousAttemptId,
        status: params.status,
        blockedReasons: params.blockedReasons,
        missingOfferIds: params.missingOfferIds,
        missingCatalogOfferIds: params.missingCatalogOfferIds,
        requestSummary: orderData ? summarizeForwardingRequest(orderData) : { forwardingEnabled: params.forwardingEnabled },
        responseSummary: summarizeForwardingResponse(params.response),
        errorSummary: params.error ? summarizeForwardingError(params.error) : null,
        attemptedAt: new Date(),
        completedAt,
      },
      create: {
        localOrderId: params.savedOrder.id,
        accountId,
        allegroOrderId: String(params.allegroOrder?.id || params.savedOrder.allegroOrderId),
        channel,
        channelAccountId,
        externalOrderId,
        contractVersion: ORDER_CREATE_CONTRACT_VERSION,
        idempotencyKey,
        payloadHash,
        payloadEqualityStatus,
        previousAttemptId,
        status: params.status,
        blockedReasons: params.blockedReasons,
        missingOfferIds: params.missingOfferIds,
        missingCatalogOfferIds: params.missingCatalogOfferIds,
        requestSummary: orderData ? summarizeForwardingRequest(orderData) : { forwardingEnabled: params.forwardingEnabled },
        responseSummary: summarizeForwardingResponse(params.response),
        errorSummary: params.error ? summarizeForwardingError(params.error) : null,
        completedAt,
      },
    });
  }

  private async safeRecordOrderForwardingAttempt(params: Parameters<OrdersService['recordOrderForwardingAttempt']>[0]): Promise<void> {
    try {
      await this.recordOrderForwardingAttempt(params);
    } catch (error: any) {
      this.logger.error('Failed to record Allegro order forwarding attempt', {
        allegroOrderId: params.allegroOrder?.id,
        status: params.status,
        error: error.message,
      });
    }
  }

  /**
   * Fetch orders from Allegro API and sync to database
   */
  async syncOrdersFromAllegro(options: SyncOrdersFromAllegroOptions = {}) {
    this.logger.log('Syncing orders from Allegro');
    const forwardingEnabled = resolveOrderForwardingEnabled(options);
    const forwardingWarehouseId = resolveOrderForwardingWarehouseId(this.configService);

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalSynced = 0;
    let forwarded = 0;
    let forwardingSkipped = 0;
    let forwardingFailed = 0;

    while (hasMore) {
      try {
        const response = await this.allegroApi.getOrders({
          limit,
          offset,
        });

        const orders = response.checkoutForms || response.orders || [];
        
        for (const allegroOrder of orders) {
          try {
            const lineItems = allegroOrder.lineItems || [];
            const lineOfferIds = getAllegroLineOfferIds(allegroOrder.lineItems || []);
            const offers: AllegroForwardingOffer[] = lineOfferIds.length > 0
              ? await this.prisma.allegroOffer.findMany({
                where: { allegroOfferId: { in: lineOfferIds } },
                select: {
                  id: true,
                  allegroOfferId: true,
                  catalogProductId: true,
                  accountId: true,
                  title: true,
                },
              })
              : [];
            const offersByAllegroOfferId = new Map<string, AllegroForwardingOffer>(
              offers.map((mappedOffer) => [mappedOffer.allegroOfferId, mappedOffer]),
            );
            const primaryOfferId = lineOfferIds[0] || '';
            const offer = primaryOfferId ? offersByAllegroOfferId.get(primaryOfferId) : null;
            const firstLine = lineItems[0] || {};
            const firstLinePrice = firstLine.price || {};
            const orderTotal = getOrderTotal(allegroOrder);
            const paymentStatus = getPaymentStatus(allegroOrder);
            const orderDate = parseDate(allegroOrder.createdAt || firstLine.boughtAt || allegroOrder.updatedAt) || new Date();

            const savedOrder = await this.prisma.allegroOrder.upsert({
              where: { allegroOrderId: allegroOrder.id },
              update: {
                allegroOfferId: offer?.id || null,
                catalogProductId: offer?.catalogProductId || null,
                quantity: lineItems.reduce((sum: number, item: any) => sum + Number(item?.quantity || 0), 0) || 1,
                price: parseMoney(firstLinePrice),
                totalPrice: orderTotal.amount,
                currency: orderTotal.currency || firstLinePrice.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
                lineItemsCount: lineItems.length,
                status: allegroOrder.status || 'NEW',
                paymentStatus,
                fulfillmentStatus: allegroOrder.fulfillment?.status,
                buyerId: allegroOrder.buyer?.id,
                buyerEmail: allegroOrder.buyer?.email,
                buyerLogin: allegroOrder.buyer?.login,
                deliveryMethod: allegroOrder.delivery?.method?.name,
                deliveryAddress: allegroOrder.delivery?.address || null,
                paymentMethod: allegroOrder.payment?.provider || allegroOrder.payment?.type,
                paidAt: parseDate(allegroOrder.payment?.finishedAt),
                marketplaceId: allegroOrder.marketplace?.id,
                revision: allegroOrder.revision,
                invoiceRequired: Boolean(allegroOrder.invoice?.required),
                rawData: allegroOrder,
                updatedAt: new Date(),
              },
              create: {
                allegroOrderId: allegroOrder.id,
                allegroOfferId: offer?.id || null,
                catalogProductId: offer?.catalogProductId || null,
                quantity: lineItems.reduce((sum: number, item: any) => sum + Number(item?.quantity || 0), 0) || 1,
                price: parseMoney(firstLinePrice),
                totalPrice: orderTotal.amount,
                currency: orderTotal.currency || firstLinePrice.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
                lineItemsCount: lineItems.length,
                status: allegroOrder.status || 'NEW',
                paymentStatus,
                fulfillmentStatus: allegroOrder.fulfillment?.status,
                buyerId: allegroOrder.buyer?.id,
                buyerEmail: allegroOrder.buyer?.email,
                buyerLogin: allegroOrder.buyer?.login,
                deliveryMethod: allegroOrder.delivery?.method?.name,
                deliveryAddress: allegroOrder.delivery?.address || null,
                paymentMethod: allegroOrder.payment?.provider || allegroOrder.payment?.type,
                paidAt: parseDate(allegroOrder.payment?.finishedAt),
                marketplaceId: allegroOrder.marketplace?.id,
                revision: allegroOrder.revision,
                invoiceRequired: Boolean(allegroOrder.invoice?.required),
                rawData: allegroOrder,
                orderDate,
              },
            });

            await this.prisma.allegroOrderLineItem.deleteMany({
              where: { orderId: savedOrder.id },
            });
            if (lineItems.length > 0) {
              await this.prisma.allegroOrderLineItem.createMany({
                data: lineItems.map((lineItem: any, index: number) => {
                  const lineOfferId = String(lineItem?.offer?.id || '').trim();
                  return {
                    orderId: savedOrder.id,
                    ...buildLineItemPayload(lineItem, lineOfferId ? offersByAllegroOfferId.get(lineOfferId) : undefined, index),
                  };
                }),
              });
            }

            // Central order forwarding is an explicit replay/apply action. Local projection remains the default.
            if (savedOrder) {
              const forwarding = buildOrderForwardingPayload(allegroOrder, offersByAllegroOfferId, {
                warehouseId: forwardingWarehouseId,
              });

              if (!forwardingEnabled) {
                forwardingSkipped += 1;
                await this.safeRecordOrderForwardingAttempt({
                  savedOrder,
                  allegroOrder,
                  forwardingEnabled,
                  status: 'DISABLED',
                  orderData: forwarding.orderData,
                  blockedReasons: forwarding.blockedReasons,
                  missingOfferIds: forwarding.missingOfferIds,
                  missingCatalogOfferIds: forwarding.missingCatalogOfferIds,
                });
                this.logger.log('Projected Allegro order locally; central orders forwarding is disabled', {
                  allegroOrderId: allegroOrder.id,
                  localOrderId: savedOrder.id,
                  forwardingReady: Boolean(forwarding.orderData),
                  blockedReasons: forwarding.blockedReasons,
                  missingOfferIds: forwarding.missingOfferIds,
                  missingCatalogOfferIds: forwarding.missingCatalogOfferIds,
                  lineOfferIds: forwarding.lineOfferIds,
                });
              } else if (!forwarding.orderData) {
                forwardingSkipped += 1;
                await this.safeRecordOrderForwardingAttempt({
                  savedOrder,
                  allegroOrder,
                  forwardingEnabled,
                  status: 'BLOCKED',
                  orderData: null,
                  blockedReasons: forwarding.blockedReasons,
                  missingOfferIds: forwarding.missingOfferIds,
                  missingCatalogOfferIds: forwarding.missingCatalogOfferIds,
                });
                this.logger.warn('Skipped forwarding Allegro order to orders-microservice because forwarding requirements are incomplete', {
                  allegroOrderId: allegroOrder.id,
                  localOrderId: savedOrder.id,
                  blockedReasons: forwarding.blockedReasons,
                  missingOfferIds: forwarding.missingOfferIds,
                  missingCatalogOfferIds: forwarding.missingCatalogOfferIds,
                  lineOfferIds: forwarding.lineOfferIds,
                });
              } else {
                try {
                  const centralOrder = await this.orderClient.createOrder(forwarding.orderData);
                  await this.safeRecordOrderForwardingAttempt({
                    savedOrder,
                    allegroOrder,
                    forwardingEnabled,
                    status: 'FORWARDED',
                    orderData: forwarding.orderData,
                    blockedReasons: [],
                    missingOfferIds: [],
                    missingCatalogOfferIds: [],
                    response: centralOrder,
                  });
                  forwarded += 1;
                  this.logger.log('Order forwarded to orders-microservice', {
                    allegroOrderId: allegroOrder.id,
                    localOrderId: savedOrder.id,
                    lineOfferIds: forwarding.lineOfferIds,
                    itemCount: forwarding.orderData.items.length,
                  });
                } catch (error: any) {
                  forwardingFailed += 1;
                  await this.safeRecordOrderForwardingAttempt({
                    savedOrder,
                    allegroOrder,
                    forwardingEnabled,
                    status: 'FAILED',
                    orderData: forwarding.orderData,
                    blockedReasons: forwarding.blockedReasons,
                    missingOfferIds: forwarding.missingOfferIds,
                    missingCatalogOfferIds: forwarding.missingCatalogOfferIds,
                    error,
                  });
                  // Log error but don't fail the sync
                  this.logger.error('Failed to forward order to orders-microservice', {
                    allegroOrderId: allegroOrder.id,
                    error: error.message,
                  });
                }
              }
            }

            totalSynced++;
          } catch (error: any) {
            this.logger.error('Failed to sync order', {
              orderId: allegroOrder.id,
              error: error.message,
            });
          }
        }

        hasMore = orders.length === limit;
        offset += limit;
      } catch (error: any) {
        this.logger.error('Failed to fetch orders from Allegro', {
          error: error.message,
        });
        hasMore = false;
      }
    }

    const forwarding = {
      enabled: forwardingEnabled,
      forwarded,
      skipped: forwardingSkipped,
      failed: forwardingFailed,
    };
    this.logger.log('Finished syncing orders', { totalSynced, forwarding });
    return { totalSynced, localProjected: totalSynced, forwarding };
  }
}
