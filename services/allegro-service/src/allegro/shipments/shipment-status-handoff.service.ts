import { Injectable } from "@nestjs/common";
import { AllegroShipmentStatusSnapshot } from "./shipment-status-snapshot.mapper";
import {
  WarehouseShipmentCorrelationClient,
  WarehouseShipmentCorrelationPublishResult,
} from "./warehouse-shipment-correlation.client";

export interface ShipmentStatusHandoffItem {
  idempotencyKey: string;
  status: WarehouseShipmentCorrelationPublishResult["status"] | "failed";
  reason?: string;
  orderId?: string;
  sourceReferenceHash?: string;
}

export interface ShipmentStatusHandoffSummary {
  contract: "allegro.shipment_status_handoff.v1";
  source: "allegro-service";
  channel: "allegro";
  total: number;
  posted: number;
  disabled: number;
  skipped: number;
  blocked: number;
  failed: number;
  items: ShipmentStatusHandoffItem[];
}

@Injectable()
export class ShipmentStatusHandoffService {
  constructor(private readonly warehouseCorrelationClient: WarehouseShipmentCorrelationClient) {}

  async publishWarehouseCorrelations(
    snapshots: AllegroShipmentStatusSnapshot[],
  ): Promise<ShipmentStatusHandoffSummary> {
    const summary: ShipmentStatusHandoffSummary = {
      contract: "allegro.shipment_status_handoff.v1",
      source: "allegro-service",
      channel: "allegro",
      total: snapshots.length,
      posted: 0,
      disabled: 0,
      skipped: 0,
      blocked: 0,
      failed: 0,
      items: [],
    };

    for (const snapshot of snapshots) {
      const item = await this.publishOne(snapshot);
      summary.items.push(item);
      summary[item.status] += 1;
    }

    return summary;
  }

  private async publishOne(snapshot: AllegroShipmentStatusSnapshot): Promise<ShipmentStatusHandoffItem> {
    try {
      const result = await this.warehouseCorrelationClient.publishSnapshotCorrelation(snapshot);
      return this.toItem(snapshot, result);
    } catch (error) {
      return {
        idempotencyKey: snapshot.idempotencyKey,
        status: "failed",
        reason: this.normalizeError(error),
      };
    }
  }

  private toItem(
    snapshot: AllegroShipmentStatusSnapshot,
    result: WarehouseShipmentCorrelationPublishResult,
  ): ShipmentStatusHandoffItem {
    if (result.status === "posted") {
      return {
        idempotencyKey: snapshot.idempotencyKey,
        status: "posted",
        orderId: result.orderId,
        sourceReferenceHash: result.sourceReferenceHash,
      };
    }

    return {
      idempotencyKey: snapshot.idempotencyKey,
      status: result.status,
      reason: result.reason,
    };
  }

  private normalizeError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim().slice(0, 200);
    }
    return "UNKNOWN_WAREHOUSE_CORRELATION_ERROR";
  }
}
