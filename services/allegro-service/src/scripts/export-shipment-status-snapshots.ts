import * as fs from "fs";
import * as path from "path";
import { buildScriptSafety, redactedError, requireExactConfirmation } from "./lib/script-safety";
import {
  AllegroShipmentStatusOrderInput,
  AllegroShipmentStatusSnapshot,
  assertShipmentSnapshotIsRedacted,
  buildShipmentStatusSnapshots,
} from "../allegro/shipments/shipment-status-snapshot.mapper";

export const SHIPMENT_STATUS_LIVE_READ_CONFIRMATION = "ALLEGRO_SHIPMENT_STATUS_LIVE_READ";

type Args = {
  readBundleFile?: string;
  outputFile?: string;
  liveRead: boolean;
  confirmLiveRead?: string;
  help: boolean;
};

export interface ShipmentStatusReadBundle {
  contract?: "allegro.shipment_status_read_bundle.v1";
  source?: string;
  generatedAt?: string;
  orders: AllegroShipmentStatusOrderInput[];
}

export interface ShipmentStatusSnapshotFile {
  contract: "allegro.shipment_status_snapshot_file.v1";
  source: "allegro-service";
  generatedAt: string;
  snapshotCount: number;
  snapshots: AllegroShipmentStatusSnapshot[];
  safety: Record<string, unknown>;
}

function printHelp(): void {
  console.log(`Export sanitized Allegro shipment status snapshots for Warehouse replay.

Usage:
  npm run export:shipment-status-snapshots -- --read-bundle-file /path/to/read-bundle.json --output-file /path/to/snapshots.json

The read bundle must contain already-approved shipment read facts shaped as AllegroShipmentStatusOrderInput[].
This script hashes external order/shipment/waybill identifiers, rejects raw provider/customer/tracking marker keys in the final snapshots, and writes a replay-compatible snapshot file.

Live provider reads are fail-closed in this source slice. Future use must add owner-approved account/order selection, token handling, rate limits, and sanitized runtime smoke before enabling:
  --live-read --confirm-live-read ${SHIPMENT_STATUS_LIVE_READ_CONFIRMATION}
`);
}

export function parseExportArgs(argv: string[]): Args {
  const args: Args = { liveRead: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--read-bundle-file") args.readBundleFile = next();
    else if (arg === "--output-file") args.outputFile = next();
    else if (arg === "--live-read") args.liveRead = true;
    else if (arg === "--confirm-live-read") args.confirmLiveRead = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function loadShipmentStatusReadBundle(filePath: string): ShipmentStatusReadBundle {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const orders = Array.isArray(parsed) ? parsed : parsed?.orders;
  if (!Array.isArray(orders)) {
    throw new Error("Read bundle must contain an array or { orders: [] }");
  }
  return {
    contract: parsed?.contract || "allegro.shipment_status_read_bundle.v1",
    source: parsed?.source || "approved-read-bundle",
    generatedAt: parsed?.generatedAt || new Date().toISOString(),
    orders,
  };
}

export function buildShipmentStatusSnapshotFile(
  bundle: ShipmentStatusReadBundle,
  generatedAt = new Date().toISOString(),
): ShipmentStatusSnapshotFile {
  const snapshots = bundle.orders.flatMap((order) => buildShipmentStatusSnapshots(order));
  for (const snapshot of snapshots) {
    assertShipmentSnapshotIsRedacted(snapshot);
  }

  return {
    contract: "allegro.shipment_status_snapshot_file.v1",
    source: "allegro-service",
    generatedAt,
    snapshotCount: snapshots.length,
    snapshots,
    safety: buildScriptSafety({
      taskId: "ORDERS-SHIPMENT-SNAPSHOT-FILE",
      mode: "dry-run",
      mutates: false,
      mutatesLocalAllegroProjection: false,
      mutatesLocalSyncEvidence: false,
      mutatesCatalog: false,
      mutatesWarehouse: false,
      mutatesOrders: false,
      mutatesAllegro: false,
      mutatesBizBox: false,
      writesAllowed: [],
      writesForbidden: ["orders-microservice", "warehouse-microservice", "catalog-microservice", "allegro-write-api", "local-allegro-db"],
    }),
  };
}

export function writeShipmentStatusSnapshotFile(snapshotFile: ShipmentStatusSnapshotFile, outputFile: string): void {
  const absoluteOutput = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(snapshotFile, null, 2)}\n`, "utf8");
}

function assertLiveReadStillBlocked(args: Args): void {
  if (!args.liveRead) return;
  requireExactConfirmation(args.confirmLiveRead, SHIPMENT_STATUS_LIVE_READ_CONFIRMATION, "--confirm-live-read");
  throw new Error("[MISSING: approved live shipment read implementation with account/order selection, token handling, rate limits, and sanitized smoke]");
}

async function main(): Promise<void> {
  const args = parseExportArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  assertLiveReadStillBlocked(args);
  if (!args.readBundleFile) {
    throw new Error("Provide --read-bundle-file");
  }
  if (!args.outputFile) {
    throw new Error("Provide --output-file");
  }

  const bundle = loadShipmentStatusReadBundle(args.readBundleFile);
  const snapshotFile = buildShipmentStatusSnapshotFile(bundle);
  writeShipmentStatusSnapshotFile(snapshotFile, args.outputFile);
  process.stdout.write(`${JSON.stringify({
    contract: snapshotFile.contract,
    source: snapshotFile.source,
    generatedAt: snapshotFile.generatedAt,
    snapshotCount: snapshotFile.snapshotCount,
    outputFile: path.resolve(args.outputFile),
    safety: snapshotFile.safety,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`export-shipment-status-snapshots: FAIL\n${JSON.stringify(redactedError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
