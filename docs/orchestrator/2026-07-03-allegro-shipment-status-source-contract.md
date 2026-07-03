# Allegro Shipment Status Source Contract

Status: draft, documentation-only Worker E output
Date: 2026-07-03
Scope: Allegro-owned read-only shipment status source for Allegro-origin orders only
Repository: `/home/ssf/Documents/Github/allegro`

## Intent Preservation Chain

- Vision: Allegro-origin orders expose shipment progress without making Warehouse or Orders depend on raw Allegro provider payloads.
- Goal Impact: Warehouse and order lifecycle consumers can read a sanitized, replay-safe shipment status signal for Allegro-origin orders while shipment labels, documents, carrier pickups, and fulfillment writes remain blocked.
- System: `allegro-service` owns the Allegro API/OAuth boundary and the local Allegro order projection; `orders-microservice` remains canonical order owner; Warehouse remains fulfillment/stock owner.
- Feature: read-only Allegro shipment status source contract.
- Task: document the source endpoint choice, OAuth and credential blockers, sanitized payload, idempotency/timestamp/retry policy, sensitive-field policy, validation fixtures, and Warehouse handoff notes.
- Execution Plan: inspect current Allegro repo state, current order/shipment source docs and code, sanitized k8s/env hints, official Ship with Allegro references, then publish a docs-only contract because source code is not yet sufficient for a narrow read-only implementation.
- Coding Prompt: do not edit Orders, Warehouse, deployment, secrets, DB, or shipment write paths; do not create fake simulators; mark unknowns as `[MISSING: ...]` or `[UNKNOWN: ...]`.
- Code: documentation-only, no runtime code change.
- Validation: `git diff --check` plus read-only inspection evidence below.

## Evidence Inspected

Remote repo state:

- `git status --short --branch` on `/home/ssf/Documents/Github/allegro` showed `main...origin/main` with pre-existing dirty docs in `docs/orchestrator/2026-07-03-allegro-buyer-auth-contract-proposal.md` and `docs/orchestrator/STATUS.md`.
- Latest remote commit before this worker edit: `ee7b2ad docs: record allegro affinity replay runtime validation`.

Current Allegro local projection/source:

- `prisma/schema.prisma` has `AllegroOrder` with `allegroOrderId`, buyer fields, `fulfillmentStatus`, `deliveryMethod`, `deliveryAddress`, nullable `trackingNumber`, `rawData`, and line items; no durable shipment/package/status-history tables were found.
- `services/allegro-service/src/allegro/allegro-api.service.ts` implements `GET /order/checkout-forms` and `GET /order/checkout-forms/{id}` reads.
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts` reads checkout forms, stores delivery/fulfillment summary fields, and currently writes `trackingNumber: null`.
- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md` already records shipment domains as read-only gaps: `/order/checkout-forms/{id}/shipments`, `/order/carriers`, `/shipment-management/*`, missing shipment client/schema, and unknown production OAuth scopes.
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md` maps shipments to the fulfillment/shipping owner and keeps label/document creation blocked.

Sanitized runtime/env hints:

- `k8s/configmap.yaml` exposes Allegro API/auth base URLs, OAuth redirect URL, sandbox flag, service URLs, and sync intervals but no explicit `ALLEGRO_OAUTH_SCOPES` value.
- `k8s/deployment.yaml` and related service deployments reference Kubernetes secret keys for DB/JWT/internal tokens and Allegro credentials; secret values were not printed.
- `AllegroOAuthService.generateAuthorizationUrl()` can pass scopes from `ALLEGRO_OAUTH_SCOPES` when configured, otherwise the scope parameter is omitted.
- `AllegroAccount.tokenScopes` exists in Prisma, but this inspection did not prove the active production token includes shipment/fulfillment read scopes.

Official Allegro API references checked:

- Allegro method list includes order-level shipment reads: `GET /order/checkout-forms/{id}/shipments`, carrier tracking history through `GET /order/carriers/{carrierId}/tracking`, and fulfillment status write through `PUT /order/checkout-forms/{id}/fulfillment`.
- The Ship with Allegro guide documents `/shipment-management/*` resources for managing shipments, labels, protocols, pickups, create/cancel commands, and shipment detail reads.
- The Ship with Allegro guide says `GET /shipment-management/shipments/create-commands/{commandId}` returns command status and `Retry-After` while a create command is still in progress.
- The Ship with Allegro guide says `GET /shipment-management/shipments/{shipmentId}` returns shipment detail, including package waybills and carrier information.
- The Ship with Allegro guide says `GET /order/carriers/{carrierId}/tracking?waybill={waybill}` returns shipment tracking histories, with up to 20 waybills per request.
- `GET /shipment-management/delivery-services` is marked deprecated and planned for removal in Q1 2027; `GET /shipment-management/delivery-proposals/{orderId}` is the preferred source for proposed shipping settings when creating shipments, but creation is out of scope here.

## Decision

For Allegro-origin orders, the read-only shipment status source must be:

1. Primary discovery: `GET /order/checkout-forms/{allegroOrderId}/shipments`.
2. Primary tracking enrichment: `GET /order/carriers/{carrierId}/tracking?waybill={waybill}` batched by carrier with at most 20 waybills per request.
3. Optional shipment-management detail read: `GET /shipment-management/shipments/{shipmentId}` only when a durable `shipmentId` already exists from an approved prior Ship with Allegro create-command path. Do not create shipments to obtain this id.
4. Explicitly out of scope: `POST /shipment-management/shipments/create-commands`, label/protocol endpoints, pickup endpoints, cancel commands, `POST /order/checkout-forms/{id}/shipments`, and `PUT /order/checkout-forms/{id}/fulfillment`.

Reasoning:

- Order-level shipment reads are tied directly to the checkout form id already owned by the local `AllegroOrder.allegroOrderId` projection.
- Carrier tracking is the least invasive source for status history once a waybill and carrier id are known.
- Shipment-management detail can add package/source detail but must not become a hidden write path or a reason to generate labels.
- Warehouse should not depend on Ship with Allegro label/protocol documents or raw provider structures.

## Scope Rules

Allowed records:

- Local rows where `AllegroOrder.allegroOrderId` is present and source channel is Allegro.
- Orders imported from Allegro checkout forms or forwarded to central Orders as `channel=allegro`.
- Read-only status snapshots for existing shipments, waybills, and carrier tracking events.

Forbidden records/actions:

- Orders owned by Warehouse, Orders, Bazos, Aukro, FlipFlop, manual admin orders, or any non-Allegro channel.
- Fake shipment simulators or synthetic provider payloads presented as live evidence.
- Any shipment label/document/protocol/pickup/cancel/write-back operation.
- Raw provider payload persistence until a durable projection schema and redaction policy are approved.

## Sanitized Payload Contract

Contract name: `allegro.shipment_status_snapshot.v1`

Producer owner: `allegro-service`

Consumer owner: Warehouse or Orders lifecycle reader, depending on the integration lane.

Stable envelope:

```json
{
  "contract": "allegro.shipment_status_snapshot.v1",
  "source": "allegro-service",
  "channel": "allegro",
  "accountId": "sha256:<account-id-hash>",
  "order": {
    "localOrderId": "uuid-or-null",
    "externalOrderId": "sha256:<allegro-checkout-form-id-hash>",
    "centralOrderId": "uuid-or-null"
  },
  "shipment": {
    "shipmentId": "sha256:<shipment-id-hash-or-null>",
    "carrierId": "ALLEGRO|DPD|INPOST|...",
    "waybillHash": "sha256:<waybill>",
    "packageCount": 1,
    "latestStatus": "PENDING|IN_TRANSIT|RELEASED_FOR_DELIVERY|AVAILABLE_FOR_PICKUP|NOTICE_LEFT|ISSUE|DELIVERED|RETURNED|UNKNOWN",
    "latestStatusAt": "2026-07-03T00:00:00.000Z",
    "trackingUpdatedAt": "2026-07-03T00:00:00.000Z"
  },
  "sourceRead": {
    "shipmentsEndpoint": "/order/checkout-forms/{id}/shipments",
    "trackingEndpoint": "/order/carriers/{carrierId}/tracking",
    "shipmentManagementEndpoint": "/shipment-management/shipments/{shipmentId}|not_used",
    "readAt": "2026-07-03T00:00:00.000Z",
    "status": "AVAILABLE|PARTIAL|UNAVAILABLE",
    "reason": null
  }
}
```

DTO rules:

- Hash external Allegro order ids, shipment ids, and waybills before handing data to Warehouse unless an owner explicitly approves reversible identifiers.
- Do not include buyer name, email, phone, street, pickup point address, sender address, receiver address, COD owner name, IBAN, raw `additionalProperties`, labels, protocols, Authorization headers, OAuth material, or raw endpoint responses.
- `latestStatus` must be derived from the newest `trackingDetails.statuses[].occurredAt`; if tracking details are null, emit `UNKNOWN` with reason `[UNKNOWN: carrier tracking details absent or older than provider retention]`.
- `packageCount` is allowed as a count only; package dimensions and weights are not part of the Warehouse handoff contract until a fulfillment owner requests them.

## Idempotency, Timestamp, And Retry Policy

Idempotency key:

```text
allegro.shipment-status:v1:{accountIdHash}:{externalOrderIdHash}:{carrierId}:{waybillHash}
```

Timestamp policy:

- `readAt`: time Allegro service completed the read.
- `trackingUpdatedAt`: provider tracking `updatedAt`, when supplied.
- `latestStatusAt`: newest provider status occurrence time, when supplied.
- `firstSeenAt` and `lastSeenAt` belong to a future durable local projection; this docs-only contract does not add those fields.

Retry policy:

- Reads are safe to retry with the same idempotency key.
- Respect Allegro account rate limits already captured by project invariant `ALG-INV-002`; default to one request per second per account until a stricter runtime policy exists.
- Batch tracking by `carrierId` and up to 20 waybills.
- If a Ship with Allegro command-status read is added later, honor `Retry-After`; do not poll faster than the provider header.
- Treat 401/403 as `UNAVAILABLE` with `[MISSING: OAuth scope or account permission for shipment tracking read]`.
- Treat 404 for a shipment/waybill as `PARTIAL` or `UNKNOWN`, not as permission to create a shipment.
- Do not retry by switching to write endpoints.

## OAuth And Credential Blockers

- `[UNKNOWN: current production OAuth scopes/accounts for order shipment reads and carrier tracking endpoints]`
- `[MISSING: explicit ALLEGRO_OAUTH_SCOPES setting or documented decision to omit scope for shipment reads]`
- `[UNKNOWN: whether active seller account has Wysylam z Allegro activated and visible through API settings]`
- `[UNKNOWN: whether carrier tracking endpoint returns all statuses for shipments not created through Ship with Allegro]`
- `[MISSING: durable proof that current token grants `/order/checkout-forms/{id}/shipments`, `/order/carriers/{carrierId}/tracking`, and optional `/shipment-management/shipments/{shipmentId}` reads]`

## Sensitive-Field Policy

Use `23_documentation_contracts/SENSITIVE_DATA_POLICY.md` and `ALG-INV-004`.

Never persist or expose to Warehouse:

- raw Allegro provider payloads;
- buyer, sender, receiver, address, phone, email, pickup point address, or payment/COD fields;
- OAuth access/refresh tokens, client secrets, Authorization headers, Kubernetes secret values, session cookies;
- label/protocol binary files or document URLs;
- carrier-specific hidden IDs unless approved by fulfillment/security owner.

Allowed in docs/tests:

- synthetic UUIDs;
- hashed external ids;
- aggregate counts;
- status enums;
- endpoint names with placeholders.

## Validation Fixtures Needed

Create fixtures only after approval for source implementation:

1. `order-with-no-shipments`: checkout form has zero shipment records; emits `UNKNOWN` without write fallback.
2. `single-waybill-delivered`: one carrier, one waybill, tracking status history ending in `DELIVERED`.
3. `multi-package-single-carrier`: one order, multiple waybills, batched tracking request, latest status derived per waybill.
4. `mixed-carrier`: group by `carrierId` and do not exceed 20 waybills per request.
5. `tracking-null`: waybill recognized without tracking details; emits `UNKNOWN` with reason.
6. `oauth-403`: emits `UNAVAILABLE` with missing-scope blocker and no secret output.
7. `shipment-management-detail-redaction`: when `shipmentId` exists, redact sender/receiver/COD/additionalProperties and keep only status/package count/hashed waybill.
8. `allegro-origin-filter`: non-Allegro order rows are ignored.

Fixtures must be synthetic or masked and must not contain raw production order ids, waybills, buyer contact data, addresses, tokens, labels, or raw provider responses.

## Warehouse Handoff Notes

Warehouse should consume only `allegro.shipment_status_snapshot.v1` or a later owner-approved version.

Warehouse may use:

- `channel=allegro`;
- hashed order/shipment/waybill identity for correlation;
- `latestStatus`, `latestStatusAt`, `trackingUpdatedAt`;
- `packageCount`;
- `sourceRead.status` and `sourceRead.reason`.

Warehouse must not use:

- raw Allegro checkout form payloads;
- raw shipment-management payloads;
- shipment labels, protocols, pickup documents, or binary files;
- buyer/sender/receiver identity or address fields;
- Allegro shipment status as proof of physical stock or reservation state.

Integration blockers for Warehouse:

- `[MISSING: Warehouse consumer contract for read-only shipment status snapshots]`
- `[MISSING: central Orders id mapping for every Allegro-origin order that Warehouse wants to correlate]`
- `[MISSING: durable Allegro shipment projection schema/client before runtime handoff]`
- `[UNKNOWN: whether Warehouse wants per-waybill status, per-order rolled-up status, or both]`

## Parallel Execution

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 contract docs | complete | Define read-only Allegro-owned shipment status source | orchestrator docs | `docs/orchestrator/*` | Orders/Warehouse/runtime/secrets/deploy | this contract | none |
| E2 OAuth proof | dependency-gated | Prove token/account read permissions without printing secrets | read-only token capability probe and sanitized result doc | validation docs only, if approved | Vault mutation, token output | scope evidence or blocker | active token and approval for live read probe |
| E3 projection design | ready_parallel after E1 | Design durable shipment/package/status projection | schema/docs planning | schema proposal docs | migrations until owner approval | schema handoff | integration owner to avoid schema races |
| E4 Warehouse consumer | blocked | Define Warehouse read consumer contract | Warehouse docs/source in separate owner lane | Warehouse-owned files only | Allegro source edits in same lane | consumer contract | Warehouse owner approval |
| E5 runtime implementation | blocked | Implement read-only client and DTO | Allegro shipment client/service/tests | write endpoints, labels, documents, deploy | tested source change | E2 and E3 |

Integration owner: Allegro orchestration thread.
Validation owner: integration owner until E2/E5 are dispatched.
Merge order: E1 docs, E2 capability proof, E3 schema design, E5 Allegro read implementation, E4 Warehouse consumer integration.

## Handoff Summary

This worker does not prove runtime OAuth capability and does not implement source code. The current repo already documents shipment-management as a gap, and the source has no durable shipment projection. The next safe step is a read-only capability proof that checks only status codes/headers and sanitized counters for the three read surfaces, then a schema/client design before Warehouse consumes anything.

Next step: run a sanitized read-only OAuth capability probe for shipment read endpoints, then dispatch projection schema design only if scopes are sufficient.
