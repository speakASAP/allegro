import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { createHash } from "crypto";
import { AllegroShipmentStatusSnapshot } from "./shipment-status-snapshot.mapper";

export interface WarehouseShipmentCorrelationPayload {
  provider: "allegro";
  sourceChannel: "shipment-status-snapshot";
  accountIdHash?: string;
  externalOrderIdHash: string;
  shipmentIdHash?: string;
  waybillIdHash?: string;
  sourceReferenceHash: string;
  reasonCode: "ALLEGRO_SHIPMENT_CORRELATION_APPROVED";
  reference?: string;
}

export interface WarehouseShipmentCorrelationRequest {
  orderId: string;
  url: string;
  payload: WarehouseShipmentCorrelationPayload;
}

export type WarehouseShipmentCorrelationPost = (
  url: string,
  payload: WarehouseShipmentCorrelationPayload,
  options: { headers: Record<string, string>; timeout: number },
) => Promise<unknown>;

export type WarehouseShipmentCorrelationPublishResult =
  | { status: "posted"; orderId: string; sourceReferenceHash: string; response: unknown }
  | { status: "disabled"; reason: "ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED_NOT_TRUE" }
  | { status: "skipped"; reason: "MISSING_CENTRAL_ORDER_ID" }
  | { status: "blocked"; reason: "MISSING_WAREHOUSE_CONFIG" };

const DEFAULT_WAREHOUSE_SERVICE_URL = "http://warehouse-microservice:3201";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildWarehouseShipmentCorrelationRequest(
  snapshot: AllegroShipmentStatusSnapshot,
  baseUrl: string = DEFAULT_WAREHOUSE_SERVICE_URL,
): WarehouseShipmentCorrelationRequest | null {
  assertSupportedSnapshot(snapshot);
  const centralOrderId = snapshot.order.centralOrderId?.trim();
  if (!centralOrderId) {
    return null;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    orderId: centralOrderId,
    url: `${normalizedBaseUrl}/api/fulfillment-orders/order/${encodeURIComponent(centralOrderId)}/provider-shipment-correlations`,
    payload: {
      provider: "allegro",
      sourceChannel: "shipment-status-snapshot",
      accountIdHash: normalizeOptionalHash(snapshot.accountId, "snapshot.accountId"),
      externalOrderIdHash: normalizeRequiredHash(snapshot.order.externalOrderId, "snapshot.order.externalOrderId"),
      shipmentIdHash: normalizeOptionalHash(snapshot.shipment.shipmentId, "snapshot.shipment.shipmentId"),
      waybillIdHash: normalizeOptionalHash(snapshot.shipment.waybillHash, "snapshot.shipment.waybillHash"),
      sourceReferenceHash: buildAllegroShipmentSourceReferenceHash(snapshot),
      reasonCode: "ALLEGRO_SHIPMENT_CORRELATION_APPROVED",
      reference: snapshot.idempotencyKey.slice(0, 200),
    },
  };
}

export function buildAllegroShipmentSourceReferenceHash(snapshot: AllegroShipmentStatusSnapshot): string {
  assertSupportedSnapshot(snapshot);
  const accountIdHash = normalizeOptionalHash(snapshot.accountId, "snapshot.accountId") || "sha256:unknown-account";
  const externalOrderIdHash = normalizeRequiredHash(snapshot.order.externalOrderId, "snapshot.order.externalOrderId");
  const shipmentIdHash = normalizeOptionalHash(snapshot.shipment.shipmentId, "snapshot.shipment.shipmentId") || "sha256:unknown-shipment";
  const waybillIdHash = normalizeOptionalHash(snapshot.shipment.waybillHash, "snapshot.shipment.waybillHash") || "sha256:unknown-waybill";
  return `sha256:${createHash("sha256")
    .update([accountIdHash, externalOrderIdHash, shipmentIdHash, waybillIdHash].join("|"))
    .digest("hex")}`;
}

@Injectable()
export class WarehouseShipmentCorrelationClient {
  constructor(private readonly httpService: HttpService) {}

  async publishSnapshotCorrelation(
    snapshot: AllegroShipmentStatusSnapshot,
    post: WarehouseShipmentCorrelationPost = this.postJson.bind(this),
  ): Promise<WarehouseShipmentCorrelationPublishResult> {
    if (process.env.ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED !== "true") {
      return { status: "disabled", reason: "ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED_NOT_TRUE" };
    }

    const token = resolveWarehouseToken();
    const baseUrl = process.env.WAREHOUSE_SERVICE_URL || DEFAULT_WAREHOUSE_SERVICE_URL;
    if (!token || !baseUrl.trim()) {
      return { status: "blocked", reason: "MISSING_WAREHOUSE_CONFIG" };
    }

    const request = buildWarehouseShipmentCorrelationRequest(snapshot, baseUrl);
    if (!request) {
      return { status: "skipped", reason: "MISSING_CENTRAL_ORDER_ID" };
    }

    const response = await post(request.url, request.payload, {
      timeout: 5000,
      headers: {
        "content-type": "application/json",
        "x-service-name": "allegro-service",
        "x-internal-service-token": token,
      },
    });

    return {
      status: "posted",
      orderId: request.orderId,
      sourceReferenceHash: request.payload.sourceReferenceHash,
      response,
    };
  }

  private async postJson(
    url: string,
    payload: WarehouseShipmentCorrelationPayload,
    options: { headers: Record<string, string>; timeout: number },
  ): Promise<unknown> {
    const response = await firstValueFrom(this.httpService.post(url, payload, options));
    return response.data;
  }
}

function assertSupportedSnapshot(snapshot: AllegroShipmentStatusSnapshot): void {
  if (!snapshot || snapshot.contract !== "allegro.shipment_status_snapshot.v1" || snapshot.channel !== "allegro") {
    throw new Error("Unsupported Allegro shipment snapshot correlation contract");
  }
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Warehouse service URL is required");
  }
  return normalized;
}

function normalizeRequiredHash(value: string | null | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized || !HASH_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a sha256 hash`);
  }
  return normalized;
}

function normalizeOptionalHash(value: string | null | undefined, fieldName: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalizeRequiredHash(normalized, fieldName);
}

function resolveWarehouseToken(): string | null {
  return (
    process.env.WAREHOUSE_SERVICE_TOKEN ||
    process.env.WAREHOUSE_INTERNAL_SERVICE_TOKEN ||
    process.env.ALLEGRO_INTERNAL_SERVICE_TOKEN ||
    process.env.INTERNAL_SERVICE_TOKEN ||
    null
  );
}
