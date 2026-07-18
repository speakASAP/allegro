# TASK-007-A Funnel Taxonomy Handoff

## Scope

TASK-007-A owns a draft funnel taxonomy handoff only. This file does not approve runtime emission, shared integration wording, or final event naming. TASK-007-E owns final integration and conflict resolution.

## Intent Chain

- Vision: `docs/01_vision/VISION.md`
- Goal Impact: `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md`
- System: `[MISSING: explicit system artifact cited by TASK-007 docs for this lane]`
- Feature: `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md`
- Task: `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
- Execution Plan: `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
- Coding Prompt: `[MISSING: TASK-007 is still execution-plan review only; no coding prompt approved]`
- Code: existing source mappings below only
- Validation: synthetic contract examples and review cases below only

## Proposed Contract Version

- `contractVersion`: `2026-06-20.allegro-funnel.v1`
- Status: draft candidate for TASK-007-E review
- Constraint: every event should carry `contractVersion`, `sourceService`, `channel`, `accountId` when relevant, `idempotencyKey`, and redacted error context per `docs/16_operations/INTEGRATIONS.md`
- `[MISSING: approved contract version registry or naming standard beyond task-local draft examples]`

## v1 Funnel Taxonomy

### Canonical envelope

Required for every event:

| Field | Type | Notes |
|---|---|---|
| `eventName` | string | Use existing `allegro.*` names first. |
| `contractVersion` | string | Draft candidate `2026-06-20.allegro-funnel.v1`. |
| `occurredAt` | ISO-8601 string | Synthetic examples only in this handoff. |
| `sourceService` | string | Usually `allegro-service`; upstream owner may differ. |
| `channel` | string | `allegro`. |
| `accountId` | string or null | Required when the source snapshot has account scope. |
| `offerId` | string or null | Local offer id when present. |
| `allegroOfferId` | string or null | Marketplace offer id when present. |
| `catalogProductId` | string or null | Carry when catalog mapping exists. |
| `idempotencyKey` | string | Deterministic per business attempt or state transition. |
| `lifecycleStage` | string | `catalog`, `draft`, `policy`, `publish`, `stock`, `order`, or `margin`. |
| `eventOutcome` | string | `pass`, `warn`, `block`, `queued`, `success`, `failure`, or `signal`. |
| `redaction` | object | At minimum `classification` and omitted-field summary. |
| `errorContext` | object or null | Redacted only; never raw tokens, buyer identity, or raw logs. |

### Approved-name aligned events

| Event | Required event-specific fields | Source mapping | Synthetic example |
|---|---|---|---|
| `allegro.catalog.ready` | `readinessGate`, `categoryId`, `price`, `stockQuantity` | Planned taxonomy in `docs/16_operations/INTEGRATIONS.md`; upstream product readiness likely catalog-owned. | `{"eventName":"allegro.catalog.ready","catalogProductId":"cat-100","readinessGate":"catalog-ready","stockQuantity":12,"eventOutcome":"pass"}` |
| `allegro.draft.created` | `draftOrigin`, `categoryId`, `price`, `stockQuantity`, `hasImages` | Offer draft lifecycle in `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts` and `services/allegro-service/src/allegro/offers/offers.service.ts`. | `{"eventName":"allegro.draft.created","offerId":"offer-100","draftOrigin":"catalog-sell-action","hasImages":true,"eventOutcome":"success"}` |
| `allegro.policy.blocked` | `action`, `blockedGates`, `blockedReasonCount`, `remediationHints` | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` and `services/allegro-service/src/allegro/policy/policy-engine.service.ts`. | `{"eventName":"allegro.policy.blocked","action":"PUBLISH","blockedGates":["category-readiness"],"blockedReasonCount":1,"eventOutcome":"block"}` |
| `allegro.publish.confirmed` | `action`, `attemptId`, `requestedByUserIdHash`, `preparedAt` | Publish lifecycle attempt states in `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts`. | `{"eventName":"allegro.publish.confirmed","attemptId":"attempt-100","action":"PUBLISH","requestedByUserIdHash":"user-hash","eventOutcome":"queued"}` |
| `allegro.publish.succeeded` | `action`, `attemptId`, `commandId`, `completedAt`, `publicationStatus` | Governed publish success in `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts`; publish command path in `services/allegro-service/src/allegro/offers/offers.service.ts`. | `{"eventName":"allegro.publish.succeeded","attemptId":"attempt-100","commandId":"cmd-100","publicationStatus":"ACTIVE","eventOutcome":"success"}` |
| `allegro.publish.failed` | `action`, `attemptId`, `failureCode`, `failureStage`, `retryEligible` | Failure capture and redaction in `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts`. | `{"eventName":"allegro.publish.failed","attemptId":"attempt-101","failureCode":"ALLEGRO_PUBLISH_FAILED","failureStage":"execute","retryEligible":true,"eventOutcome":"failure"}` |
| `allegro.stock.synced` | `stockQuantity`, `stockSource`, `syncStatus`, `publicationStatus` | Stock reflected in offer sync/update paths in `services/allegro-service/src/allegro/offers/offers.service.ts`; warehouse boundary in `shared/clients/warehouse-client.service.ts`. | `{"eventName":"allegro.stock.synced","offerId":"offer-200","stockQuantity":7,"stockSource":"warehouse","syncStatus":"SYNCED","eventOutcome":"success"}` |
| `allegro.stock.drift` | `warehouseStock`, `channelStock`, `driftQuantity`, `threshold` | Planned taxonomy exists in `docs/16_operations/INTEGRATIONS.md`; concrete drift threshold source not found. | `{"eventName":"allegro.stock.drift","offerId":"offer-200","warehouseStock":7,"channelStock":3,"driftQuantity":4,"threshold":"[MISSING: configured drift threshold]","eventOutcome":"warn"}` |
| `allegro.order.received` | `externalOrderId`, `paymentStatus`, `fulfillmentStatus`, `lineItemCount`, `grossTotal` | Order sync/upsert in `services/allegro-service/src/allegro/orders/orders.service.ts`. | `{"eventName":"allegro.order.received","externalOrderId":"ord-100","paymentStatus":"PAID","fulfillmentStatus":"NEW","lineItemCount":1,"grossTotal":149.99,"eventOutcome":"success"}` |
| `allegro.order.forwarded` | `externalOrderId`, `forwardContractVersion`, `channelAccountId`, `forwardedAt` | Forward to `orders-microservice` in `services/allegro-service/src/allegro/orders/orders.service.ts` and `shared/clients/order-client.service.ts`. | `{"eventName":"allegro.order.forwarded","externalOrderId":"ord-100","forwardContractVersion":"orders.create.v1","channelAccountId":"acct-1","eventOutcome":"success"}` |
| `allegro.order.forward_failed` | `externalOrderId`, `failureCode`, `retryAttempt`, `notificationCandidate` | Forwarding failure log path in `services/allegro-service/src/allegro/orders/orders.service.ts`; downstream conflict/idempotency behavior in `shared/clients/order-client.service.ts`. | `{"eventName":"allegro.order.forward_failed","externalOrderId":"ord-101","failureCode":"ORDER_IDEMPOTENCY_CONFLICT","retryAttempt":1,"notificationCandidate":true,"eventOutcome":"failure"}` |
| `allegro.margin.warning` | `marginFloor`, `observedMargin`, `marginSource`, `affectedScope` | Planned taxonomy only; TASK-006 economics contracts still blocked. | `{"eventName":"allegro.margin.warning","marginFloor":"[MISSING: approved floor]","observedMargin":0.08,"marginSource":"[MISSING: approved source]","affectedScope":"offer","eventOutcome":"warn"}` |
| `allegro.demand.signal` | `signalType`, `signalStrength`, `signalWindow`, `inventoryState` | Planned taxonomy only for leads/marketing consumers. | `{"eventName":"allegro.demand.signal","signalType":"out_of_stock_interest","signalStrength":"medium","signalWindow":"P7D","inventoryState":"out_of_stock","eventOutcome":"signal"}` |

## Stage 5 Gaps Against Current Named Taxonomy

The roadmap lists `publish-requested`, `published`, `clicked`, `ordered`, `cancelled`, `stockout`, `order-forwarded`, `payment-settled`, `refund`, and `margin-warning`. Current repo-level named taxonomy already covers most intent with these mappings:

| Roadmap term | Current aligned event | Gap |
|---|---|---|
| `policy-blocked` | `allegro.policy.blocked` | none |
| `published` | `allegro.publish.succeeded` | none |
| `order-forwarded` | `allegro.order.forwarded` | none |
| `margin-warning` | `allegro.margin.warning` | economics source still missing |
| `publish-requested` | `[MISSING: final approved name; likely separate from confirmed]` | current taxonomy starts at `allegro.publish.confirmed` |
| `clicked` | `[MISSING: source service and telemetry path]` | no click-tracking source found in inspected files |
| `ordered` | `allegro.order.received` | naming may need owner decision |
| `cancelled` | `[MISSING: cancellation source path]` | no explicit cancellation event source found |
| `stockout` | candidate via `OUT_OF_STOCK` warning or warehouse events | final event boundary unclear |
| `payment-settled` | `[MISSING: payments contract/source]` | planned payments boundary only |
| `refund` | `[MISSING: payments or orders refund source]` | no inspected source anchor |

## Source Mapping Notes

- Publish policy states already expose stable lifecycle concepts: `PREPARED`, `BLOCKED`, `CONFIRMED`, `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `STALE`.
- Policy gates already provide event-worthy readiness dimensions: category, attributes, media, stock, price/margin placeholder, delivery, payment, GPSR producer.
- Order forwarding already carries `contractVersion`, `channel`, and `channelAccountId`, which matches the integration design rules well.
- Notification interfaces exist, but no Stage 5 digest notification contract exists yet in inspected code.
- Warehouse boundaries define `stock.updated`, `stock.low`, and `stock.out`, but a drift threshold and exact stockout emission rule are still missing.

## Validation Cases

1. Envelope validation rejects events missing `contractVersion`, `eventName`, `occurredAt`, `sourceService`, `channel`, or `idempotencyKey`.
2. Redaction validation fails if serialized examples contain buyer email, buyer login, OAuth tokens, authorization headers, client secrets, payment details, or raw production log text.
3. `allegro.policy.blocked` requires at least one blocked gate and non-empty remediation hints.
4. `allegro.publish.succeeded` requires `attemptId` plus either `commandId` or a documented `[MISSING: command id unavailable reason]`.
5. `allegro.publish.failed` requires redacted `failureCode` and must not embed raw upstream error payloads.
6. `allegro.stock.drift` requires both warehouse and channel quantities plus a threshold marker.
7. `allegro.order.forwarded` and `allegro.order.forward_failed` must use the same business idempotency lineage as the forwarded order request.
8. Unknown roadmap-only events must remain blocked with `[MISSING: ...]` markers until a source service and owner are identified.

## Sensitive-Data Safety Review

- All examples above are synthetic.
- No real customer identifiers, OAuth tokens, secrets, raw order payloads, or production logs are included.
- `requestedByUserIdHash` is intentionally hashed/redacted in the example instead of using a real operator id.

## Blockers

- `[MISSING: approved TASK-007 event contract version registry]`
- `[MISSING: explicit source service for click telemetry]`
- `[MISSING: approved payments contract for payment-settled and refund events]`
- `[MISSING: cancellation source mapping in inspected code]`
- `[MISSING: stock drift threshold and stockout emission rule]`
- `[MISSING: TASK-006-approved economics inputs for margin-warning thresholds]`
- `[MISSING: approved final naming decision for publish-requested vs publish-confirmed]`
