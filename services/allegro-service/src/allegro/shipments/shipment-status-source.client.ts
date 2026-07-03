import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  AllegroShipmentInput,
  AllegroShipmentStatusOrderInput,
  AllegroTrackingDetailsInput,
  SHIPMENT_MISSING_SCOPE_REASON,
} from "./shipment-status-snapshot.mapper";

export interface ShipmentStatusSourceOrderSelection {
  accountId: string;
  externalOrderId: string;
  localOrderId?: string | null;
  centralOrderId?: string | null;
}

export interface ShipmentStatusSourceSelection {
  contract?: "allegro.shipment_status_live_read_selection.v1";
  orders: ShipmentStatusSourceOrderSelection[];
}

export interface ShipmentStatusReadBundle {
  contract: "allegro.shipment_status_read_bundle.v1";
  source: "allegro-live-read";
  generatedAt: string;
  orders: AllegroShipmentStatusOrderInput[];
}

export interface ShipmentStatusSourceReadOptions {
  token?: string;
  baseUrl?: string;
  language?: string;
  readAt?: string;
}

export type ShipmentStatusReadRequest = (
  endpoint: string,
  options: { token: string; language: string },
) => Promise<unknown>;

export interface BuildLiveShipmentReadBundleOptions extends ShipmentStatusSourceReadOptions {
  token: string;
  read?: ShipmentStatusReadRequest;
}

@Injectable()
export class ShipmentStatusSourceClient {
  constructor(private readonly httpService: HttpService) {}

  async readShipmentStatusBundle(
    selection: ShipmentStatusSourceSelection,
    options: ShipmentStatusSourceReadOptions = {},
  ): Promise<ShipmentStatusReadBundle> {
    const token = requireNonEmpty(
      options.token || process.env.ALLEGRO_SHIPMENT_STATUS_ACCESS_TOKEN || process.env.ALLEGRO_ACCESS_TOKEN,
      "ALLEGRO_SHIPMENT_STATUS_ACCESS_TOKEN",
    );
    const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.ALLEGRO_API_URL || "https://api.allegro.pl");

    return buildReadBundleFromLiveShipmentReads(selection, {
      token,
      language: options.language,
      readAt: options.readAt,
      read: (endpoint, readOptions) => this.readAllegroJson(endpoint, { ...readOptions, baseUrl }),
    });
  }

  private async readAllegroJson(
    endpoint: string,
    options: { token: string; language: string; baseUrl: string },
  ): Promise<unknown> {
    const response = await firstValueFrom(this.httpService.get(`${options.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: "application/vnd.allegro.public.v1+json",
        "Accept-Language": options.language,
      },
      timeout: 5000,
      validateStatus: () => true,
    }));

    if (response.status < 200 || response.status >= 300) {
      const reason = response.status === 401 || response.status === 403
        ? SHIPMENT_MISSING_SCOPE_REASON
        : `Allegro shipment read failed with HTTP ${response.status}`;
      throw Object.assign(new Error(reason), { status: response.status });
    }

    return response.data;
  }
}

export async function buildReadBundleFromLiveShipmentReads(
  selection: ShipmentStatusSourceSelection,
  options: BuildLiveShipmentReadBundleOptions,
): Promise<ShipmentStatusReadBundle> {
  const token = requireNonEmpty(options.token, "token");
  const language = options.language || "cs-CZ";
  const read = options.read || (() => {
    throw new Error("Shipment status source read function is required outside ShipmentStatusSourceClient");
  });
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
      accountId: requireNonEmpty(order.accountId, "accountId"),
      externalOrderId: requireNonEmpty(order.externalOrderId, "externalOrderId"),
      localOrderId: normalizeOptionalString(order.localOrderId),
      centralOrderId: normalizeOptionalString(order.centralOrderId),
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

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Allegro API base URL is required");
  }
  return normalized;
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
