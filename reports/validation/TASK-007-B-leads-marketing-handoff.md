# TASK-007-B Leads And Marketing Schema Handoff

## Scope

TASK-007-B owns a handoff only. It does not approve runtime writes, shared event naming, or integration wording updates.

## Intent Preservation Chain

| Node | Reference |
| --- | --- |
| Vision | `docs/01_vision/VISION.md` |
| Goal Impact | `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md` |
| System | `docs/04_systems/SYS-001-allegro-marketplace-integration.md` |
| Feature | `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md` |
| Task | `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md` |
| Execution Plan | `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md` |
| Coding Prompt | `[MISSING: TASK-007 remains in contract-design stage; no approved coding prompt for leads/marketing writes.]` |
| Code | `[MISSING: TASK-007-B delivers handoff only; no runtime code change is approved in this lane.]` |
| Validation | This handoff plus TASK-007-E integration validation. |

## Contract Posture

- Classification: `synthetic`
- Boundary: outbound candidates for `leads-microservice` and `marketing-microservice`
- Prohibited in this lane: production writes, PII export, raw order/customer payloads, raw logs, secret material
- Shared naming owner: TASK-007-E for final event/version consistency

## Candidate Contract Envelopes

### Leads candidate

Use when a replay-safe demand or missed-sale signal should become a lead record candidate.

```yaml
consumer_contract: leads-demand-signal
contract_version: 0.1.0-draft
source_event_family:
  - allegro.demand.signal
  - allegro.publish.failed
  - allegro.stock.drift
source_service: allegro-service
channel: allegro
required_fields:
  - contractVersion
  - sourceService
  - sourceEvent
  - channel
  - channelAccountId
  - idempotencyKey
  - observedAt
  - signalType
  - productRef
  - offerRef
  - demandStrength
  - demandReason
  - consentStatus
  - redactionLevel
optional_fields:
  - catalogProductRef
  - categoryRef
  - marginBand
  - stockState
  - remediationHint
```

Synthetic example:

```json
{
  "contractVersion": "0.1.0-draft",
  "sourceService": "allegro-service",
  "sourceEvent": "allegro.demand.signal",
  "channel": "allegro",
  "channelAccountId": "ACCOUNT_SYNTHETIC_001",
  "idempotencyKey": "sha256:lead-demand-signal-synthetic-001",
  "observedAt": "2026-06-20T09:00:00Z",
  "signalType": "out_of_stock_interest",
  "productRef": "PRODUCT_SYNTHETIC_001",
  "offerRef": "OFFER_SYNTHETIC_001",
  "demandStrength": "high",
  "demandReason": "repeated_interest_without_available_stock",
  "consentStatus": "not_required_for_internal_lead_triage",
  "redactionLevel": "synthetic",
  "marginBand": "unknown",
  "stockState": "out_of_stock",
  "remediationHint": "replenish_or_relist"
}
```

### Marketing candidate

Use when a redacted product/account segment should become a campaign or remarketing input candidate.

```yaml
consumer_contract: marketing-growth-segment
contract_version: 0.1.0-draft
source_event_family:
  - allegro.catalog.ready
  - allegro.publish.succeeded
  - allegro.margin.warning
  - allegro.demand.signal
required_fields:
  - contractVersion
  - sourceService
  - sourceEvent
  - channel
  - channelAccountId
  - idempotencyKey
  - observedAt
  - segmentType
  - productRef
  - offerRef
  - eligibility
  - consentStatus
  - redactionLevel
optional_fields:
  - catalogProductRef
  - categoryRef
  - performanceBand
  - marginBand
  - inventoryState
  - actionWindow
```

Synthetic example:

```json
{
  "contractVersion": "0.1.0-draft",
  "sourceService": "allegro-service",
  "sourceEvent": "allegro.publish.succeeded",
  "channel": "allegro",
  "channelAccountId": "ACCOUNT_SYNTHETIC_001",
  "idempotencyKey": "sha256:marketing-segment-synthetic-001",
  "observedAt": "2026-06-20T09:05:00Z",
  "segmentType": "high_demand_stock_ready",
  "productRef": "PRODUCT_SYNTHETIC_001",
  "offerRef": "OFFER_SYNTHETIC_001",
  "eligibility": "pending_external_marketing_contract",
  "consentStatus": "unknown_external_system_rule",
  "redactionLevel": "synthetic",
  "performanceBand": "emerging",
  "marginBand": "healthy",
  "inventoryState": "in_stock",
  "actionWindow": "P1D"
}
```

## Ownership And Consent Boundaries

| Topic | Owner or rule | TASK-007-B decision |
| --- | --- | --- |
| Offer and publish lifecycle truth | `allegro-service` | May emit redacted contract candidates only. |
| Product master truth | `catalog-microservice` | Use product references only; do not re-own product data. |
| Order ownership | `orders-microservice` | Use order-forward outcomes as signals only; do not export raw order payloads. |
| Lead record ownership | `[MISSING: leads-microservice contract owner]` | Block production lead writes until owner, endpoint, and consent semantics are approved. |
| Marketing audience ownership | `[MISSING: marketing-microservice contract owner]` | Block production segment writes until consent and activation rules are approved. |
| Customer consent source | `[MISSING: system-of-record for remarketing consent by channel/account]` | Keep `consentStatus` explicit and default unresolved states to blocked/unknown. |
| Sensitive-data policy | `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md` | Use synthetic refs only; never include buyer email, buyer login, addresses, or payment details. |

## Source Mappings

| Candidate signal | Current source artifact | Available fields now | Redaction note | Consumer fit |
| --- | --- | --- | --- | --- |
| Demand or missed-sale signal | `docs/16_operations/INTEGRATIONS.md` revenue taxonomy for `allegro.demand.signal` | event name, consumer intent only | No payload contract checked in | leads, marketing |
| Publish failure follow-up | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` and `prisma/schema.prisma` `AllegroPublishAttempt` | action, status, accountId, catalogProductId, offerId, commandId, failureContext | Do not export raw failure context; map to redacted reason codes only | leads when failure implies blocked demand; marketing only after owner approval |
| Publish success promotion candidate | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` and `docs/16_operations/INTEGRATIONS.md` `allegro.publish.succeeded` | offerId, account context, completion timestamp, commandId | No OAuth, raw command payload, or operator identifiers | marketing |
| Order-forward failure or success demand proxy | `services/allegro-service/src/allegro/orders/orders.service.ts` | externalOrderId, channel, channelAccountId, paymentStatus, orderedAt, local forwarding success/failure | Current code touches buyer email/login; downstream contract must exclude them | leads, marketing after redaction |
| Product readiness or stock opportunity | `docs/08_roadmap/ROADMAP.md` Stage 5 and `docs/16_operations/INTEGRATIONS.md` `allegro.catalog.ready` / `allegro.stock.drift` | conceptual event only | Runtime emitter is `[MISSING]` | marketing |
| Margin-driven remarketing or suppression | `docs/16_operations/INTEGRATIONS.md` `allegro.margin.warning` | conceptual event only | Runtime margin source contract is `[MISSING]` in this repo | marketing |

## Contract-Version Fields

Both candidate envelopes should preserve these fields exactly in downstream drafts:

- `contractVersion`
- `sourceService`
- `sourceEvent`
- `channel`
- `channelAccountId`
- `idempotencyKey`
- `observedAt`
- `redactionLevel`

Recommended generator rules:

- `idempotencyKey` should be deterministic from `sourceEvent + channelAccountId + stable entity ref + observed window`.
- `contractVersion` starts as draft-only `0.1.0-draft` until TASK-007-E resolves shared naming and external owners confirm ingestion rules.
- `sourceEvent` must reuse shared taxonomy names from `docs/16_operations/INTEGRATIONS.md`; TASK-007-B does not rename them.

## Validation Cases For TASK-007-E

1. Redaction case: a leads candidate derived from order forwarding must exclude buyer email, buyer login, delivery address, payment method, and raw order identifiers beyond approved synthetic refs.
2. Replay case: the same publish failure observed twice for the same attempt must produce the same `idempotencyKey` and no duplicate downstream write request.
3. Consent case: a marketing segment candidate with unknown remarketing consent must remain blocked or `eligibility=pending_external_marketing_contract`.
4. Source mapping case: each candidate event must point back to one checked-in source artifact and one allowed event family from `docs/16_operations/INTEGRATIONS.md`.
5. Versioning case: envelopes missing `contractVersion` or `sourceService` fail contract validation.
6. Safety case: reports and fixtures must contain only synthetic identifiers such as `ACCOUNT_SYNTHETIC_001`, `PRODUCT_SYNTHETIC_001`, and `example.invalid` domains.

## Blockers And Missing External Contracts

- `[MISSING: leads-microservice endpoint, schema repository, owner, and retry/idempotency contract.]`
- `[MISSING: marketing-microservice segment ingestion API, owner, and activation/consent policy.]`
- `[MISSING: approved consent system-of-record for remarketing eligibility across Allegro-driven audiences.]`
- `[MISSING: authoritative runtime source for click/repeated-interest telemetry referenced as "if available" in Stage 5.]`
- `[MISSING: margin event producer contract that explains source fields, thresholds, and replay semantics.]`

## Sensitive-Data Safety Check

Manual check target for TASK-007-E:

- Confirm no real emails, phone numbers, OAuth material, tokens, buyer identifiers, or raw production payloads appear in this handoff.
- Confirm all examples stay synthetic and all unresolved external facts stay marked `[MISSING: ...]`.
