import { strict as assert } from "assert";
import {
  buildAllegroShipmentSourceReferenceHash,
  buildWarehouseShipmentCorrelationRequest,
  WarehouseShipmentCorrelationClient,
} from "./warehouse-shipment-correlation.client";
import { buildShipmentStatusSnapshots } from "./shipment-status-snapshot.mapper";
import { shipmentStatusSnapshotFixtures } from "./shipment-status-snapshot.fixtures";

const rawMarkers = [
  "synthetic-account-1",
  "synthetic-checkout-form-delivered",
  "synthetic-shipment-1",
  "synthetic-waybill-1",
  "trackingNumber",
  "trackingUrl",
  "buyerEmail",
  "rawData",
];

function snapshot() {
  return buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered)[0];
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

async function testBuildsWarehouseEndpointAndPayloadFromSanitizedSnapshot() {
  const built = buildWarehouseShipmentCorrelationRequest(snapshot(), "http://warehouse-microservice:3201/");
  assert.ok(built);
  assert.equal(
    built?.url,
    "http://warehouse-microservice:3201/api/fulfillment-orders/order/22222222-2222-4222-8222-222222222222/provider-shipment-correlations",
  );
  assert.equal(built?.payload.provider, "allegro");
  assert.equal(built?.payload.sourceChannel, "shipment-status-snapshot");
  assert.match(built?.payload.sourceReferenceHash || "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(built?.payload.sourceReferenceHash, buildAllegroShipmentSourceReferenceHash(snapshot()));
  assert.equal(built?.payload.reasonCode, "ALLEGRO_SHIPMENT_CORRELATION_APPROVED");
}

async function testPayloadContainsNoRawProviderOrBuyerMarkers() {
  const built = buildWarehouseShipmentCorrelationRequest(snapshot(), "http://warehouse-microservice:3201");
  const json = JSON.stringify(built?.payload);
  for (const marker of rawMarkers) {
    assert.ok(!json.includes(marker), `raw marker leaked into Warehouse correlation payload: ${marker}`);
  }
}

async function testMissingCentralOrderIdSkipsProducerRequest() {
  const [withoutCentralOrder] = buildShipmentStatusSnapshots({
    ...shipmentStatusSnapshotFixtures.singleWaybillDelivered,
    centralOrderId: null,
  });
  assert.equal(buildWarehouseShipmentCorrelationRequest(withoutCentralOrder), null);
}

async function testClientIsDisabledByDefaultAndDoesNotPost() {
  await withEnv({
    ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED: undefined,
    WAREHOUSE_SERVICE_TOKEN: "synthetic-token",
  }, async () => {
    const client = new WarehouseShipmentCorrelationClient({ post: async () => { throw new Error("should not post"); } } as any);
    const result = await client.publishSnapshotCorrelation(snapshot(), async () => {
      throw new Error("should not post");
    });
    assert.equal(result.status, "disabled");
  });
}

async function testClientPostsOnlyWhenEnabledAndConfigured() {
  await withEnv({
    ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED: "true",
    WAREHOUSE_SERVICE_URL: "http://warehouse-microservice:3201/",
    WAREHOUSE_SERVICE_TOKEN: "synthetic-token",
  }, async () => {
    const calls: any[] = [];
    const client = new WarehouseShipmentCorrelationClient({ post: async () => ({ data: { success: true } }) } as any);
    const result = await client.publishSnapshotCorrelation(snapshot(), async (url, payload, options) => {
      calls.push({ url, payload, options });
      return { success: true };
    });

    assert.equal(result.status, "posted");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, "Bearer synthetic-token");
    assert.equal(calls[0].payload.provider, "allegro");
    assert.equal(calls[0].payload.sourceChannel, "shipment-status-snapshot");
  });
}

async function testEnabledClientBlocksWithoutWarehouseToken() {
  await withEnv({
    ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED: "true",
    WAREHOUSE_SERVICE_TOKEN: undefined,
    WAREHOUSE_INTERNAL_SERVICE_TOKEN: undefined,
    ALLEGRO_INTERNAL_SERVICE_TOKEN: undefined,
    INTERNAL_SERVICE_TOKEN: undefined,
  }, async () => {
    const client = new WarehouseShipmentCorrelationClient({ post: async () => ({ data: { success: true } }) } as any);
    const result = await client.publishSnapshotCorrelation(snapshot(), async () => {
      throw new Error("should not post");
    });
    assert.equal(result.status, "blocked");
  });
}

async function testEnabledClientBlocksWithOnlyBroadInternalFallbackTokens() {
  await withEnv({
    ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED: "true",
    WAREHOUSE_SERVICE_TOKEN: undefined,
    WAREHOUSE_INTERNAL_SERVICE_TOKEN: undefined,
    ALLEGRO_INTERNAL_SERVICE_TOKEN: "broad-allegro-token",
    INTERNAL_SERVICE_TOKEN: "generic-internal-token",
  }, async () => {
    const client = new WarehouseShipmentCorrelationClient({ post: async () => ({ data: { success: true } }) } as any);
    const result = await client.publishSnapshotCorrelation(snapshot(), async () => {
      throw new Error("should not post");
    });
    assert.equal(result.status, "blocked");
  });
}

export async function runWarehouseShipmentCorrelationClientSpec(): Promise<void> {
  await testBuildsWarehouseEndpointAndPayloadFromSanitizedSnapshot();
  await testPayloadContainsNoRawProviderOrBuyerMarkers();
  await testMissingCentralOrderIdSkipsProducerRequest();
  await testClientIsDisabledByDefaultAndDoesNotPost();
  await testClientPostsOnlyWhenEnabledAndConfigured();
  await testEnabledClientBlocksWithoutWarehouseToken();
  await testEnabledClientBlocksWithOnlyBroadInternalFallbackTokens();
}

if (require.main === module) {
  runWarehouseShipmentCorrelationClientSpec()
    .then(() => process.stdout.write("warehouse-shipment-correlation.client.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`warehouse-shipment-correlation.client.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
