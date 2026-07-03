import { strict as assert } from "assert";
import { ShipmentStatusHandoffService } from "./shipment-status-handoff.service";
import { buildShipmentStatusSnapshots } from "./shipment-status-snapshot.mapper";
import { shipmentStatusSnapshotFixtures } from "./shipment-status-snapshot.fixtures";

function snapshots() {
  return buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
}

async function testPublishesEachSanitizedSnapshotThroughWarehouseClient() {
  const calls: string[] = [];
  const service = new ShipmentStatusHandoffService({
    publishSnapshotCorrelation: async (snapshot: any) => {
      calls.push(snapshot.idempotencyKey);
      return {
        status: "posted",
        orderId: snapshot.order.centralOrderId,
        sourceReferenceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        response: { success: true },
      };
    },
  } as any);

  const summary = await service.publishWarehouseCorrelations(snapshots());
  assert.equal(summary.contract, "allegro.shipment_status_handoff.v1");
  assert.equal(summary.total, 1);
  assert.equal(summary.posted, 1);
  assert.equal(summary.disabled, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.items[0].status, "posted");
  assert.equal(summary.items[0].orderId, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.length, 1);
}

async function testAggregatesDisabledSkippedBlockedAndFailedWithoutThrowing() {
  const base = snapshots()[0];
  const inputs = [base, base, base, base];
  let index = 0;
  const results = [
    { status: "disabled", reason: "ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED_NOT_TRUE" },
    { status: "skipped", reason: "MISSING_CENTRAL_ORDER_ID" },
    { status: "blocked", reason: "MISSING_WAREHOUSE_CONFIG" },
  ];
  const service = new ShipmentStatusHandoffService({
    publishSnapshotCorrelation: async () => {
      const result = results[index++];
      if (!result) {
        throw new Error("synthetic post failure");
      }
      return result;
    },
  } as any);

  const summary = await service.publishWarehouseCorrelations(inputs);
  assert.equal(summary.total, 4);
  assert.equal(summary.disabled, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.items[3].reason, "synthetic post failure");
}

async function testSummaryDoesNotIncludeRawProviderOrBuyerMarkers() {
  const service = new ShipmentStatusHandoffService({
    publishSnapshotCorrelation: async (snapshot: any) => ({
      status: "posted",
      orderId: snapshot.order.centralOrderId,
      sourceReferenceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      response: { success: true },
    }),
  } as any);

  const summary = await service.publishWarehouseCorrelations(snapshots());
  const json = JSON.stringify(summary);
  for (const marker of [
    "synthetic-checkout-form-delivered",
    "synthetic-shipment-1",
    "synthetic-waybill-1",
    "trackingNumber",
    "trackingUrl",
    "buyerEmail",
    "rawData",
  ]) {
    assert.ok(!json.includes(marker), `raw marker leaked from handoff summary: ${marker}`);
  }
}

export async function runShipmentStatusHandoffServiceSpec(): Promise<void> {
  await testPublishesEachSanitizedSnapshotThroughWarehouseClient();
  await testAggregatesDisabledSkippedBlockedAndFailedWithoutThrowing();
  await testSummaryDoesNotIncludeRawProviderOrBuyerMarkers();
}

if (require.main === module) {
  runShipmentStatusHandoffServiceSpec()
    .then(() => process.stdout.write("shipment-status-handoff.service.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`shipment-status-handoff.service.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
