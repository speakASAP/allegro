import { Injectable } from "@nestjs/common";
import {
  AllegroShipmentStatusSnapshot,
  assertShipmentSnapshotIsRedacted,
  buildShipmentStatusSnapshots,
} from "./shipment-status-snapshot.mapper";
import {
  ShipmentStatusReadBundle,
  ShipmentStatusSourceClient,
  ShipmentStatusSourceReadOptions,
  ShipmentStatusSourceSelection,
} from "./shipment-status-source.client";

export interface ShipmentStatusProjection {
  contract: "allegro.shipment_status_projection.v1";
  source: "allegro-service";
  channel: "allegro";
  generatedAt: string;
  snapshotCount: number;
  snapshots: AllegroShipmentStatusSnapshot[];
  idempotencyKeys: string[];
  safety: {
    mutates: false;
    mutatesAllegro: false;
    mutatesWarehouse: false;
    mutatesOrders: false;
    persistsRawProviderPayload: false;
    writesAllowed: [];
    writesForbidden: string[];
  };
}

export interface ShipmentStatusProjectionOptions extends ShipmentStatusSourceReadOptions {
  generatedAt?: string;
}

@Injectable()
export class ShipmentStatusProjectionService {
  constructor(private readonly sourceClient: ShipmentStatusSourceClient) {}

  async buildReadOnlyProjection(
    selection: ShipmentStatusSourceSelection,
    options: ShipmentStatusProjectionOptions = {},
  ): Promise<ShipmentStatusProjection> {
    const readBundle = await this.sourceClient.readShipmentStatusBundle(selection, options);
    return buildShipmentStatusProjection(readBundle, options.generatedAt);
  }
}

export function buildShipmentStatusProjection(
  bundle: ShipmentStatusReadBundle,
  generatedAt = new Date().toISOString(),
): ShipmentStatusProjection {
  const snapshots = bundle.orders.flatMap((order) => buildShipmentStatusSnapshots(order));
  for (const snapshot of snapshots) {
    assertShipmentSnapshotIsRedacted(snapshot);
  }

  return {
    contract: "allegro.shipment_status_projection.v1",
    source: "allegro-service",
    channel: "allegro",
    generatedAt,
    snapshotCount: snapshots.length,
    snapshots,
    idempotencyKeys: snapshots.map((snapshot) => snapshot.idempotencyKey),
    safety: {
      mutates: false,
      mutatesAllegro: false,
      mutatesWarehouse: false,
      mutatesOrders: false,
      persistsRawProviderPayload: false,
      writesAllowed: [],
      writesForbidden: [
        "allegro-write-api",
        "shipment-label-api",
        "shipment-document-api",
        "warehouse-microservice",
        "orders-microservice",
        "local-allegro-db-raw-provider-payload",
      ],
    },
  };
}
