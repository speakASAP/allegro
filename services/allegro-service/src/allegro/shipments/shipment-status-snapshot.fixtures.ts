import {
  AllegroShipmentStatusOrderInput,
  SHIPMENT_MISSING_SCOPE_REASON,
} from "./shipment-status-snapshot.mapper";

const readAt = "2026-07-03T12:00:00.000Z";

function baseOrder(overrides: Partial<AllegroShipmentStatusOrderInput> = {}): AllegroShipmentStatusOrderInput {
  return {
    channel: "allegro",
    accountId: "synthetic-account-1",
    externalOrderId: "synthetic-checkout-form-1",
    localOrderId: "11111111-1111-4111-8111-111111111111",
    centralOrderId: "22222222-2222-4222-8222-222222222222",
    shipments: [],
    readAt,
    ...overrides,
  };
}

export const shipmentStatusSnapshotFixtures = {
  orderWithNoShipments: baseOrder({
    externalOrderId: "synthetic-checkout-form-no-shipments",
    shipments: [],
  }),

  singleWaybillDelivered: baseOrder({
    externalOrderId: "synthetic-checkout-form-delivered",
    shipments: [
      {
        shipmentId: "synthetic-shipment-1",
        carrierId: "DPD",
        waybill: "synthetic-waybill-1",
        packageCount: 1,
        trackingDetails: {
          updatedAt: "2026-07-03T11:00:00Z",
          statuses: [
            { status: "SENT", occurredAt: "2026-07-03T08:00:00Z" },
            { status: "DELIVERED", occurredAt: "2026-07-03T10:45:00Z" },
          ],
        },
      },
    ],
  }),

  multiPackageSingleCarrier: baseOrder({
    externalOrderId: "synthetic-checkout-form-multi-package",
    shipments: Array.from({ length: 22 }, (_, index) => ({
      shipmentId: `synthetic-shipment-multi-${index + 1}`,
      carrierId: "INPOST",
      waybill: `synthetic-waybill-multi-${index + 1}`,
      packageCount: 1,
      trackingDetails: {
        updatedAt: "2026-07-03T11:30:00Z",
        statuses: [
          { status: index % 2 === 0 ? "WAITING_FOR_PICKUP" : "SENT", occurredAt: "2026-07-03T11:15:00Z" },
        ],
      },
    })),
  }),

  mixedCarrier: baseOrder({
    externalOrderId: "synthetic-checkout-form-mixed-carrier",
    shipments: [
      {
        shipmentId: "synthetic-shipment-dpd",
        carrierId: "DPD",
        waybill: "synthetic-waybill-dpd",
        packageCount: 1,
        trackingDetails: { statuses: [{ status: "SENT", occurredAt: "2026-07-03T08:00:00Z" }] },
      },
      {
        shipmentId: "synthetic-shipment-inpost",
        carrierId: "INPOST",
        waybill: "synthetic-waybill-inpost",
        packageCount: 1,
        trackingDetails: { statuses: [{ status: "DELIVERED", occurredAt: "2026-07-03T09:00:00Z" }] },
      },
    ],
  }),

  trackingNull: baseOrder({
    externalOrderId: "synthetic-checkout-form-tracking-null",
    shipments: [
      {
        shipmentId: "synthetic-shipment-tracking-null",
        carrierId: "DPD",
        waybill: "synthetic-waybill-tracking-null",
        packageCount: 1,
        trackingDetails: null,
      },
    ],
  }),

  oauth403: baseOrder({
    externalOrderId: "synthetic-checkout-form-oauth-403",
    sourceReadStatus: "UNAVAILABLE",
    sourceReadReason: SHIPMENT_MISSING_SCOPE_REASON,
    shipments: [
      {
        shipmentId: "synthetic-shipment-oauth-403",
        carrierId: "DPD",
        waybill: "synthetic-waybill-oauth-403",
        packageCount: 1,
        trackingDetails: null,
      },
    ],
  }),

  shipmentManagementDetailRedaction: baseOrder({
    externalOrderId: "synthetic-checkout-form-shipment-management-detail",
    shipmentManagementEndpoint: "/shipment-management/shipments/{shipmentId}",
    shipments: [
      {
        shipmentId: "synthetic-shipment-management-detail",
        carrierId: "ALLEGRO",
        waybill: "synthetic-waybill-shipment-management",
        packageCount: 2,
        shipmentManagementDetail: {
          intentionallyIgnored: true,
        },
        trackingDetails: {
          updatedAt: "2026-07-03T10:00:00Z",
          statuses: [{ status: "OUT_FOR_DELIVERY", occurredAt: "2026-07-03T09:30:00Z" }],
        },
      },
    ],
  }),

  allegroOriginFilter: baseOrder({
    channel: "bazos",
    externalOrderId: "synthetic-non-allegro-order",
    shipments: [
      {
        shipmentId: "synthetic-non-allegro-shipment",
        carrierId: "DPD",
        waybill: "synthetic-non-allegro-waybill",
        packageCount: 1,
      },
    ],
  }),
};
