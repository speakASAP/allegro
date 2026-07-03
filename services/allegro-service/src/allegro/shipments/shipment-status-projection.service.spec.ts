import { strict as assert } from "assert";
import {
  ShipmentStatusProjectionService,
  buildShipmentStatusProjection,
} from "./shipment-status-projection.service";
import { ShipmentStatusSourceClient } from "./shipment-status-source.client";
import { shipmentStatusSnapshotFixtures } from "./shipment-status-snapshot.fixtures";

async function testBuildsSanitizedProjectionFromReadBundle() {
  const projection = buildShipmentStatusProjection({
    contract: "allegro.shipment_status_read_bundle.v1",
    source: "allegro-live-read",
    generatedAt: "2026-07-03T13:20:00.000Z",
    orders: [shipmentStatusSnapshotFixtures.singleWaybillDelivered],
  }, "2026-07-03T13:21:00.000Z");

  assert.equal(projection.contract, "allegro.shipment_status_projection.v1");
  assert.equal(projection.snapshotCount, 1);
  assert.deepEqual(projection.idempotencyKeys, [projection.snapshots[0].idempotencyKey]);
  assert.equal(projection.snapshots[0].shipment.latestStatus, "DELIVERED");
  assert.equal(projection.safety.mutatesWarehouse, false);
  assert.equal(projection.safety.mutatesOrders, false);

  const serialized = JSON.stringify(projection);
  for (const marker of ["synthetic-checkout-form-delivered", "synthetic-waybill-1", "trackingNumber", "buyerEmail", "rawData"]) {
    assert.ok(!serialized.includes(marker), `raw marker leaked into projection: ${marker}`);
  }
}

async function testProjectionServiceUsesReadOnlySourceClient() {
  const calls: string[] = [];
  const sourceClient = {
    async readShipmentStatusBundle(selection: any, options: any) {
      calls.push(`${selection.orders.length}:${options.readAt}`);
      return {
        contract: "allegro.shipment_status_read_bundle.v1" as const,
        source: "allegro-live-read" as const,
        generatedAt: options.readAt,
        orders: [shipmentStatusSnapshotFixtures.trackingNull],
      };
    },
  } as ShipmentStatusSourceClient;

  const service = new ShipmentStatusProjectionService(sourceClient);
  const projection = await service.buildReadOnlyProjection({
    orders: [{ accountId: "account-1", externalOrderId: "checkout-1" }],
  }, {
    token: "synthetic-token",
    readAt: "2026-07-03T13:22:00.000Z",
    generatedAt: "2026-07-03T13:23:00.000Z",
  });

  assert.deepEqual(calls, ["1:2026-07-03T13:22:00.000Z"]);
  assert.equal(projection.generatedAt, "2026-07-03T13:23:00.000Z");
  assert.equal(projection.snapshotCount, 1);
  assert.equal(projection.snapshots[0].shipment.latestStatus, "UNKNOWN");
}

async function runShipmentStatusProjectionServiceSpec(): Promise<void> {
  await testBuildsSanitizedProjectionFromReadBundle();
  await testProjectionServiceUsesReadOnlySourceClient();
}

if (require.main === module) {
  runShipmentStatusProjectionServiceSpec()
    .then(() => process.stdout.write("shipment-status-projection.service.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`shipment-status-projection.service.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
