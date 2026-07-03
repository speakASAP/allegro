import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
  loadReplaySnapshots,
  parseReplayArgs,
  runShipmentStatusReplay,
} from "./replay-shipment-status-handoff";
import { buildShipmentStatusSnapshots } from "../allegro/shipments/shipment-status-snapshot.mapper";
import { shipmentStatusSnapshotFixtures } from "../allegro/shipments/shipment-status-snapshot.fixtures";

function writeJson(value: unknown): string {
  const filePath = path.join(os.tmpdir(), `shipment-status-replay-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  return filePath;
}

async function testParsesDryRunAndApplyArgs() {
  assert.deepEqual(parseReplayArgs(["--snapshot-file", "/tmp/snapshots.json", "--dry-run"]), {
    snapshotFile: "/tmp/snapshots.json",
    apply: false,
    help: false,
  });
  assert.deepEqual(parseReplayArgs([
    "--snapshot-file",
    "/tmp/snapshots.json",
    "--apply",
    "--confirm-warehouse-handoff",
    SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
  ]), {
    snapshotFile: "/tmp/snapshots.json",
    apply: true,
    confirmWarehouseHandoff: SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
    help: false,
  });
}

async function testLoadsOrderInputsAndBuildsSanitizedSnapshots() {
  const filePath = writeJson({ orders: [shipmentStatusSnapshotFixtures.singleWaybillDelivered] });
  const snapshots = loadReplaySnapshots(filePath);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].contract, "allegro.shipment_status_snapshot.v1");
  assert.ok(!JSON.stringify(snapshots).includes("synthetic-waybill-1"));
}

async function testLoadsAlreadyBuiltSnapshots() {
  const built = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
  const filePath = writeJson({ snapshots: built });
  const snapshots = loadReplaySnapshots(filePath);
  assert.deepEqual(snapshots, built);
}

async function testDryRunDoesNotInvokeWarehouseHandoff() {
  const built = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
  const summary = await runShipmentStatusReplay(built, "dry-run");
  assert.equal(summary.contract, "allegro.shipment_status_replay.v1");
  assert.equal(summary.snapshotCount, 1);
  assert.equal(summary.handoff, null);
  assert.equal(summary.safety.mutatesWarehouse, false);
  assert.deepEqual(summary.safety.writesAllowed, []);
}

async function testRejectsRawSensitiveMarkerInSnapshotFile() {
  const built = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered)[0] as any;
  const filePath = writeJson({ snapshots: [{ ...built, trackingNumber: "raw-tracking-number" }] });
  assert.throws(() => loadReplaySnapshots(filePath), /Forbidden shipment snapshot key trackingNumber/);
}

export async function runShipmentStatusReplaySpec(): Promise<void> {
  await testParsesDryRunAndApplyArgs();
  await testLoadsOrderInputsAndBuildsSanitizedSnapshots();
  await testLoadsAlreadyBuiltSnapshots();
  await testDryRunDoesNotInvokeWarehouseHandoff();
  await testRejectsRawSensitiveMarkerInSnapshotFile();
}

if (require.main === module) {
  runShipmentStatusReplaySpec()
    .then(() => process.stdout.write("replay-shipment-status-handoff.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`replay-shipment-status-handoff.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
