import 'reflect-metadata';
import { strict as assert } from 'assert';
import { ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT, ALLEGRO_ORDER_FORWARDING_CONFIRMATION, OrdersService } from './orders.service';

type OfferFixture = {
  id: string;
  allegroOfferId: string;
  accountId?: string | null;
  catalogProductId?: string | null;
  title?: string | null;
};

const ORDERS_LIFECYCLE_READ_UNAVAILABLE = '[MISSING: Orders lifecycle read contract/client method]';

function createServiceFixture(
  orders: any[],
  offers: OfferFixture[],
  options: {
    failForwardingAttemptWrites?: boolean;
    warehouseId?: string | null;
    stockPrimaryWarehouseId?: string | null;
    localOrders?: any[];
    centralLifecycleReads?: Record<string, any>;
    forwardingAttempts?: any[];
  } = {},
) {
  const orderClientCalls: any[] = [];
  const centralLifecycleReadCalls: string[] = [];
  const warnings: any[] = [];
  const errors: any[] = [];
  const logs: any[] = [];
  const forwardingAttempts: any[] = [...(options.forwardingAttempts || [])];
  const captured: any = {};

  const filterRows = (rows: any[], where: any = {}) => rows.filter((row) => Object.entries(where || {}).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === "object" && Object.prototype.hasOwnProperty.call(condition, "not")) {
      return value !== (condition as any).not;
    }
    return value === condition;
  }));

  const groupRows = (rows: any[], field: string, where: any = {}) => {
    const counts = new Map<any, number>();
    for (const row of filterRows(rows, where)) {
      const value = row[field] ?? null;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ [field]: value, _count: { _all: count } }));
  };

  const prisma = {
    allegroOffer: {
      findMany: async (query: any) => {
        captured.offerFindMany = query;
        const requestedIds = query.where.allegroOfferId.in;
        return offers.filter((offer) => requestedIds.includes(offer.allegroOfferId));
      },
    },
    allegroOrder: {
      findMany: async (args: any) => {
        captured.orderFindMany = args;
        return options.localOrders || [];
      },
      count: async (args: any = {}) => {
        captured.orderCount = args;
        return filterRows(options.localOrders || [], args.where).length;
      },
      groupBy: async (args: any) => {
        captured.orderGroupBy = captured.orderGroupBy || [];
        captured.orderGroupBy.push(args);
        return groupRows(options.localOrders || [], args.by[0], args.where);
      },
      findUnique: async (args: any) => {
        captured.orderFindUnique = args;
        return (options.localOrders || []).find((order) => order.id === args.where.id) || null;
      },
      upsert: async (args: any) => {
        captured.orderUpsert = args;
        return { id: 'local-' + args.where.allegroOrderId };
      },
    },
    allegroOrderForwardingAttempt: {
      groupBy: async (args: any) => {
        captured.forwardingAttemptGroupBy = args;
        return groupRows(forwardingAttempts, args.by[0], args.where);
      },
      findUnique: async (args: any) => {
        captured.forwardingAttemptFindUnique = args;
        return forwardingAttempts.find((attempt) => attempt.idempotencyKey === args.where.idempotencyKey) || null;
      },
      findFirst: async (args: any) => {
        captured.forwardingAttemptFindFirst = args;
        return forwardingAttempts.find((attempt) =>
          attempt.channel === args.where.channel
          && attempt.channelAccountId === args.where.channelAccountId
          && attempt.externalOrderId === args.where.externalOrderId
          && attempt.payloadHash,
        ) || null;
      },
      upsert: async (args: any) => {
        captured.forwardingAttemptUpsert = args;
        if (options.failForwardingAttemptWrites) {
          throw new Error('synthetic audit write failure');
        }
        const existingIndex = forwardingAttempts.findIndex((attempt) => attempt.idempotencyKey === args.where.idempotencyKey);
        if (existingIndex >= 0) {
          forwardingAttempts[existingIndex] = { ...forwardingAttempts[existingIndex], ...args.update };
          return forwardingAttempts[existingIndex];
        }
        const created = { id: 'attempt-' + (forwardingAttempts.length + 1), ...args.create };
        forwardingAttempts.push(created);
        return created;
      },
    },
    allegroOrderLineItem: {
      deleteMany: async (args: any) => {
        captured.lineItemDeleteMany = args;
        return { count: 0 };
      },
      createMany: async (args: any) => {
        captured.lineItemCreateMany = args;
        return { count: args.data.length };
      },
    },
  };

  const logger = {
    log: (...args: any[]) => logs.push(args),
    warn: (...args: any[]) => warnings.push(args),
    error: (...args: any[]) => errors.push(args),
  };

  const allegroApi = {
    getOrders: async () => ({ checkoutForms: orders }),
  };

  const configService = {
    get: (key: string) => {
      if (key === 'ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID' || key === 'DEFAULT_WAREHOUSE_ID') {
        if (Object.prototype.hasOwnProperty.call(options, 'warehouseId')) {
          return options.warehouseId;
        }
        return 'warehouse-main';
      }
      if (key === 'STOCK_PRIMARY_WAREHOUSE') {
        if (Object.prototype.hasOwnProperty.call(options, 'stockPrimaryWarehouseId')) {
          return options.stockPrimaryWarehouseId;
        }
        return undefined;
      }
      if (key === 'PRICE_CURRENCY_TARGET') {
        return 'PLN';
      }
      return undefined;
    },
  };

  const orderClient = {
    createOrder: async (payload: any) => {
      orderClientCalls.push(payload);
      return { id: 'central-order-1' };
    },
    getOrderLifecycle: async (orderId: string) => {
      centralLifecycleReadCalls.push(orderId);
      const read = options.centralLifecycleReads?.[orderId];
      if (!read) {
        return {
          available: false,
          order: null,
          reason: ORDERS_LIFECYCLE_READ_UNAVAILABLE,
        };
      }
      if (Object.prototype.hasOwnProperty.call(read, 'available')) {
        return read;
      }
      return { available: true, order: read };
    },
  };

  const service = new OrdersService(
    prisma as any,
    logger as any,
    allegroApi as any,
    configService as any,
    orderClient as any,
  );

  return { service, orderClientCalls, centralLifecycleReadCalls, warnings, errors, logs, captured, forwardingAttempts };
}

const ACCOUNT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildAllegroOrder(lineItems: any[]) {
  return {
    id: 'allegro-order-1',
    lineItems,
    summary: { totalToPay: { amount: '25.00', currency: 'PLN' } },
    status: 'READY_FOR_PROCESSING',
    payment: { finishedAt: '2026-06-26T10:01:00.000Z', provider: 'ONLINE' },
    fulfillment: { status: 'NEW' },
    delivery: {
      method: { name: 'Allegro Automaty Paczkowe One' },
      address: { city: 'Synthetic' },
    },
    invoice: { required: false },
    marketplace: { id: 'allegro-cz' },
    revision: '1',
    buyer: { email: 'buyer@example.invalid', login: 'buyer-login' },
    createdAt: '2026-06-26T10:00:00.000Z',
  };
}

function buildLocalOrder(overrides: any = {}) {
  return {
    id: 'local-order-1',
    allegroOrderId: 'allegro-order-1',
    buyerEmail: 'buyer@example.invalid',
    buyerLogin: 'buyer-login',
    quantity: 1,
    price: 10,
    totalPrice: 10,
    currency: 'PLN',
    status: 'READY_FOR_PROCESSING',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'NEW',
    deliveryMethod: 'Delivery',
    marketplaceId: 'allegro-cz',
    lineItemsCount: 1,
    orderDate: new Date('2026-06-26T10:00:00.000Z'),
    createdAt: new Date('2026-06-26T10:00:01.000Z'),
    updatedAt: new Date('2026-06-26T10:00:02.000Z'),
    forwardingAttempts: [],
    ...overrides,
  };
}

function buildForwardedAttempt(overrides: any = {}) {
  return {
    id: 'attempt-1',
    status: 'FORWARDED',
    responseSummary: { id: 'central-order-1', status: 'created' },
    attemptedAt: new Date('2026-06-26T10:05:00.000Z'),
    completedAt: new Date('2026-06-26T10:05:01.000Z'),
    ...overrides,
  };
}

async function testDefaultSyncProjectsLocallyWithoutCentralForwarding() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'Mapped line' }, quantity: 1, price: { amount: '10.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a', title: 'Stored first' },
  ]);

  const result = await fixture.service.syncOrdersFromAllegro();

  assert.equal(result.totalSynced, 1);
  assert.equal(result.forwarding.enabled, false);
  assert.equal(result.forwarding.forwarded, 0);
  assert.equal(result.forwarding.skipped, 1);
  assert.equal(fixture.orderClientCalls.length, 0);
  assert.equal(fixture.logs.some((entry) => entry[0] === 'Projected Allegro order locally; central orders forwarding is disabled'), true);
  assert.equal(fixture.forwardingAttempts.length, 1);
  assert.equal(fixture.forwardingAttempts[0].status, 'DISABLED');
  assert.equal(fixture.forwardingAttempts[0].payloadEqualityStatus, 'FIRST_SEEN');
  assert.equal(fixture.forwardingAttempts[0].requestSummary.itemCount, 1);
}

async function testMultiLineOrderForwardsEachLineCatalogProductId() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'First line' }, quantity: 2, price: { amount: '10.00' } },
    { offer: { id: 'offer-2', name: 'Second line' }, quantity: 1, price: { amount: '5.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a', title: 'Stored first' },
    { id: 'db-offer-2', allegroOfferId: 'offer-2', accountId: ACCOUNT_ID, catalogProductId: 'catalog-b', title: 'Stored second' },
  ]);

  const result = await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(result.totalSynced, 1);
  assert.equal(result.forwarding.enabled, true);
  assert.equal(result.forwarding.forwarded, 1);
  assert.deepEqual(fixture.captured.offerFindMany.where.allegroOfferId.in.sort(), ['offer-1', 'offer-2']);
  assert.equal(fixture.captured.orderUpsert.create.catalogProductId, 'catalog-a');
  assert.equal(fixture.captured.orderUpsert.create.lineItemsCount, 2);
  assert.equal(fixture.captured.orderUpsert.create.marketplaceId, 'allegro-cz');
  assert.equal(fixture.captured.orderUpsert.create.paymentStatus, 'PAID');
  assert.equal(fixture.captured.lineItemCreateMany.data.length, 2);
  assert.equal(fixture.captured.lineItemCreateMany.data[0].allegroOfferExternalId, 'offer-1');
  assert.equal(fixture.captured.lineItemCreateMany.data[1].catalogProductId, 'catalog-b');
  assert.equal(fixture.orderClientCalls.length, 1);
  assert.equal(fixture.orderClientCalls[0].externalOrderId, 'allegro-order-1');
  assert.equal(fixture.orderClientCalls[0].channel, 'allegro');
  assert.equal(fixture.orderClientCalls[0].channelAccountId, ACCOUNT_ID);
  assert.equal(fixture.orderClientCalls[0].items.length, 2);
  assert.equal(fixture.orderClientCalls[0].items[0].productId, 'catalog-a');
  assert.equal(fixture.orderClientCalls[0].items[0].quantity, 2);
  assert.equal(fixture.orderClientCalls[0].items[0].totalPrice, 20);
  assert.equal(fixture.orderClientCalls[0].items[0].warehouseId, 'warehouse-main');
  assert.equal(fixture.orderClientCalls[0].items[1].warehouseId, 'warehouse-main');
  assert.equal(fixture.orderClientCalls[0].items[1].productId, 'catalog-b');
  assert.equal(fixture.orderClientCalls[0].items[1].quantity, 1);
  assert.equal(fixture.orderClientCalls[0].items[1].totalPrice, 5);
  assert.equal(fixture.orderClientCalls[0].total, 25);
  assert.equal(fixture.forwardingAttempts.length, 1);
  assert.equal(fixture.forwardingAttempts[0].status, 'FORWARDED');
  assert.equal(fixture.forwardingAttempts[0].idempotencyKey, 'orders.create.v1:allegro:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:allegro-order-1');
  assert.equal(fixture.forwardingAttempts[0].accountId, ACCOUNT_ID);
  assert.equal(fixture.forwardingAttempts[0].payloadEqualityStatus, 'FIRST_SEEN');
  assert.equal(typeof fixture.forwardingAttempts[0].payloadHash, 'string');
  assert.equal(fixture.forwardingAttempts[0].requestSummary.itemCount, 2);
  assert.equal(fixture.forwardingAttempts[0].responseSummary.id, 'central-order-1');
  assert.equal(fixture.warnings.length, 0);
}

async function testMissingPrimaryOfferStillPersistsCheckoutFormButSkipsCentralForward() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-missing', name: 'Missing first line' }, quantity: 1, price: { amount: '10.00' } },
    { offer: { id: 'offer-2', name: 'Mapped second line' }, quantity: 1, price: { amount: '15.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-2', allegroOfferId: 'offer-2', accountId: ACCOUNT_ID, catalogProductId: 'catalog-b' },
  ]);

  const result = await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(result.totalSynced, 1);
  assert.equal(result.forwarding.enabled, true);
  assert.equal(result.forwarding.skipped, 1);
  assert.equal(fixture.captured.orderUpsert.create.allegroOfferId, null);
  assert.equal(fixture.captured.orderUpsert.create.catalogProductId, null);
  assert.equal(fixture.captured.lineItemCreateMany.data.length, 2);
  assert.equal(fixture.captured.lineItemCreateMany.data[0].allegroOfferId, null);
  assert.equal(fixture.captured.lineItemCreateMany.data[1].allegroOfferId, 'db-offer-2');
  assert.equal(fixture.orderClientCalls.length, 0);
  assert.equal(fixture.warnings.length, 1);
  assert.equal(fixture.warnings[0][0], 'Skipped forwarding Allegro order to orders-microservice because forwarding requirements are incomplete');
  assert.deepEqual(fixture.warnings[0][1].missingOfferIds, ['offer-missing']);
  assert.equal(fixture.forwardingAttempts.length, 1);
  assert.equal(fixture.forwardingAttempts[0].status, 'BLOCKED');
  assert.deepEqual(fixture.forwardingAttempts[0].missingOfferIds, ['offer-missing']);
}

async function testMissingCatalogProductSkipsMalformedCentralForward() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'First line' }, quantity: 1, price: { amount: '10.00' } },
    { offer: { id: 'offer-2', name: 'Unmapped catalog line' }, quantity: 1, price: { amount: '15.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a' },
    { id: 'db-offer-2', allegroOfferId: 'offer-2', accountId: ACCOUNT_ID, catalogProductId: null },
  ]);

  await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(fixture.orderClientCalls.length, 0);
  assert.equal(fixture.warnings.length, 1);
  assert.ok(fixture.warnings[0][1].blockedReasons.includes('missing_catalog_product:line_1_missing_catalog_product_id'));
  assert.deepEqual(fixture.warnings[0][1].missingCatalogOfferIds, ['offer-2']);
  assert.equal(fixture.forwardingAttempts[0].status, 'BLOCKED');
  assert.deepEqual(fixture.forwardingAttempts[0].missingCatalogOfferIds, ['offer-2']);
}

async function testMissingWarehouseIdSkipsMalformedCentralForward() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'First line' }, quantity: 1, price: { amount: '10.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a' },
  ], { warehouseId: null });

  const result = await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(result.totalSynced, 1);
  assert.equal(result.forwarding.enabled, true);
  assert.equal(result.forwarding.skipped, 1);
  assert.equal(result.forwarding.forwarded, 0);
  assert.equal(fixture.orderClientCalls.length, 0);
  assert.equal(fixture.warnings.length, 1);
  assert.ok(fixture.warnings[0][1].blockedReasons.includes('[MISSING: warehouseId]:line_0_missing_warehouse_id'));
  assert.equal(fixture.forwardingAttempts.length, 1);
  assert.equal(fixture.forwardingAttempts[0].status, 'BLOCKED');
  assert.ok(fixture.forwardingAttempts[0].blockedReasons.includes('[MISSING: warehouseId]:line_0_missing_warehouse_id'));
}

async function testStockPrimaryWarehouseFallbackFeedsCentralForward() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'First line' }, quantity: 1, price: { amount: '10.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a' },
  ], { warehouseId: null, stockPrimaryWarehouseId: 'stock-primary-warehouse' });

  const result = await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(result.forwarding.forwarded, 1);
  assert.equal(fixture.orderClientCalls.length, 1);
  assert.equal(fixture.orderClientCalls[0].items[0].warehouseId, 'stock-primary-warehouse');
}


async function testForwardedOrderStillSucceedsWhenAuditWriteFails() {
  const order = buildAllegroOrder([
    { offer: { id: 'offer-1', name: 'Mapped line' }, quantity: 1, price: { amount: '10.00' } },
  ]);
  const fixture = createServiceFixture([order], [
    { id: 'db-offer-1', allegroOfferId: 'offer-1', accountId: ACCOUNT_ID, catalogProductId: 'catalog-a' },
  ], { failForwardingAttemptWrites: true });

  const result = await fixture.service.syncOrdersFromAllegro({
    forwardToOrdersMicroservice: true,
    confirmForwarding: ALLEGRO_ORDER_FORWARDING_CONFIRMATION,
  });

  assert.equal(result.forwarding.forwarded, 1);
  assert.equal(result.forwarding.failed, 0);
  assert.equal(fixture.orderClientCalls.length, 1);
  assert.equal(fixture.errors.some((entry) => entry[0] === 'Failed to record Allegro order forwarding attempt'), true);
  assert.equal(fixture.errors.some((entry) => entry[0] === 'Failed to forward order to orders-microservice'), false);
}

async function testGetOrdersProjectsCentralLifecycleFromLatestForwardingAttempt() {
  const fixture = createServiceFixture([], [], {
    localOrders: [
      buildLocalOrder({
        forwardingAttempts: [buildForwardedAttempt()],
      }),
    ],
    centralLifecycleReads: {
      'central-order-1': {
        id: 'central-order-1',
        status: 'processing',
        paymentStatus: 'paid',
        fulfillmentStatus: 'reserved',
        warehouseHandoff: { status: 'reserved' },
        updatedAt: '2026-06-26T10:06:00.000Z',
      },
    },
  });

  const result = await fixture.service.getOrders({ page: 1, limit: 25 });
  const readModel = result.items[0].centralOrderReadModel;

  assert.equal(fixture.captured.orderFindMany.select.forwardingAttempts.take, 1);
  assert.equal(fixture.captured.orderFindMany.select.forwardingAttempts.orderBy.attemptedAt, 'desc');
  assert.deepEqual(fixture.centralLifecycleReadCalls, ['central-order-1']);
  assert.equal('forwardingAttempts' in result.items[0], false);
  assert.equal(readModel.state, 'available');
  assert.equal(readModel.id, 'central-order-1');
  assert.equal(readModel.displayStatus, 'processing');
  assert.equal(readModel.paymentStatus, 'paid');
  assert.equal(readModel.fulfillmentStatus, 'reserved');
  assert.equal(readModel.warehouseHandoffStatus, 'reserved');
}

async function testGetOrdersFlagsMissingForwardingAttemptUnknown() {
  const fixture = createServiceFixture([], [], {
    localOrders: [buildLocalOrder()],
  });

  const result = await fixture.service.getOrders({ page: 1, limit: 25 });
  const readModel = result.items[0].centralOrderReadModel;

  assert.deepEqual(fixture.centralLifecycleReadCalls, []);
  assert.equal(readModel.state, 'unknown');
  assert.equal(readModel.reason, '[MISSING: central Orders forwarding attempt]');
}

async function testGetOrdersFlagsOrdersLifecycleReadFailureStale() {
  const fixture = createServiceFixture([], [], {
    localOrders: [buildLocalOrder({ forwardingAttempts: [buildForwardedAttempt()] })],
    centralLifecycleReads: {
      'central-order-1': { available: false, order: null, reason: ORDERS_LIFECYCLE_READ_UNAVAILABLE },
    },
  });

  const result = await fixture.service.getOrders({ page: 1, limit: 25 });
  const readModel = result.items[0].centralOrderReadModel;

  assert.equal(readModel.state, 'stale');
  assert.equal(readModel.id, 'central-order-1');
  assert.equal(readModel.reason, ORDERS_LIFECYCLE_READ_UNAVAILABLE);
}

async function testGetOrderStatisticsReturnsAggregateOrderDeliveryAndCentralCountsOnly() {
  const fixture = createServiceFixture([], [], {
    localOrders: [
      buildLocalOrder({ status: "READY_FOR_PROCESSING", paymentStatus: "PAID", fulfillmentStatus: "NEW", deliveryMethod: "Courier", trackingNumber: "track-1" }),
      buildLocalOrder({ id: "local-order-2", allegroOrderId: "allegro-order-2", status: "SENT", paymentStatus: "PAID", fulfillmentStatus: "SENT", deliveryMethod: null, trackingNumber: null }),
      buildLocalOrder({ id: "local-order-3", allegroOrderId: "allegro-order-3", status: "READY_FOR_PROCESSING", paymentStatus: null, fulfillmentStatus: null, deliveryMethod: "Pickup", trackingNumber: null }),
    ],
    forwardingAttempts: [
      buildForwardedAttempt({ id: "attempt-forwarded", status: "FORWARDED" }),
      buildForwardedAttempt({ id: "attempt-blocked", status: "BLOCKED" }),
      buildForwardedAttempt({ id: "attempt-failed", status: "FAILED" }),
    ],
  });

  const statistics = await fixture.service.getOrderStatistics();

  assert.equal(statistics.totals.orders, 3);
  assert.equal(statistics.totals.withTrackingNumber, 1);
  assert.equal(statistics.totals.missingTrackingNumber, 2);
  assert.equal(statistics.totals.withDeliveryMethod, 2);
  assert.equal(statistics.centralForwarding.forwarded, 1);
  assert.equal(statistics.centralForwarding.blocked, 1);
  assert.equal(statistics.centralForwarding.failed, 1);
  assert.deepEqual(statistics.statusCounts[0], { value: "READY_FOR_PROCESSING", count: 2 });
  assert.equal(statistics.delivery.fulfillmentStatusCounts.some((entry: any) => entry.value === "UNKNOWN" && entry.count === 1), true);
  assert.equal(JSON.stringify(statistics).includes("buyer@example.invalid"), false);
  assert.equal(JSON.stringify(statistics).includes("rawData"), false);
}


async function testOrderAffinityReplayCandidatesReturnBoundedMarketplaceEvents() {
  const fixture = createServiceFixture([], [], {
    localOrders: [
      buildLocalOrder({
        id: 'local-order-1',
        allegroOrderId: 'sensitive-marketplace-order-1',
        status: 'READY_FOR_PROCESSING',
        paymentStatus: 'PAID',
        paidAt: new Date('2026-07-03T09:00:00.000Z'),
        orderDate: new Date('2026-07-03T08:59:00.000Z'),
        currency: 'CZK',
        buyerEmail: 'buyer@example.invalid',
        deliveryAddress: { city: 'Do not expose' },
        lineItems: [
          { catalogProductId: '11111111-1111-4111-8111-111111111111', allegroOfferExternalId: 'offer-a', quantity: 2, price: 10, totalPrice: 20, createdAt: new Date('2026-07-03T09:00:00.000Z') },
          { catalogProductId: '22222222-2222-4222-8222-222222222222', allegroOfferExternalId: 'offer-b', quantity: 1, price: 5, totalPrice: 5, createdAt: new Date('2026-07-03T09:01:00.000Z') },
        ],
      }),
      buildLocalOrder({
        id: 'local-order-2',
        allegroOrderId: 'single-product-order',
        status: 'READY_FOR_PROCESSING',
        paymentStatus: 'PAID',
        lineItems: [
          { catalogProductId: '11111111-1111-4111-8111-111111111111', quantity: 1, price: 10, totalPrice: 10, createdAt: new Date('2026-07-03T09:02:00.000Z') },
        ],
      }),
    ],
  });

  const result = await fixture.service.getOrderAffinityReplayCandidates({ limit: 10, from: '2026-07-01T00:00:00.000Z' });

  assert.equal(fixture.captured.orderFindMany.where.status, 'READY_FOR_PROCESSING');
  assert.equal(fixture.captured.orderFindMany.take, 50);
  assert.equal(result.contract, ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT);
  assert.equal(result.sourceOwner, 'allegro-service');
  assert.equal(result.consumerOwner, 'marketing-microservice');
  assert.equal(result.count, 1);
  assert.equal(result.skippedRecords, 1);
  assert.equal(result.events[0].type, ALLEGRO_ORDER_AFFINITY_REPLAY_CONTRACT);
  assert.equal(result.events[0].source, 'allegro-service');
  assert.equal(result.events[0].payload.channel, 'allegro');
  assert.equal(result.events[0].payload.currency, 'CZK');
  assert.equal(result.events[0].payload.items.length, 2);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('buyer@example.invalid'), false);
  assert.equal(serialized.includes('Do not expose'), false);
  assert.equal(serialized.includes('sensitive-marketplace-order-1'), false);
}

export async function runOrdersServiceSpec(): Promise<void> {
  await testDefaultSyncProjectsLocallyWithoutCentralForwarding();
  await testMultiLineOrderForwardsEachLineCatalogProductId();
  await testMissingPrimaryOfferStillPersistsCheckoutFormButSkipsCentralForward();
  await testMissingCatalogProductSkipsMalformedCentralForward();
  await testMissingWarehouseIdSkipsMalformedCentralForward();
  await testStockPrimaryWarehouseFallbackFeedsCentralForward();
  await testForwardedOrderStillSucceedsWhenAuditWriteFails();
  await testGetOrdersProjectsCentralLifecycleFromLatestForwardingAttempt();
  await testGetOrdersFlagsMissingForwardingAttemptUnknown();
  await testGetOrdersFlagsOrdersLifecycleReadFailureStale();
  await testGetOrderStatisticsReturnsAggregateOrderDeliveryAndCentralCountsOnly();
  await testOrderAffinityReplayCandidatesReturnBoundedMarketplaceEvents();
}

if (require.main === module) {
  runOrdersServiceSpec()
    .then(() => process.stdout.write('orders.service.spec: PASS\n'))
    .catch((error) => {
      process.stderr.write('orders.service.spec: FAIL\n' + (error.stack || error.message) + '\n');
      process.exitCode = 1;
    });
}
