import { createHash } from "crypto";

export type ShipmentSnapshotStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "RELEASED_FOR_DELIVERY"
  | "AVAILABLE_FOR_PICKUP"
  | "NOTICE_LEFT"
  | "ISSUE"
  | "DELIVERED"
  | "RETURNED"
  | "UNKNOWN";

export type ShipmentSourceReadStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export interface AllegroTrackingStatusInput {
  status?: string | null;
  occurredAt?: string | null;
}

export interface AllegroTrackingDetailsInput {
  updatedAt?: string | null;
  statuses?: AllegroTrackingStatusInput[] | null;
}

export interface AllegroShipmentInput {
  shipmentId?: string | null;
  carrierId?: string | null;
  waybill?: string | null;
  packageCount?: number | null;
  trackingDetails?: AllegroTrackingDetailsInput | null;
  shipmentManagementDetail?: Record<string, unknown> | null;
}

export interface AllegroShipmentStatusOrderInput {
  channel: string;
  accountId: string;
  externalOrderId: string;
  localOrderId?: string | null;
  centralOrderId?: string | null;
  shipments: AllegroShipmentInput[];
  readAt: string;
  sourceReadStatus?: ShipmentSourceReadStatus;
  sourceReadReason?: string | null;
  shipmentManagementEndpoint?: "/shipment-management/shipments/{shipmentId}" | "not_used";
}

export interface AllegroShipmentStatusSnapshot {
  contract: "allegro.shipment_status_snapshot.v1";
  source: "allegro-service";
  channel: "allegro";
  accountId: string;
  order: {
    localOrderId: string | null;
    externalOrderId: string;
    centralOrderId: string | null;
  };
  shipment: {
    shipmentId: string | null;
    carrierId: string | null;
    waybillHash: string | null;
    packageCount: number;
    latestStatus: ShipmentSnapshotStatus;
    latestStatusAt: string | null;
    trackingUpdatedAt: string | null;
  };
  sourceRead: {
    shipmentsEndpoint: "/order/checkout-forms/{id}/shipments";
    trackingEndpoint: "/order/carriers/{carrierId}/tracking";
    shipmentManagementEndpoint: "/shipment-management/shipments/{shipmentId}" | "not_used";
    readAt: string;
    status: ShipmentSourceReadStatus;
    reason: string | null;
  };
  idempotencyKey: string;
}

export interface AllegroTrackingBatch {
  carrierId: string;
  waybillHashes: string[];
}

const TRACKING_ABSENT_REASON = "[UNKNOWN: carrier tracking details absent or older than provider retention]";
const MISSING_SCOPE_REASON = "[MISSING: OAuth scope or account permission for shipment tracking read]";

const STATUS_MAP: Record<string, ShipmentSnapshotStatus> = {
  READY_FOR_SHIPMENT: "PENDING",
  SENT: "IN_TRANSIT",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "RELEASED_FOR_DELIVERY",
  AVIZO: "NOTICE_LEFT",
  NOTICE_LEFT: "NOTICE_LEFT",
  WAITING_FOR_PICKUP: "AVAILABLE_FOR_PICKUP",
  AVAILABLE_FOR_PICKUP: "AVAILABLE_FOR_PICKUP",
  DELIVERED: "DELIVERED",
  RETURNED: "RETURNED",
  RETURN_TO_SENDER: "RETURNED",
  EXCEPTION: "ISSUE",
  FAILED_DELIVERY_ATTEMPT: "ISSUE",
  CANCELLED: "ISSUE",
};

const FORBIDDEN_KEYS = new Set([
  "address",
  "additionalproperties",
  "authorization",
  "buyeremail",
  "buyername",
  "cod",
  "email",
  "iban",
  "label",
  "labels",
  "payload",
  "phone",
  "pickupaddress",
  "protocol",
  "protocols",
  "rawdata",
  "receiver",
  "sender",
  "street",
  "token",
  "trackingnumber",
  "trackingurl",
]);

export function hashIdentifier(value?: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

export function normalizeShipmentStatus(status?: string | null): ShipmentSnapshotStatus {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) {
    return "UNKNOWN";
  }

  return STATUS_MAP[normalized] || "UNKNOWN";
}

function normalizeDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getLatestTrackingStatus(trackingDetails?: AllegroTrackingDetailsInput | null): {
  status: ShipmentSnapshotStatus;
  occurredAt: string | null;
  updatedAt: string | null;
  reason: string | null;
} {
  const statuses = trackingDetails?.statuses || [];
  const latest = statuses
    .map((status) => ({
      status: normalizeShipmentStatus(status.status),
      occurredAt: normalizeDate(status.occurredAt),
    }))
    .filter((status) => status.occurredAt !== null)
    .sort((left, right) => Date.parse(right.occurredAt || "") - Date.parse(left.occurredAt || ""))[0];

  if (!latest) {
    return {
      status: "UNKNOWN",
      occurredAt: null,
      updatedAt: normalizeDate(trackingDetails?.updatedAt),
      reason: TRACKING_ABSENT_REASON,
    };
  }

  return {
    status: latest.status,
    occurredAt: latest.occurredAt,
    updatedAt: normalizeDate(trackingDetails?.updatedAt),
    reason: null,
  };
}

function coercePackageCount(value?: number | null): number {
  if (!Number.isFinite(value || 0) || (value || 0) < 0) {
    return 0;
  }

  return Math.floor(value || 0);
}

export function buildShipmentStatusSnapshots(input: AllegroShipmentStatusOrderInput): AllegroShipmentStatusSnapshot[] {
  if (input.channel !== "allegro") {
    return [];
  }

  const accountIdHash = hashIdentifier(input.accountId);
  const externalOrderIdHash = hashIdentifier(input.externalOrderId);
  if (!accountIdHash || !externalOrderIdHash) {
    throw new Error("Allegro shipment snapshot requires accountId and externalOrderId");
  }

  const shipments = input.shipments.length > 0 ? input.shipments : [{ packageCount: 0 }];

  return shipments.map((shipment) => {
    const latest = getLatestTrackingStatus(shipment.trackingDetails);
    const shipmentIdHash = hashIdentifier(shipment.shipmentId);
    const waybillHash = hashIdentifier(shipment.waybill);
    const carrierId = shipment.carrierId?.trim() || null;
    const sourceReadStatus = input.sourceReadStatus || (input.shipments.length > 0 ? "AVAILABLE" : "PARTIAL");
    const sourceReadReason = input.sourceReadReason || latest.reason;
    const safeCarrierId = carrierId || "UNKNOWN";
    const safeWaybillHash = waybillHash || "sha256:unknown-waybill";

    const snapshot: AllegroShipmentStatusSnapshot = {
      contract: "allegro.shipment_status_snapshot.v1",
      source: "allegro-service",
      channel: "allegro",
      accountId: accountIdHash,
      order: {
        localOrderId: input.localOrderId || null,
        externalOrderId: externalOrderIdHash,
        centralOrderId: input.centralOrderId || null,
      },
      shipment: {
        shipmentId: shipmentIdHash,
        carrierId,
        waybillHash,
        packageCount: coercePackageCount(shipment.packageCount),
        latestStatus: latest.status,
        latestStatusAt: latest.occurredAt,
        trackingUpdatedAt: latest.updatedAt,
      },
      sourceRead: {
        shipmentsEndpoint: "/order/checkout-forms/{id}/shipments",
        trackingEndpoint: "/order/carriers/{carrierId}/tracking",
        shipmentManagementEndpoint: input.shipmentManagementEndpoint || "not_used",
        readAt: normalizeDate(input.readAt) || new Date(input.readAt).toISOString(),
        status: sourceReadStatus,
        reason: sourceReadReason,
      },
      idempotencyKey: `allegro.shipment-status:v1:${accountIdHash}:${externalOrderIdHash}:${safeCarrierId}:${safeWaybillHash}`,
    };

    assertShipmentSnapshotIsRedacted(snapshot);
    return snapshot;
  });
}

export function buildTrackingBatches(shipments: AllegroShipmentInput[], maxWaybillsPerBatch = 20): AllegroTrackingBatch[] {
  const byCarrier = new Map<string, string[]>();

  for (const shipment of shipments) {
    const carrierId = shipment.carrierId?.trim();
    const waybillHash = hashIdentifier(shipment.waybill);
    if (!carrierId || !waybillHash) {
      continue;
    }

    byCarrier.set(carrierId, [...(byCarrier.get(carrierId) || []), waybillHash]);
  }

  const batches: AllegroTrackingBatch[] = [];
  for (const [carrierId, waybillHashes] of byCarrier.entries()) {
    for (let index = 0; index < waybillHashes.length; index += maxWaybillsPerBatch) {
      batches.push({ carrierId, waybillHashes: waybillHashes.slice(index, index + maxWaybillsPerBatch) });
    }
  }

  return batches;
}

export function assertShipmentSnapshotIsRedacted(snapshot: AllegroShipmentStatusSnapshot): void {
  function visit(value: unknown, path: string[]): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (FORBIDDEN_KEYS.has(normalizedKey)) {
          throw new Error(`Forbidden shipment snapshot key ${[...path, key].join(".")}`);
        }
        visit(nested, [...path, key]);
      }
    }
  }

  visit(snapshot, []);
}

export const SHIPMENT_TRACKING_ABSENT_REASON = TRACKING_ABSENT_REASON;
export const SHIPMENT_MISSING_SCOPE_REASON = MISSING_SCOPE_REASON;
