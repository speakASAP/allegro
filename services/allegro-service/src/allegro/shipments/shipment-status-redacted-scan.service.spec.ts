import { strict as assert } from "assert";
import {
  InternalShipmentStatusController,
  ShipmentStatusRedactedScanService,
} from "./shipment-status-redacted-scan.service";

function createProjection(statuses: string[]) {
  return {
    contract: "allegro.shipment_status_projection.v1",
    source: "allegro-service",
    channel: "allegro",
    generatedAt: "2026-07-03T20:00:00.000Z",
    snapshotCount: statuses.length,
    idempotencyKeys: statuses.map((status) => `idempotency-${status}`),
    snapshots: statuses.map((status) => ({
      contract: "allegro.shipment_status_snapshot.v1",
      source: "allegro-service",
      channel: "allegro",
      accountId: "sha256:redacted-account",
      order: { localOrderId: "sha256:redacted-local", externalOrderId: "sha256:redacted-order", centralOrderId: "central-redacted" },
      shipment: {
        shipmentId: "sha256:redacted-shipment",
        carrierId: "DPD",
        waybillHash: "sha256:redacted-waybill",
        packageCount: 1,
        latestStatus: status,
        latestStatusAt: null,
        trackingUpdatedAt: null,
      },
      sourceRead: {
        shipmentsEndpoint: "/order/checkout-forms/{id}/shipments",
        trackingEndpoint: "/order/carriers/{carrierId}/tracking",
        shipmentManagementEndpoint: "not_used",
        readAt: "2026-07-03T20:00:00.000Z",
        status: "AVAILABLE",
        reason: null,
      },
      idempotencyKey: `idempotency-${status}`,
    })),
    safety: {
      mutates: false,
      mutatesAllegro: false,
      mutatesWarehouse: false,
      mutatesOrders: false,
      persistsRawProviderPayload: false,
      writesAllowed: [],
      writesForbidden: [],
    },
  } as any;
}

async function testRedactedScanAggregatesOnlySanitizedCounts() {
  const prisma = {
    allegroOrderForwardingAttempt: {
      findMany: async () => [{
        localOrderId: "raw-local-order-id",
        accountId: "raw-account-id",
        externalOrderId: "raw-checkout-form-id",
        responseSummary: { id: "central-order-id" },
        account: { id: "raw-account-id", userId: "raw-user-id" },
      }],
    },
  };
  const auth = {
    getShipmentStatusScanAccessTokenForAccount: async () => "raw-oauth-token",
  };
  const projection = {
    buildReadOnlyProjection: async (selection: any, options: any) => {
      assert.equal(selection.orders[0].externalOrderId, "raw-checkout-form-id");
      assert.equal(options.token, "raw-oauth-token");
      return createProjection(["DELIVERED", "UNKNOWN"]);
    },
  };

  const service = new ShipmentStatusRedactedScanService(prisma as any, auth as any, projection as any);
  const result = await service.scan({ limit: 5 });

  assert.equal(result.contract, "allegro.shipment_status_redacted_scan.v1");
  assert.equal(result.candidatesChecked, 1);
  assert.equal(result.scanned, 1);
  assert.equal(result.snapshotCount, 2);
  assert.equal(result.nonUnknownStatusCount, 1);
  assert.equal(result.latestStatusCounts.DELIVERED, 1);
  assert.equal(result.latestStatusCounts.UNKNOWN, 1);
  assert.equal(result.sourceReadStatusCounts.AVAILABLE, 2);
  assert.equal(result.safety.refreshesOAuthToken, false);
  assert.equal(result.safety.returnsRawIds, false);

  const serialized = JSON.stringify(result);
  for (const forbidden of ["raw-oauth-token", "raw-checkout-form-id", "raw-account-id", "raw-local-order-id", "raw-waybill"]) {
    assert.equal(serialized.includes(forbidden), false, `raw marker leaked: ${forbidden}`);
  }
}

async function testUnknownOnlyScanKeepsMissingBlocker() {
  const prisma = {
    allegroOrderForwardingAttempt: {
      findMany: async () => [{
        localOrderId: "local",
        accountId: "account",
        externalOrderId: "checkout",
        responseSummary: { id: "central" },
        account: { id: "account", userId: "user" },
      }],
    },
  };
  const auth = { getShipmentStatusScanAccessTokenForAccount: async () => "token" };
  const projection = { buildReadOnlyProjection: async () => createProjection(["UNKNOWN"]) };

  const service = new ShipmentStatusRedactedScanService(prisma as any, auth as any, projection as any);
  const result = await service.scan({});

  assert.deepEqual(result.blockers, ["[MISSING: Allegro provider sample with carrier tracking status other than UNKNOWN]"]);
}

async function testControllerRequiresAllowedInternalService() {
  const service = { scan: async () => ({ contract: "allegro.shipment_status_redacted_scan.v1" }) };
  const config = {
    get: (key: string) => key === "ALLEGRO_INTERNAL_SERVICE_TOKEN" ? "secret-token" : undefined,
  };
  const controller = new InternalShipmentStatusController(service as any, config as any);

  await assert.rejects(
    () => controller.redactedScan({}, undefined, undefined, "orders-microservice"),
    (error: any) => error?.getStatus?.() === 401,
  );
  await assert.rejects(
    () => controller.redactedScan({}, "secret-token", undefined, "unknown-service"),
    (error: any) => error?.getStatus?.() === 401,
  );

  const result = await controller.redactedScan({ limit: 1 }, "Bearer secret-token", undefined, "orders-microservice");
  assert.equal(result.success, true);
}

async function runShipmentStatusRedactedScanSpec(): Promise<void> {
  await testRedactedScanAggregatesOnlySanitizedCounts();
  await testUnknownOnlyScanKeepsMissingBlocker();
  await testControllerRequiresAllowedInternalService();
}

if (require.main === module) {
  runShipmentStatusRedactedScanSpec()
    .then(() => process.stdout.write("shipment-status-redacted-scan.service.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`shipment-status-redacted-scan.service.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
