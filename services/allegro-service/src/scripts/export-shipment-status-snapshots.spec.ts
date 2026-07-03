import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  SHIPMENT_STATUS_LIVE_READ_CONFIRMATION,
  buildReadBundleFromLiveShipmentReads,
  buildShipmentStatusSnapshotFile,
  loadLiveShipmentReadSelection,
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

async function testParsesBundleOutputAndLiveReadArgs() {
  assert.deepEqual(parseExportArgs(["--read-bundle-file", "/tmp/in.json", "--output-file", "/tmp/out.json"]), {
    readBundleFile: "/tmp/in.json",
    outputFile: "/tmp/out.json",
    liveRead: false,
    language: "cs-CZ",
    help: false,
  });
  assert.deepEqual(parseExportArgs([
    "--live-read",
    "--live-read-input-file",
    "/tmp/selection.json",
    "--output-file",
    "/tmp/out.json",
    "--language",
    "pl-PL",
    "--confirm-live-read",
    SHIPMENT_STATUS_LIVE_READ_CONFIRMATION,
  ]), {
    liveRead: true,
    liveReadInputFile: "/tmp/selection.json",
    outputFile: "/tmp/out.json",
    language: "pl-PL",
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

async function testLoadsReadBundleAndLiveSelection() {
  const arrayFile = writeJson([shipmentStatusSnapshotFixtures.trackingNull]);
  const objectFile = writeJson({ orders: [shipmentStatusSnapshotFixtures.orderWithNoShipments] });
  const selectionFile = writeJson({ orders: [{ accountId: "account-1", externalOrderId: "checkout-1", centralOrderId: "central-1" }] });
  assert.equal(loadShipmentStatusReadBundle(arrayFile).orders.length, 1);
  assert.equal(loadShipmentStatusReadBundle(objectFile).orders.length, 1);
  assert.equal(loadLiveShipmentReadSelection(selectionFile).orders[0].externalOrderId, "checkout-1");
}

async function testLiveReadBuildsSanitizedBundleFromShipmentAndTrackingEndpoints() {
  const endpoints: string[] = [];
  const selection = {
    orders: [{ accountId: "account-1", externalOrderId: "checkout-1", localOrderId: "local-1", centralOrderId: "central-1" }],
  };
  const bundle = await buildReadBundleFromLiveShipmentReads(selection, {
    token: "synthetic-token",
    language: "cs-CZ",
    readAt: "2026-07-03T12:32:00.000Z",
    read: async (endpoint) => {
      endpoints.push(endpoint);
      if (endpoint.includes("/shipments")) {
        return { shipments: [{ id: "shipment-raw-1", carrierId: "DPD", waybill: "waybill-raw-1", packageCount: 1 }] };
      }
      return { updatedAt: "2026-07-03T12:00:00Z", statuses: [{ status: "DELIVERED", occurredAt: "2026-07-03T11:55:00Z" }] };
    },
  });
  assert.deepEqual(endpoints, [
    "/order/checkout-forms/checkout-1/shipments",
    "/order/carriers/DPD/tracking?waybill=waybill-raw-1",
  ]);
  const snapshotFile = buildShipmentStatusSnapshotFile(bundle, "2026-07-03T12:33:00.000Z");
  assert.equal(snapshotFile.snapshotCount, 1);
  assert.equal(snapshotFile.snapshots[0].shipment.latestStatus, "DELIVERED");
  assert.ok(!JSON.stringify(snapshotFile).includes("waybill-raw-1"));
  assert.ok(!JSON.stringify(snapshotFile).includes("shipment-raw-1"));
}

async function testLiveReadTrackingFailureProducesPartialBundle() {
  const bundle = await buildReadBundleFromLiveShipmentReads({
    orders: [{ accountId: "account-1", externalOrderId: "checkout-2" }],
  }, {
    token: "synthetic-token",
    readAt: "2026-07-03T12:34:00.000Z",
    read: async (endpoint) => {
      if (endpoint.includes("/shipments")) {
        return { shipments: [{ id: "shipment-raw-2", carrierId: "DPD", waybill: "waybill-raw-2", packageCount: 1 }] };
      }
      throw new Error("tracking unavailable");
    },
  });
  assert.equal(bundle.orders[0].sourceReadStatus, "PARTIAL");
  assert.equal(bundle.orders[0].sourceReadReason, "[UNKNOWN: carrier tracking read failed for one or more shipments]");
}

export async function runExportShipmentStatusSnapshotsSpec(): Promise<void> {
  await testParsesBundleOutputAndLiveReadArgs();
  await testBuildsReplayCompatibleSnapshotFileWithoutRawIdentifiers();
  await testWritesFileConsumableByReplayCaller();
  await testLoadsReadBundleAndLiveSelection();
  await testLiveReadBuildsSanitizedBundleFromShipmentAndTrackingEndpoints();
  await testLiveReadTrackingFailureProducesPartialBundle();
}

if (require.main === module) {
  runExportShipmentStatusSnapshotsSpec()
    .then(() => process.stdout.write("export-shipment-status-snapshots.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`export-shipment-status-snapshots.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
