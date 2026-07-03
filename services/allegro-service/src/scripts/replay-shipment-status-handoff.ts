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
export const DEFAULT_SHIPMENT_STATUS_DEAD_LETTER_DIR = "/var/lib/allegro-service/shipment-correlation-dead-letter";

type Args = {
  snapshotFile?: string;
  deadLetterFile?: string;
  deadLetterDir?: string;
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
  deadLetterReport?: ShipmentStatusDeadLetterReport | null;
}

export interface ShipmentStatusDeadLetterReport {
  contract: "allegro.shipment_status_dead_letter.v1";
  source: "allegro-service";
  generatedAt: string;
  retryableCount: number;
  terminalCount: number;
  items: ShipmentStatusDeadLetterItem[];
}

export interface ShipmentStatusDeadLetterItem {
  idempotencyKey: string;
  status: "blocked" | "failed" | "skipped";
  retryClass: "retryable" | "terminal";
  reason: string;
  orderId?: string;
  sourceReferenceHash?: string;
}

function printHelp(): void {
  console.log(`Replay sanitized Allegro shipment status snapshots into the Warehouse correlation handoff.

Usage:
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --dry-run
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --apply --confirm-warehouse-handoff ${SHIPMENT_STATUS_HANDOFF_CONFIRMATION}
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --apply --confirm-warehouse-handoff ${SHIPMENT_STATUS_HANDOFF_CONFIRMATION} --dead-letter-dir /var/lib/allegro-service/shipment-correlation-dead-letter
  npm run replay:shipment-status-handoff -- --snapshot-file /path/to/sanitized-snapshots.json --apply --confirm-warehouse-handoff ${SHIPMENT_STATUS_HANDOFF_CONFIRMATION} --dead-letter-file /path/to/dead-letter.json

Input may be:
  - an array of allegro.shipment_status_snapshot.v1 snapshots, or
  - an array of AllegroShipmentStatusOrderInput objects that will be mapped to sanitized snapshots.

Dry-run is the default and does not call Warehouse, Allegro, Orders, or the database.
Apply mode posts only through ShipmentStatusHandoffService and still requires ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true plus Warehouse token config.
Dead-letter reports for blocked, skipped, or failed correlation posts are written to --dead-letter-file, --dead-letter-dir, ALLEGRO_SHIPMENT_DEAD_LETTER_DIR, or the default /var/lib/allegro-service/shipment-correlation-dead-letter directory.
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
    else if (arg === "--dead-letter-file") args.deadLetterFile = next();
    else if (arg === "--dead-letter-dir") args.deadLetterDir = next();
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
      deadLetterReport: null,
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
    deadLetterReport: buildShipmentStatusDeadLetterReport(handoff),
  };
}

export function buildShipmentStatusDeadLetterReport(
  handoff: Awaited<ReturnType<ShipmentStatusHandoffService["publishWarehouseCorrelations"]>>,
  generatedAt = new Date().toISOString(),
): ShipmentStatusDeadLetterReport {
  const items = handoff.items
    .filter((item) => item.status === "blocked" || item.status === "failed" || item.status === "skipped")
    .map((item) => {
      const retryClass: "retryable" | "terminal" = item.status === "skipped" ? "terminal" : "retryable";
      return {
        idempotencyKey: item.idempotencyKey,
        status: item.status as "blocked" | "failed" | "skipped",
        retryClass,
        reason: String(item.reason || "UNKNOWN_SHIPMENT_CORRELATION_OUTCOME").slice(0, 200),
        orderId: item.orderId,
        sourceReferenceHash: item.sourceReferenceHash,
      };
    });

  return {
    contract: "allegro.shipment_status_dead_letter.v1",
    source: "allegro-service",
    generatedAt,
    retryableCount: items.filter((item) => item.retryClass === "retryable").length,
    terminalCount: items.filter((item) => item.retryClass === "terminal").length,
    items,
  };
}

export function resolveShipmentStatusDeadLetterPath(
  report: ShipmentStatusDeadLetterReport,
  options: { filePath?: string; directory?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  if (options.filePath) {
    return path.resolve(options.filePath);
  }
  const env = options.env || process.env;
  const directory = options.directory || env.ALLEGRO_SHIPMENT_DEAD_LETTER_DIR || DEFAULT_SHIPMENT_STATUS_DEAD_LETTER_DIR;
  const safeTimestamp = report.generatedAt.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
  return path.resolve(directory, `shipment-correlation-dead-letter-${safeTimestamp}.json`);
}

export function writeShipmentStatusDeadLetterReport(report: ShipmentStatusDeadLetterReport, filePath: string): void {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
  let deadLetterFile: string | undefined;
  if (summary.deadLetterReport && summary.deadLetterReport.items.length > 0) {
    deadLetterFile = resolveShipmentStatusDeadLetterPath(summary.deadLetterReport, {
      filePath: args.deadLetterFile,
      directory: args.deadLetterDir,
    });
    writeShipmentStatusDeadLetterReport(summary.deadLetterReport, deadLetterFile);
  }
  process.stdout.write(`${JSON.stringify({
    ...summary,
    deadLetterFile,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`replay-shipment-status-handoff: FAIL\n${JSON.stringify(redactedError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
