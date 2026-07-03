import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  SHIPMENT_STATUS_LIVE_READ_CONFIRMATION,
  buildShipmentStatusSnapshotFile,
  loadShipmentStatusReadBundle,
  parseExportArgs,
  writeShipmentStatusSnapshotFile,
} from "./export-shipment-status-snapshots";
import { shipmentStatusSnapshotFixtures } from "../allegro/shipments/shipment-status-snapshot.fixtures";
import { loadReplaySnapshots } from "./replay-shipment-status-handoff";

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random()}.json`);
}

function writeJson(value: unknown): string {
  const filePath = tmpFile("shipment-status-read-bundle");
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  return filePath;
}

async function testParsesBundleAndOutputArgs() {
  assert.deepEqual(parseExportArgs(["--read-bundle-file", "/tmp/in.json", "--output-file", "/tmp/out.json"]), {
    readBundleFile: "/tmp/in.json",
    outputFile: "/tmp/out.json",
    liveRead: false,
    help: false,
  });
  assert.deepEqual(parseExportArgs(["--live-read", "--confirm-live-read", SHIPMENT_STATUS_LIVE_READ_CONFIRMATION]), {
    liveRead: true,
    confirmLiveRead: SHIPMENT_STATUS_LIVE_READ_CONFIRMATION,
    help: false,
  });
}

async function testBuildsReplayCompatibleSnapshotFileWithoutRawIdentifiers() {
  const bundle = {
    contract: "allegro.shipment_status_read_bundle.v1" as const,
    orders: [shipmentStatusSnapshotFixtures.singleWaybillDelivered],
  };
  const snapshotFile = buildShipmentStatusSnapshotFile(bundle, "2026-07-03T12:30:00.000Z");
  assert.equal(snapshotFile.contract, "allegro.shipment_status_snapshot_file.v1");
  assert.equal(snapshotFile.snapshotCount, 1);
  assert.equal(snapshotFile.safety.mutatesWarehouse, false);
  const json = JSON.stringify(snapshotFile);
  for (const marker of ["synthetic-checkout-form-delivered", "synthetic-waybill-1", "trackingNumber", "buyerEmail", "rawData"]) {
    assert.ok(!json.includes(marker), `raw marker leaked into snapshot file: ${marker}`);
  }
}

async function testWritesFileConsumableByReplayCaller() {
  const outputFile = tmpFile("shipment-status-snapshots");
  const snapshotFile = buildShipmentStatusSnapshotFile({ orders: [shipmentStatusSnapshotFixtures.singleWaybillDelivered] }, "2026-07-03T12:31:00.000Z");
  writeShipmentStatusSnapshotFile(snapshotFile, outputFile);
  const replaySnapshots = loadReplaySnapshots(outputFile);
  assert.equal(replaySnapshots.length, 1);
  assert.equal(replaySnapshots[0].contract, "allegro.shipment_status_snapshot.v1");
}

async function testLoadsReadBundleFromArrayOrObject() {
  const arrayFile = writeJson([shipmentStatusSnapshotFixtures.trackingNull]);
  const objectFile = writeJson({ orders: [shipmentStatusSnapshotFixtures.orderWithNoShipments] });
  assert.equal(loadShipmentStatusReadBundle(arrayFile).orders.length, 1);
  assert.equal(loadShipmentStatusReadBundle(objectFile).orders.length, 1);
}

async function testRejectsRawMarkerKeyAfterMapping() {
  const unsafeOrder = {
    ...shipmentStatusSnapshotFixtures.singleWaybillDelivered,
    shipments: [
      {
        ...shipmentStatusSnapshotFixtures.singleWaybillDelivered.shipments[0],
        trackingDetails: { statuses: [{ status: "DELIVERED", occurredAt: "2026-07-03T10:45:00Z" }] },
      },
    ],
  };
  const snapshotFile = buildShipmentStatusSnapshotFile({ orders: [unsafeOrder] });
  const json = JSON.stringify(snapshotFile);
  assert.ok(!json.includes("synthetic-waybill-1"));
}

export async function runExportShipmentStatusSnapshotsSpec(): Promise<void> {
  await testParsesBundleAndOutputArgs();
  await testBuildsReplayCompatibleSnapshotFileWithoutRawIdentifiers();
  await testWritesFileConsumableByReplayCaller();
  await testLoadsReadBundleFromArrayOrObject();
  await testRejectsRawMarkerKeyAfterMapping();
}

if (require.main === module) {
  runExportShipmentStatusSnapshotsSpec()
    .then(() => process.stdout.write("export-shipment-status-snapshots.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`export-shipment-status-snapshots.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
