import * as fs from "fs";
import * as path from "path";
import { buildScriptSafety, redactedError, requireExactConfirmation } from "./lib/script-safety";
import {
  AllegroShipmentInput,
  AllegroShipmentStatusOrderInput,
  AllegroShipmentStatusSnapshot,
  AllegroTrackingDetailsInput,
  SHIPMENT_MISSING_SCOPE_REASON,
  assertShipmentSnapshotIsRedacted,
  buildShipmentStatusSnapshots,
} from "../allegro/shipments/shipment-status-snapshot.mapper";

export const SHIPMENT_STATUS_LIVE_READ_CONFIRMATION = "ALLEGRO_SHIPMENT_STATUS_LIVE_READ";

type Args = {
  readBundleFile?: string;
  liveReadInputFile?: string;
  outputFile?: string;
  liveRead: boolean;
  confirmLiveRead?: string;
  language: string;
  help: boolean;
};

export interface ShipmentStatusReadBundle {
  contract?: "allegro.shipment_status_read_bundle.v1";
  source?: string;
  generatedAt?: string;
  orders: AllegroShipmentStatusOrderInput[];
}

export interface LiveShipmentReadOrderSelection {
  accountId: string;
  externalOrderId: string;
  localOrderId?: string | null;
  centralOrderId?: string | null;
}

export interface LiveShipmentReadSelection {
  contract?: "allegro.shipment_status_live_read_selection.v1";
  orders: LiveShipmentReadOrderSelection[];
}

export interface ShipmentStatusSnapshotFile {
  contract: "allegro.shipment_status_snapshot_file.v1";
  source: "allegro-service";
  generatedAt: string;
  snapshotCount: number;
  snapshots: AllegroShipmentStatusSnapshot[];
  safety: Record<string, unknown>;
}

export type ShipmentStatusReadRequest = (
  endpoint: string,
  options: { token: string; language: string },
) => Promise<unknown>;

function printHelp(): void {
  console.log(`Export sanitized Allegro shipment status snapshots for Warehouse replay.

Usage:
  npm run export:shipment-status-snapshots -- --read-bundle-file /path/to/read-bundle.json --output-file /path/to/snapshots.json
  npm run export:shipment-status-snapshots -- --live-read --live-read-input-file /path/to/selection.json --output-file /path/to/snapshots.json --confirm-live-read ${SHIPMENT_STATUS_LIVE_READ_CONFIRMATION}

Read-bundle mode consumes already-approved shipment facts shaped as AllegroShipmentStatusOrderInput[].
Live-read mode reads only explicitly selected checkout-form shipment endpoints plus carrier tracking endpoints, keeps raw provider identifiers in memory only, then writes sanitized replay snapshots.
`);
}

export function parseExportArgs(argv: string[]): Args {
  const args: Args = { liveRead: false, language: "cs-CZ", help: false };
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
    else if (arg === "--live-read-input-file") args.liveReadInputFile = next();
    else if (arg === "--output-file") args.outputFile = next();
    else if (arg === "--live-read") args.liveRead = true;
    else if (arg === "--confirm-live-read") args.confirmLiveRead = next();
    else if (arg === "--language") args.language = next();
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

export function loadLiveShipmentReadSelection(filePath: string): LiveShipmentReadSelection {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const orders = Array.isArray(parsed) ? parsed : parsed?.orders;
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error("Live read selection must contain a non-empty array or { orders: [] }");
  }
  return {
    contract: parsed?.contract || "allegro.shipment_status_live_read_selection.v1",
    orders: orders.map((order: any) => ({
      accountId: requireNonEmpty(order.accountId, "accountId"),
      externalOrderId: requireNonEmpty(order.externalOrderId, "externalOrderId"),
      localOrderId: normalizeOptionalString(order.localOrderId),
      centralOrderId: normalizeOptionalString(order.centralOrderId),
    })),
  };
}

export async function buildReadBundleFromLiveShipmentReads(
  selection: LiveShipmentReadSelection,
  options: {
    token: string;
    language?: string;
    read?: ShipmentStatusReadRequest;
    readAt?: string;
  },
): Promise<ShipmentStatusReadBundle> {
  const token = requireNonEmpty(options.token, "token");
  const language = options.language || "cs-CZ";
  const read = options.read || readAllegroJson;
  const readAt = options.readAt || new Date().toISOString();
  const orders: AllegroShipmentStatusOrderInput[] = [];

  for (const order of selection.orders) {
    const shipmentsResponse = await read(`/order/checkout-forms/${encodeURIComponent(order.externalOrderId)}/shipments`, {
      token,
      language,
    });
    const shipments = extractShipments(shipmentsResponse);
    const enrichedShipments: AllegroShipmentInput[] = [];
    let sourceReadStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" = shipments.length > 0 ? "AVAILABLE" : "PARTIAL";
    let sourceReadReason: string | null = shipments.length > 0 ? null : "[UNKNOWN: no shipments returned by checkout-form shipments endpoint]";

    for (const shipment of shipments) {
      const carrierId = normalizeOptionalString(shipment.carrierId || shipment.carrier?.id || shipment.delivery?.carrierId);
      const waybill = normalizeOptionalString(shipment.waybill || shipment.waybillNumber || shipment.trackingNumber);
      let trackingDetails: AllegroTrackingDetailsInput | null = null;
      if (carrierId && waybill) {
        try {
          trackingDetails = normalizeTrackingDetails(await read(
            `/order/carriers/${encodeURIComponent(carrierId)}/tracking?waybill=${encodeURIComponent(waybill)}`,
            { token, language },
          ));
        } catch {
          sourceReadStatus = "PARTIAL";
          sourceReadReason = "[UNKNOWN: carrier tracking read failed for one or more shipments]";
        }
      }
      enrichedShipments.push({
        shipmentId: normalizeOptionalString(shipment.id || shipment.shipmentId),
        carrierId,
        waybill,
        packageCount: normalizePackageCount(shipment.packageCount || shipment.packages?.length || 1),
        trackingDetails,
      });
    }

    orders.push({
      channel: "allegro",
      accountId: order.accountId,
      externalOrderId: order.externalOrderId,
      localOrderId: order.localOrderId || null,
      centralOrderId: order.centralOrderId || null,
      shipments: enrichedShipments,
      readAt,
      sourceReadStatus,
      sourceReadReason,
      shipmentManagementEndpoint: "not_used",
    });
  }

  return {
    contract: "allegro.shipment_status_read_bundle.v1",
    source: "allegro-live-read",
    generatedAt: readAt,
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

async function readAllegroJson(endpoint: string, options: { token: string; language: string }): Promise<unknown> {
  const baseUrl = (process.env.ALLEGRO_API_URL || "https://api.allegro.pl").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: "application/vnd.allegro.public.v1+json",
      "Accept-Language": options.language,
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 500) };
  }
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403
      ? SHIPMENT_MISSING_SCOPE_REASON
      : `Allegro shipment read failed with HTTP ${response.status}`;
    throw Object.assign(new Error(reason), { status: response.status, data });
  }
  return data;
}

function extractShipments(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.shipments)) return value.shipments;
  if (Array.isArray(value?.data?.shipments)) return value.data.shipments;
  return [];
}

function normalizeTrackingDetails(value: any): AllegroTrackingDetailsInput {
  const histories = Array.isArray(value?.trackingDetails) ? value.trackingDetails
    : Array.isArray(value?.histories) ? value.histories
      : Array.isArray(value?.statuses) ? value.statuses
        : [];
  const statuses = histories.flatMap((entry: any) => {
    if (Array.isArray(entry?.statuses)) return entry.statuses;
    return [entry];
  }).map((entry: any) => ({
    status: normalizeOptionalString(entry?.status || entry?.code || entry?.event),
    occurredAt: normalizeOptionalString(entry?.occurredAt || entry?.date || entry?.createdAt),
  })).filter((entry: any) => entry.status || entry.occurredAt);

  return {
    updatedAt: normalizeOptionalString(value?.updatedAt || value?.lastUpdatedAt),
    statuses,
  };
}

function normalizePackageCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function requireNonEmpty(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(`${fieldName} is required`);
  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function main(): Promise<void> {
  const args = parseExportArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.outputFile) {
    throw new Error("Provide --output-file");
  }

  let bundle: ShipmentStatusReadBundle;
  if (args.liveRead) {
    requireExactConfirmation(args.confirmLiveRead, SHIPMENT_STATUS_LIVE_READ_CONFIRMATION, "--confirm-live-read");
    if (!args.liveReadInputFile) throw new Error("Provide --live-read-input-file");
    const token = requireNonEmpty(process.env.ALLEGRO_SHIPMENT_STATUS_ACCESS_TOKEN || process.env.ALLEGRO_ACCESS_TOKEN, "ALLEGRO_SHIPMENT_STATUS_ACCESS_TOKEN");
    bundle = await buildReadBundleFromLiveShipmentReads(loadLiveShipmentReadSelection(args.liveReadInputFile), {
      token,
      language: args.language,
    });
  } else {
    if (!args.readBundleFile) {
      throw new Error("Provide --read-bundle-file");
    }
    bundle = loadShipmentStatusReadBundle(args.readBundleFile);
  }

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
