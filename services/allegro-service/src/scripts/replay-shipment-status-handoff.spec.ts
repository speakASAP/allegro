import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
  buildShipmentStatusDeadLetterReport,
  loadReplaySnapshots,
  parseReplayArgs,
  runShipmentStatusReplay,
  writeShipmentStatusDeadLetterReport,
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

async function testParsesDeadLetterFileArg() {
  assert.deepEqual(parseReplayArgs([
    "--snapshot-file",
    "/tmp/snapshots.json",
    "--apply",
    "--confirm-warehouse-handoff",
    SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
    "--dead-letter-file",
    "/tmp/dead-letter.json",
  ]), {
    snapshotFile: "/tmp/snapshots.json",
    apply: true,
    confirmWarehouseHandoff: SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
    deadLetterFile: "/tmp/dead-letter.json",
    help: false,
  });
}

async function testDryRunDoesNotInvokeWarehouseHandoff() {
  const built = buildShipmentStatusSnapshots(shipmentStatusSnapshotFixtures.singleWaybillDelivered);
  const summary = await runShipmentStatusReplay(built, "dry-run");
  assert.equal(summary.contract, "allegro.shipment_status_replay.v1");
  assert.equal(summary.snapshotCount, 1);
  assert.equal(summary.handoff, null);
  assert.equal(summary.safety.mutatesWarehouse, false);
  assert.deepEqual(summary.safety.writesAllowed, []);
  assert.equal(summary.deadLetterReport, null);
}


async function testBuildsBoundedDeadLetterReport() {
  const report = buildShipmentStatusDeadLetterReport({
    contract: "allegro.shipment_status_handoff.v1",
    source: "allegro-service",
    channel: "allegro",
    total: 4,
    posted: 1,
    disabled: 0,
    skipped: 1,
    blocked: 1,
    failed: 1,
    items: [
      { idempotencyKey: "posted-key", status: "posted", orderId: "central-1", sourceReferenceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { idempotencyKey: "blocked-key", status: "blocked", reason: "MISSING_WAREHOUSE_CONFIG" },
      { idempotencyKey: "failed-key", status: "failed", reason: "Warehouse shipment correlation failed with HTTP 503" },
      { idempotencyKey: "skipped-key", status: "skipped", reason: "MISSING_CENTRAL_ORDER_ID" },
    ],
  }, "2026-07-03T13:00:00.000Z");

  assert.equal(report.contract, "allegro.shipment_status_dead_letter.v1");
  assert.equal(report.retryableCount, 2);
  assert.equal(report.terminalCount, 1);
  assert.deepEqual(report.items.map((item) => item.idempotencyKey), ["blocked-key", "failed-key", "skipped-key"]);
  assert.equal(report.items[2].retryClass, "terminal");
  const json = JSON.stringify(report);
  for (const marker of ["trackingNumber", "trackingUrl", "buyerEmail", "rawData", "synthetic-waybill"]) {
    assert.ok(!json.includes(marker), `raw marker leaked into dead-letter report: ${marker}`);
  }
}

async function testWritesDeadLetterReportFile() {
  const filePath = path.join(os.tmpdir(), `shipment-status-dead-letter-${Date.now()}-${Math.random()}.json`);
  const report = buildShipmentStatusDeadLetterReport({
    contract: "allegro.shipment_status_handoff.v1",
    source: "allegro-service",
    channel: "allegro",
    total: 1,
    posted: 0,
    disabled: 0,
    skipped: 0,
    blocked: 1,
    failed: 0,
    items: [{ idempotencyKey: "blocked-key", status: "blocked", reason: "MISSING_WAREHOUSE_CONFIG" }],
  }, "2026-07-03T13:01:00.000Z");
  writeShipmentStatusDeadLetterReport(report, filePath);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(parsed.items[0].idempotencyKey, "blocked-key");
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
  await testParsesDeadLetterFileArg();
  await testDryRunDoesNotInvokeWarehouseHandoff();
  await testBuildsBoundedDeadLetterReport();
  await testWritesDeadLetterReportFile();
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
