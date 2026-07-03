# Allegro Shipment Projection Design

Status: source design, no migration or runtime code applied
Date: 2026-07-03
Scope: durable local projection for read-only Allegro shipment status snapshots
Repository: `/home/ssf/Documents/Github/allegro`

## Intent Preservation Chain

- Vision: Allegro-origin shipment progress can be replayed and handed off to Warehouse/Orders without exposing raw Allegro provider payloads or courier identifiers.
- Goal Impact: the runtime implementation gate moves from `[MISSING: durable projection schema/client]` to an owner-reviewable schema/client plan that can be implemented after OAuth capability proof.
- System: `allegro-service` owns Ship with Allegro/OAuth reads and local channel projection; Warehouse owns fulfillment/delivery state intake after handoff; Orders owns canonical order lifecycle and events.
- Feature: durable Allegro shipment projection design for `allegro.shipment_status_snapshot.v1`.
- Task: design the minimum local schema, idempotency, cursor, redaction, and client/service boundaries needed before a runtime shipment reader exists.
- Execution Plan: inspect current Prisma models and shipment snapshot mapper, reuse the existing sync/projection foundation, document model fields and implementation order, and keep this docs-only until OAuth scope and migration approvals exist.
- Coding Prompt: no live Allegro reads, no DB migration, no provider simulator, no label/protocol/pickup/write endpoints, no tracking number/URL exposure, and mark unknowns explicitly.
- Code: this design doc only.
- Validation: `git diff --check` and remote source inspection of `prisma/schema.prisma`, `orders.service.ts`, existing sync/projection models, and `shipment-status-snapshot.mapper.ts`.

## Current Source Evidence

Current durable state exists for:

- `AllegroOrder` keyed by `allegroOrderId`, with buyer/order/payment/fulfillment/delivery fields and nullable legacy `trackingNumber`.
- `AllegroOrderLineItem` keyed by local order and Allegro line item id.
- `AllegroOrderForwardingAttempt`, which can expose central Orders id from `responseSummary.id` when forwarding succeeded.
- `AllegroSyncRun`, `AllegroSyncCursor`, `AllegroRawPayload`, and `AllegroProjectionAuditLog`, which provide account-aware sync runs, per-endpoint cursors, immutable raw payload evidence, and append-only projection audit.
- `AllegroOfferStockSnapshot`, which demonstrates the project pattern for domain-specific snapshots linked to sync runs, accounts, optional raw payloads, and audit logs.
- `services/allegro-service/src/allegro/shipments/shipment-status-snapshot.mapper.ts`, which already builds sanitized `allegro.shipment_status_snapshot.v1` envelopes and hashed identity/idempotency fields.

Current durable state does not exist for:

- Shipment-level rows.
- Package or waybill rows.
- Per-waybill tracking status history.
- A local outbox/ledger for Warehouse snapshot handoff.
- Sanitized OAuth capability evidence for shipment/tracking endpoints.

## Design Decision

Implement shipment projection as Allegro-owned normalized tables linked to existing `AllegroOrder`, `AllegroAccount`, and sync/audit foundation. Do not overload `AllegroOrder.trackingNumber`; treat it as legacy display data and keep it out of the Warehouse/Orders handoff contract.

The minimum durable projection should include:

1. `AllegroShipmentProjection`: one row per local order plus hashed shipment identity when present.
2. `AllegroShipmentPackageProjection`: one row per carrier/waybill package, storing only waybill hash and package counts/status summary.
3. `AllegroShipmentTrackingEventProjection`: append-only per-waybill tracking status history with provider timestamps.
4. `AllegroShipmentSnapshotLedger`: idempotency and downstream handoff ledger for sanitized `allegro.shipment_status_snapshot.v1` snapshots.

Raw provider payload storage remains blocked until a security owner approves a redaction class for shipment payloads. If raw storage is later approved, use `AllegroRawPayload` with `domain='shipment-status'`, endpoint placeholders, hashes, PII class, and redaction version; never persist labels, protocols, tokens, buyer/sender/receiver/contact/address/COD/IBAN fields.

## Proposed Prisma Models

These are design targets, not an applied migration.

```prisma
model AllegroShipmentProjection {
  id                      String   @id @default(uuid()) @db.Uuid
  accountId               String   @db.Uuid
  localOrderId            String   @db.Uuid
  allegroOrderIdHash      String   @db.VarChar(80)
  allegroShipmentIdHash   String?  @db.VarChar(80)
  sourceEndpoint          String   @db.VarChar(500)
  sourceFetchedAt         DateTime @default(now()) @db.Timestamp(6)
  sourceReadStatus        String   @db.VarChar(30) // AVAILABLE, PARTIAL, UNAVAILABLE
  sourceReadReason        String?  @db.VarChar(500)
  packageCount            Int      @default(0)
  latestStatus            String   @db.VarChar(50)
  latestStatusAt          DateTime? @db.Timestamp(6)
  trackingUpdatedAt       DateTime? @db.Timestamp(6)
  snapshotPayloadHash     String   @db.VarChar(128)
  lastSnapshotIdempotencyKey String @db.VarChar(220)
  firstSeenAt             DateTime @default(now()) @db.Timestamp(6)
  lastSeenAt              DateTime @default(now()) @db.Timestamp(6)
  createdAt               DateTime @default(now()) @db.Timestamp(6)
  updatedAt               DateTime @updatedAt @db.Timestamp(6)

  account AllegroAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)
  order   AllegroOrder   @relation(fields: [localOrderId], references: [id], onDelete: Cascade)

  @@unique([accountId, localOrderId, allegroShipmentIdHash])
  @@index([accountId])
  @@index([localOrderId])
  @@index([latestStatus])
  @@index([sourceFetchedAt])
  @@index([lastSnapshotIdempotencyKey])
  @@map("allegro_shipment_projections")
}

model AllegroShipmentPackageProjection {
  id                    String   @id @default(uuid()) @db.Uuid
  shipmentProjectionId  String   @db.Uuid
  accountId             String   @db.Uuid
  carrierId             String?  @db.VarChar(100)
  waybillHash           String?  @db.VarChar(80)
  latestStatus          String   @db.VarChar(50)
  latestStatusAt        DateTime? @db.Timestamp(6)
  trackingUpdatedAt     DateTime? @db.Timestamp(6)
  sourceFetchedAt       DateTime @default(now()) @db.Timestamp(6)
  firstSeenAt           DateTime @default(now()) @db.Timestamp(6)
  lastSeenAt            DateTime @default(now()) @db.Timestamp(6)
  createdAt             DateTime @default(now()) @db.Timestamp(6)
  updatedAt             DateTime @updatedAt @db.Timestamp(6)

  shipment AllegroShipmentProjection @relation(fields: [shipmentProjectionId], references: [id], onDelete: Cascade)
  account  AllegroAccount            @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@unique([shipmentProjectionId, carrierId, waybillHash])
  @@index([accountId])
  @@index([carrierId])
  @@index([latestStatus])
  @@index([sourceFetchedAt])
  @@map("allegro_shipment_package_projections")
}

model AllegroShipmentTrackingEventProjection {
  id                   String   @id @default(uuid()) @db.Uuid
  packageProjectionId  String   @db.Uuid
  accountId            String   @db.Uuid
  carrierId            String?  @db.VarChar(100)
  waybillHash          String?  @db.VarChar(80)
  status               String   @db.VarChar(50)
  occurredAt           DateTime? @db.Timestamp(6)
  providerEventHash    String   @db.VarChar(128)
  createdAt            DateTime @default(now()) @db.Timestamp(6)

  package AllegroShipmentPackageProjection @relation(fields: [packageProjectionId], references: [id], onDelete: Cascade)
  account AllegroAccount                   @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@unique([packageProjectionId, providerEventHash])
  @@index([accountId])
  @@index([status])
  @@index([occurredAt])
  @@map("allegro_shipment_tracking_event_projections")
}

model AllegroShipmentSnapshotLedger {
  id                    String   @id @default(uuid()) @db.Uuid
  accountId             String   @db.Uuid
  localOrderId          String   @db.Uuid
  shipmentProjectionId  String?  @db.Uuid
  contract              String   @db.VarChar(80)
  idempotencyKey        String   @unique @db.VarChar(220)
  payloadHash           String   @db.VarChar(128)
  downstreamTarget      String   @db.VarChar(80) // warehouse|orders|validation
  downstreamStatus      String   @db.VarChar(50) // PENDING, SENT, ACKED, FAILED, SKIPPED
  lastAttemptAt         DateTime? @db.Timestamp(6)
  acknowledgedAt        DateTime? @db.Timestamp(6)
  failureSummary        Json?
  createdAt             DateTime @default(now()) @db.Timestamp(6)
  updatedAt             DateTime @updatedAt @db.Timestamp(6)

  account AllegroAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)
  order   AllegroOrder   @relation(fields: [localOrderId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@index([localOrderId])
  @@index([shipmentProjectionId])
  @@index([downstreamTarget, downstreamStatus])
  @@index([createdAt])
  @@map("allegro_shipment_snapshot_ledger")
}
```

Open schema questions before migration:

- `[UNKNOWN: whether Prisma relation names are needed to avoid ambiguity after adding multiple AllegroAccount and AllegroOrder relations]`
- `[MISSING: owner decision whether `AllegroRawPayload` may store any shipment endpoint response after redaction, or whether shipment raw payloads remain completely forbidden]`
- `[MISSING: Warehouse decision whether per-waybill snapshots, per-order rollups, or both are consumed]`
- `[UNKNOWN: whether `allegroShipmentIdHash` is always present for checkout-form shipment reads or only for Ship with Allegro-created shipments]`

## Identity And Idempotency

Use the existing source mapper idempotency identity:

```text
allegro.shipment-status:v1:{accountIdHash}:{externalOrderIdHash}:{carrierId}:{waybillHash}
```

Projection identities:

- `accountId`: local UUID FK to `AllegroAccount`; never expose raw seller account secrets downstream.
- `allegroOrderIdHash`: hash of checkout form id. Keep raw `AllegroOrder.allegroOrderId` only in the local Allegro-owned order row.
- `allegroShipmentIdHash`: hash of provider shipment id when present.
- `waybillHash`: hash of waybill/tracking id. Do not store raw waybill in projection or downstream ledger.
- `providerEventHash`: hash of `{carrierId, waybillHash, normalizedStatus, occurredAt}`.
- `snapshotPayloadHash`: hash of stable serialized sanitized snapshot envelope.

Replays:

- Exact replay with same idempotency key and same payload hash must be a no-op except `lastSeenAt`/ledger attempt metadata.
- Same idempotency key with different payload hash must update projection status only when provider timestamps are newer or status precedence allows it; otherwise record an audit `SKIPPED_STALE` entry.
- Same idempotency key with different immutable identity fields is a conflict and must not notify Warehouse.

## Status Mapping Boundary

Projection stores source statuses from `ShipmentSnapshotStatus` only:

- `PENDING`
- `IN_TRANSIT`
- `RELEASED_FOR_DELIVERY`
- `AVAILABLE_FOR_PICKUP`
- `NOTICE_LEFT`
- `ISSUE`
- `DELIVERED`
- `RETURNED`
- `UNKNOWN`

Warehouse/Orders lifecycle mapping is not implemented here. The future handoff adapter should map only after Warehouse confirms its consumer contract. Until then, `AllegroShipmentSnapshotLedger.downstreamStatus` remains `SKIPPED` or `PENDING` with `[MISSING: Warehouse consumer contract/runtime adapter for read-only shipment snapshots]`.

## Client And Service Boundaries

Future source files, after OAuth proof and migration approval:

- `services/allegro-service/src/allegro/shipments/shipment-status-source.client.ts`
  - read-only methods for checkout-form shipments and carrier tracking;
  - no write endpoints, labels, protocols, pickup, cancel, or fulfillment writes;
  - endpoint logs must use placeholders and counts only.
- `services/allegro-service/src/allegro/shipments/shipment-status-projection.service.ts`
  - persists sanitized projection rows, tracking events, and ledger rows;
  - calls current `buildShipmentStatusSnapshots()` mapper;
  - writes `AllegroProjectionAuditLog` with redacted context and idempotency key.
- `services/allegro-service/src/allegro/shipments/shipment-status-handoff.service.ts`
  - disabled by default;
  - sends only approved snapshot contract to Warehouse once Warehouse consumer is landed;
  - does not call Orders directly unless the integration owner changes the routing decision.
- `services/allegro-service/src/allegro/shipments/shipment-status-projection.spec.ts`
  - covers idempotent replay, stale event rejection, redaction, non-Allegro filter, no raw waybill storage, and ledger conflict handling.

## Sync Cursor Design

Use existing `AllegroSyncCursor` rows:

- `domain='shipment-status'`
- `endpoint='/order/checkout-forms/{id}/shipments'`, `cursorType='order-scan-watermark'`
- `endpoint='/order/carriers/{carrierId}/tracking'`, `cursorType='carrier-waybill-batch'`
- Optional `endpoint='/shipment-management/shipments/{shipmentId}'`, `cursorType='shipment-detail'`

Watermark rules:

- Do not move cursor past a failed OAuth/403 batch.
- For provider-retention `UNKNOWN`, advance only after recording sourceRead reason and projection audit.
- Batch tracking per carrier with at most 20 waybill hashes, matching the source contract.

## Sensitive Data Policy

Forbidden in projection, ledger, audit context, and Warehouse handoff:

- raw waybill/tracking number;
- tracking URL;
- buyer/sender/receiver name, email, phone, street, pickup point address;
- COD owner name, IBAN, payment data;
- raw `additionalProperties`;
- label/protocol binary or URLs;
- OAuth access/refresh tokens, Authorization headers, session cookies, Kubernetes secret values;
- raw endpoint response bodies until a separate raw-payload redaction approval exists.

Allowed:

- local UUID FKs;
- hashed external ids;
- carrier id;
- package count;
- bounded status enum;
- timestamps;
- endpoint placeholders;
- aggregate counters;
- `[MISSING: ...]` and `[UNKNOWN: ...]` reasons.

## Implementation Order

1. Run sanitized OAuth capability proof for shipment and carrier-tracking reads without printing tokens, raw ids, waybills, or payloads.
2. Approve or reject raw shipment payload storage; default is no raw shipment payload persistence.
3. Add guarded Prisma migration for projection tables and relation names.
4. Regenerate Prisma clients and add focused projection service tests.
5. Add read-only source client, still disabled by default.
6. Add projection command with exact confirmation, synthetic fixtures, and no Warehouse handoff.
7. Add Warehouse handoff only after Worker H/Warehouse consumer contract is landed.
8. Deploy only after migration/deploy approval and run sanitized runtime smoke.

## Parallel Execution

| Workstream | Status | Owner role | Scope | Allowed files | Forbidden files | Validation | Merge order |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-A OAuth capability proof | dependency-gated | Allegro runtime owner | sanitized live read probe, no payload output | validation docs/scripts if approved | token output, Vault mutation, write endpoints | sanitized status/count evidence | 1 |
| P-B Projection schema | ready after this design | Allegro backend owner | Prisma models/migration and projection service tests | `prisma/**`, `services/allegro-service/src/allegro/shipments/**` | deploy, live reads, Warehouse calls | build, focused specs, diff check | 2 |
| P-C Warehouse consumer | parallel in Warehouse repo | Warehouse owner | consume approved snapshot contract after handoff | Warehouse docs/source only | Allegro/Orders edits | Warehouse tests/build | 3 |
| P-D Runtime handoff | blocked | integration owner | Allegro to Warehouse snapshot send | Allegro/Warehouse adapter files | raw payloads, tracking URLs/numbers | end-to-end smoke | 4 |

## Remaining Gates

- `[MISSING: sanitized live OAuth capability proof for /order/checkout-forms/{id}/shipments and /order/carriers/{carrierId}/tracking]`
- `[MISSING: owner approval for Prisma migration adding shipment projection tables]`
- `[MISSING: raw shipment payload storage decision; default remains no raw provider payload persistence]`
- `[MISSING: Warehouse consumer contract/runtime adapter for read-only shipment snapshots]`
- `[MISSING: deploy approval and sanitized runtime smoke]`

Next step: run the sanitized OAuth capability proof, then implement the projection migration/service behind an explicit disabled-by-default runtime gate.
