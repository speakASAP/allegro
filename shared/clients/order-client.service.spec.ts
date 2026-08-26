import { strict as assert } from 'assert';
import { of } from 'rxjs';
import { ORDERS_LIFECYCLE_READ_UNAVAILABLE, OrderClientService } from './order-client.service';

type EnvKeys =
  | 'ORDERS_SERVICE_TOKEN'
  | 'ALLEGRO_INTERNAL_SERVICE_TOKEN'
  | 'ORDERS_INTERNAL_SERVICE_TOKEN'
  | 'ORDER_SERVICE_INTERNAL_TOKEN'
  | 'INTERNAL_SERVICE_TOKEN'
  | 'ORDER_SERVICE_CALLER_SERVICE_NAME'
  | 'ALLEGRO_CALLER_SERVICE_NAME';

const ENV_KEYS: EnvKeys[] = [
  'ORDERS_SERVICE_TOKEN',
  'ALLEGRO_INTERNAL_SERVICE_TOKEN',
  'ORDERS_INTERNAL_SERVICE_TOKEN',
  'ORDER_SERVICE_INTERNAL_TOKEN',
  'INTERNAL_SERVICE_TOKEN',
  'ORDER_SERVICE_CALLER_SERVICE_NAME',
  'ALLEGRO_CALLER_SERVICE_NAME',
];

function syntheticOrderPayload() {
  return {
    externalOrderId: 'allegro-order-1',
    channel: 'allegro',
    channelAccountId: 'account-1',
    items: [
      {
        productId: 'catalog-product-1',
        sku: null,
        title: 'Catalog product',
        quantity: 1,
        unitPrice: 10,
        totalPrice: 10,
        warehouseId: 'warehouse-main',
      },
    ],
    subtotal: 10,
    shippingCost: 0,
    taxAmount: 0,
    total: 10,
    currency: 'PLN',
    orderedAt: new Date('2026-06-26T10:00:00.000Z'),
  };
}

async function withCleanOrderEnv<T>(env: Partial<Record<EnvKeys, string>>, run: () => Promise<T>): Promise<T> {
  const previous = new Map<EnvKeys, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env) as Array<[EnvKeys, string]>) {
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createFixture(options: { getResponse?: any; getError?: any } = {}) {
  const getCalls: any[] = [];
  const postCalls: any[] = [];
  const warnings: any[] = [];
  const logs: any[] = [];
  const errors: any[] = [];
  const httpService = {
    post: (...args: any[]) => {
      postCalls.push(args);
      return of({ data: { data: { id: 'central-order-1' } } });
    },
    put: (...args: any[]) => of({ data: { data: { ok: true, args } } }),
    get: (...args: any[]) => {
      getCalls.push(args);
      if (options.getError) {
        throw options.getError;
      }
      if (options.getResponse) {
        return of(options.getResponse);
      }
      return of({ data: { data: [] } });
    },
  };
  const logger = {
    log: (...args: any[]) => logs.push(args),
    warn: (...args: any[]) => warnings.push(args),
    error: (...args: any[]) => errors.push(args),
  };
  const service = new OrderClientService(httpService as any, logger as any);
  return { service, getCalls, postCalls, warnings, logs, errors };
}

async function testCreateOrderSendsMachineAuthHeaders() {
  await withCleanOrderEnv({
    ALLEGRO_INTERNAL_SERVICE_TOKEN: 'synthetic-orders-token',
  }, async () => {
    const fixture = createFixture();

    await fixture.service.createOrder(syntheticOrderPayload() as any);

    assert.equal(fixture.postCalls.length, 1);
    assert.equal(fixture.postCalls[0][0], 'http://orders-microservice:3203/api/orders');
    assert.equal(fixture.postCalls[0][1].contractVersion, 'orders.create.v1');
    assert.equal(fixture.postCalls[0][1].items[0].warehouseId, 'warehouse-main');
    assert.equal(fixture.postCalls[0][2].headers['x-internal-service-token'], 'synthetic-orders-token');
    assert.equal(fixture.postCalls[0][2].headers['x-service-name'], 'allegro-service');
  });
}

async function testCreateOrderFailsClosedWithoutMachineCredential() {
  await withCleanOrderEnv({}, async () => {
    const fixture = createFixture();

    await assert.rejects(() => fixture.service.createOrder(syntheticOrderPayload() as any), /\[MISSING: Orders runtime credential\]/);
    assert.equal(fixture.postCalls.length, 0);
    assert.equal(fixture.warnings.length, 1);
  });
}

async function testGetOrderLifecycleReadsCentralOrderById() {
  await withCleanOrderEnv({
    ALLEGRO_INTERNAL_SERVICE_TOKEN: 'synthetic-orders-token',
  }, async () => {
    const fixture = createFixture({
      getResponse: { data: { data: { id: 'central-order-1', lifecycleStage: 'warehouse_collecting', status: 'warehouse_collecting', rawStatus: 'processing' } } },
    });

    const result = await fixture.service.getOrderLifecycle('central-order-1');

    assert.equal(result.available, true);
    assert.equal(result.order.id, 'central-order-1');
    assert.equal(result.order.status, 'warehouse_collecting');
    assert.equal(result.order.rawStatus, 'processing');
    assert.equal(fixture.getCalls.length, 1);
    assert.equal(fixture.getCalls[0][0], 'http://orders-microservice:3203/api/orders/central-order-1/lifecycle');
    assert.equal(fixture.getCalls[0][1].headers['x-internal-service-token'], 'synthetic-orders-token');
    assert.equal(fixture.getCalls[0][1].headers['x-service-name'], 'allegro-service');
  });
}

async function testGetOrderLifecycleReturnsUnavailableWhenReadFails() {
  await withCleanOrderEnv({}, async () => {
    const fixture = createFixture({ getError: { response: { status: 404 }, message: 'not found' } });

    const result = await fixture.service.getOrderLifecycle('central-order-1');

    assert.equal(result.available, false);
    assert.equal(result.order, null);
    assert.equal(result.reason, ORDERS_LIFECYCLE_READ_UNAVAILABLE);
    assert.equal(result.statusCode, 404);
  });
}

async function testCreateOrderPrefersPerPairBearerToken() {
  await withCleanOrderEnv({
    ORDERS_SERVICE_TOKEN: 'synthetic-per-pair-jwt',
    ALLEGRO_INTERNAL_SERVICE_TOKEN: 'synthetic-orders-token',
  }, async () => {
    const fixture = createFixture();

    await fixture.service.createOrder(syntheticOrderPayload() as any);

    const headers = fixture.postCalls[0][2].headers;
    // The per-pair principal wins even when the shared static token is also present.
    assert.equal(headers.authorization, 'Bearer synthetic-per-pair-jwt');
    assert.equal(headers['x-service-name'], 'allegro-service');
    // The shared credential must not be sent alongside it.
    assert.equal(headers['x-internal-service-token'], undefined);
    // Preferring the per-pair token is not a fallback, so it must not warn.
    assert.equal(fixture.warnings.length, 0);
  });
}

async function testStaticTokenFallbackWarns() {
  await withCleanOrderEnv({
    ALLEGRO_INTERNAL_SERVICE_TOKEN: 'synthetic-orders-token',
  }, async () => {
    const fixture = createFixture();

    await fixture.service.createOrder(syntheticOrderPayload() as any);

    assert.equal(fixture.postCalls[0][2].headers['x-internal-service-token'], 'synthetic-orders-token');
    assert.equal(fixture.postCalls[0][2].headers.authorization, undefined);
    // Falling back to the shared credential must be visible, never silent.
    assert.equal(fixture.warnings.length, 1);
    assert.match(String(fixture.warnings[0][0]), /ORDERS_SERVICE_TOKEN is not set/);
  });
}

export async function runOrderClientServiceSpec(): Promise<void> {
  await testCreateOrderSendsMachineAuthHeaders();
  await testCreateOrderPrefersPerPairBearerToken();
  await testStaticTokenFallbackWarns();
  await testCreateOrderFailsClosedWithoutMachineCredential();
  await testGetOrderLifecycleReadsCentralOrderById();
  await testGetOrderLifecycleReturnsUnavailableWhenReadFails();
}

if (require.main === module) {
  runOrderClientServiceSpec()
    .then(() => process.stdout.write('order-client.service.spec: PASS\n'))
    .catch((error) => {
      process.stderr.write('order-client.service.spec: FAIL\n' + (error.stack || error.message) + '\n');
      process.exitCode = 1;
    });
}
