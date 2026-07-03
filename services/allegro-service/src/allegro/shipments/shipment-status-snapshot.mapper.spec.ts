import { strict as assert } from "assert";
import {
  assertShipmentSnapshotIsRedacted,
  buildShipmentStatusSnapshots,
  buildTrackingBatches,
  hashIdentifier,
  SHIPMENT_MISSING_SCOPE_REASON,
  SHIPMENT_TRACKING_ABSENT_REASON,
} from "./shipment-status-snapshot.mapper";
import { shipmentStatusSnapshotFixtures } from "./shipment-status-snapshot.fixtures";

function assertHashed(value: string | null): void {
  assert.ok(value, "expected hash value");
  assert.match(value || "", /^sha256:[a-f0-9]{64}$/);
}

function assertNoRawIdentifier(snapshot: any, rawIdentifier: string): void {
  assert.ok(!JSON.stringify(snapshot).includes(rawIdentifier), `raw identifier leaked: ${rawIdentifier}`);
}

async function testOrderWithNoShipmentsEmitsUnknownWithoutWriteFallback() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.orderWithNoShipments);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].shipment.latestStatus, "UNKNOWN");
  assert.equal(snapshots[0].shipment.packageCount, 0);
  assert.equal(snapshots[0].sourceRead.status, "PARTIAL");
  assert.equal(snapshots[0].sourceRead.reason, SHIPMENT_TRACKING_ABSENT_REASON);
  assert.equal(snapshots[0].sourceRead.shipmentManagementEndpoint, "not_used");
}

async function testSingleWaybillDeliveredHashesExternalIdentifiers() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].shipment.latestStatus, "DELIVERED");
  assert.equal(snapshots[0].shipment.latestStatusAt, "2026-07-03T10:45:00.000Z");
  assertHashed(snapshots[0].accountId);
  assertHashed(snapshots[0].order.externalOrderId);
  assertHashed(snapshots[0].shipment.shipmentId);
  assertHashed(snapshots[0].shipment.waybillHash);
  assertNoRawIdentifier(snapshots[0], "synthetic-checkout-form-delivered");
  assertNoRawIdentifier(snapshots[0], "synthetic-waybill-1");
}

async function testMultiPackageSingleCarrierBatchesWaybillsAtTwenty() {
  const fixture = shipmentStatusSnapshotFixtures.multiPackageSingleCarrier;
  const snapshots = buildShipmentStatusSnapshots(fixture);
  const batches = buildTrackingBatches(fixture.shipments);
  assert.equal(snapshots.length, 22);
  assert.deepEqual(batches.map((batch) => batch.waybillHashes.length), [20, 2]);
  assert.ok(batches.every((batch) => batch.carrierId === "INPOST"));
}

async function testMixedCarrierGroupsByCarrier() {
  const fixture = shipmentStatusSnapshotFixtures.mixedCarrier;
  const batches = buildTrackingBatches(fixture.shipments);
  assert.deepEqual(batches.map((batch) => batch.carrierId).sort(), ["DPD", "INPOST"]);
  assert.equal(buildShipmentStatusSnapshots(fixture)[1].shipment.latestStatus, "DELIVERED");
}

async function testTrackingNullEmitsUnknownReason() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.trackingNull);
  assert.equal(snapshots[0].shipment.latestStatus, "UNKNOWN");
  assert.equal(snapshots[0].sourceRead.reason, SHIPMENT_TRACKING_ABSENT_REASON);
}

async function testOauth403EmitsUnavailableWithoutSecretOutput() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.oauth403);
  assert.equal(snapshots[0].sourceRead.status, "UNAVAILABLE");
  assert.equal(snapshots[0].sourceRead.reason, SHIPMENT_MISSING_SCOPE_REASON);
  assert.ok(!JSON.stringify(snapshots[0]).toLowerCase().includes("bearer"));
  assert.ok(!JSON.stringify(snapshots[0]).toLowerCase().includes("token"));
}

async function testShipmentManagementDetailIsRedactedToContractFields() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.shipmentManagementDetailRedaction);
  const snapshotJson = JSON.stringify(snapshots[0]);
  assert.equal(snapshots[0].sourceRead.shipmentManagementEndpoint, "/shipment-management/shipments/{shipmentId}");
  assert.equal(snapshots[0].shipment.packageCount, 2);
  assert.equal(snapshots[0].shipment.latestStatus, "RELEASED_FOR_DELIVERY");
  assert.ok(!snapshotJson.includes("intentionallyIgnored"));
  assertShipmentSnapshotIsRedacted(snapshots[0]);
}

async function testAllegroOriginFilterIgnoresOtherChannels() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.allegroOriginFilter);
  assert.deepEqual(snapshots, []);
}

async function testIdempotencyKeyUsesHashedIdentity() {
  const snapshots = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
  const snapshot = snapshots[0];
  assert.equal(
    snapshot.idempotencyKey,
    `allegro.shipment-status:v1:${snapshot.accountId}:${snapshot.order.externalOrderId}:DPD:${snapshot.shipment.waybillHash}`,
  );
  assert.equal(hashIdentifier(" synthetic-waybill-1 "), snapshot.shipment.waybillHash);
}

export async function runShipmentStatusSnapshotMapperSpec(): Promise<void> {
  await testOrderWithNoShipmentsEmitsUnknownWithoutWriteFallback();
  await testSingleWaybillDeliveredHashesExternalIdentifiers();
  await testMultiPackageSingleCarrierBatchesWaybillsAtTwenty();
  await testMixedCarrierGroupsByCarrier();
  await testTrackingNullEmitsUnknownReason();
  await testOauth403EmitsUnavailableWithoutSecretOutput();
  await testShipmentManagementDetailIsRedactedToContractFields();
  await testAllegroOriginFilterIgnoresOtherChannels();
  await testIdempotencyKeyUsesHashedIdentity();
}

if (require.main === module) {
  runShipmentStatusSnapshotMapperSpec()
    .then(() => process.stdout.write("shipment-status-snapshot.mapper.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`shipment-status-snapshot.mapper.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
