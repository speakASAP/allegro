import * as fs from "fs";
import * as path from "path";
import { buildScriptSafety, redactedError, requireExactConfirmation } from "./lib/script-safety";
import {
  AllegroShipmentStatusOrderInput,
  AllegroShipmentStatusSnapshot,
  assertShipmentSnapshotIsRedacted,
  buildShipmentStatusSnapshots,
} from "../allegro/shipments/shipment-status-snapshot.mapper";
import { ShipmentStatusHandoffService } from "../allegro/shipments/shipment-status-handoff.service";
import {
  WarehouseShipmentCorrelationClient,
  WarehouseShipmentCorrelationPayload,
} from "../allegro/shipments/warehouse-shipment-correlation.client";

export const SHIPMENT_STATUS_HANDOFF_CONFIRMATION = "ALLEGRO_SHIPMENT_STATUS_WAREHOUSE_CORRELATION";

type Args = {
  snapshotFile?: string;
  apply: boolean;
  confirmWarehouseHandoff?: string;
  help: boolean;
};

export type ShipmentStatusReplayMode = "dry-run" | "apply";

export interface ShipmentStatusReplaySummary {
  contract: "allegro.shipment_status_replay.v1";
  source: "allegro-service";
  mode: ShipmentStatusReplayMode;
  snapshotCount: number;
  handoff: Awaited<ReturnType<ShipmentStatusHandoffService["publishWarehouseCorrelations"]>> | null;
  safety: Record<string, unknown>;
}

function printHelp(): void {
  console.log(`Replay sanitized Allegro shipment status snapshots into the Warehouse correlation handoff.

Usage:
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --dry-run
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --apply --confirm-warehouse-handoff ${SHIPMENT_STATUS_HANDOFF_CONFIRMATION}

Input may be:
  - an array of allegro.shipment_status_snapshot.v1 snapshots, or
  - an array of AllegroShipmentStatusOrderInput objects that will be mapped to sanitized snapshots.

Dry-run is the default and does not call Warehouse, Allegro, Orders, or the database.
Apply mode posts only through ShipmentStatusHandoffService and still requires ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true plus Warehouse token config.
`);
}

export function parseReplayArgs(argv: string[]): Args {
  const args: Args = { apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--snapshot-file") args.snapshotFile = next();
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--confirm-warehouse-handoff") args.confirmWarehouseHandoff = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function loadReplaySnapshots(filePath: string): AllegroShipmentStatusSnapshot[] {
  const absolutePath = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed?.snapshots || parsed?.orders;
  if (!Array.isArray(records)) {
    throw new Error("Snapshot file must contain an array, { snapshots: [] }, or { orders: [] }");
  }

  const snapshots = records.flatMap((record) => {
    if (record?.contract === "allegro.shipment_status_snapshot.v1") {
      return [record as AllegroShipmentStatusSnapshot];
    }
    return buildShipmentStatusSnapshots(record as AllegroShipmentStatusOrderInput);
  });

  for (const snapshot of snapshots) {
    assertShipmentSnapshotIsRedacted(snapshot);
  }
  return snapshots;
}

export async function runShipmentStatusReplay(
  snapshots: AllegroShipmentStatusSnapshot[],
  mode: ShipmentStatusReplayMode,
): Promise<ShipmentStatusReplaySummary> {
  const safety = buildScriptSafety({
    taskId: "ORDERS-SHIPMENT-CORRELATION",
    mode,
    mutates: mode === "apply",
    mutatesLocalAllegroProjection: false,
    mutatesLocalSyncEvidence: false,
    mutatesCatalog: false,
    mutatesWarehouse: mode === "apply",
    mutatesOrders: false,
    mutatesAllegro: false,
    mutatesBizBox: false,
    writesAllowed: mode === "apply" ? ["warehouse-microservice:provider-shipment-correlations"] : [],
    writesForbidden: ["orders-microservice", "catalog-microservice", "allegro-write-api", "local-allegro-db"],
    confirmation: mode === "apply"
      ? {
        flag: "--confirm-warehouse-handoff",
        expected: SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
        satisfied: true,
      }
      : null,
  });

  if (mode === "dry-run") {
    return {
      contract: "allegro.shipment_status_replay.v1",
      source: "allegro-service",
      mode,
      snapshotCount: snapshots.length,
      handoff: null,
      safety,
    };
  }

  const handoffService = new ShipmentStatusHandoffService(new WarehouseShipmentCorrelationClient({} as any));
  const handoff = await handoffService.publishWarehouseCorrelations(snapshots, postWarehouseJson);
  return {
    contract: "allegro.shipment_status_replay.v1",
    source: "allegro-service",
    mode,
    snapshotCount: snapshots.length,
    handoff,
    safety,
  };
}

async function postWarehouseJson(
  url: string,
  payload: WarehouseShipmentCorrelationPayload,
  options: { headers: Record<string, string>; timeout: number },
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text.slice(0, 500) };
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Warehouse shipment correlation failed with HTTP ${response.status}`), {
        status: response.status,
        data,
      });
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const args = parseReplayArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.snapshotFile) {
    throw new Error("Provide --snapshot-file");
  }
  if (args.apply) {
    requireExactConfirmation(
      args.confirmWarehouseHandoff,
      SHIPMENT_STATUS_HANDOFF_CONFIRMATION,
      "--confirm-warehouse-handoff",
    );
  }

  const snapshots = loadReplaySnapshots(args.snapshotFile);
  const summary = await runShipmentStatusReplay(snapshots, args.apply ? "apply" : "dry-run");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`replay-shipment-status-handoff: FAIL\n${JSON.stringify(redactedError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
