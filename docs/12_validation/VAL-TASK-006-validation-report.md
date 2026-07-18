# VAL-TASK-006: Stock Order Profit Loop Validation Report

```yaml
id: VAL-TASK-006
status: pass
owner: TASK-006-E integration owner
created: 2026-06-13
last_updated: 2026-06-21
source_task: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
execution_plan: ../21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md
classification: synthetic
```

Validation id: VAL-TASK-006  
Target: TASK-006  
Date: 2026-06-21
Validator: AI agent

## Summary

TASK-006 contract-discovery lanes A-D were integrated, owner approval unblocked the missing external contract assumptions on 2026-06-21, and a pure contract-first implementation was validated. No runtime controller, worker, schema migration, production data, deployment, payment write, supplier write, stock mutation, or local order ownership change was introduced.

## Upstream goal

TASK-006 supports FEAT-006 and roadmap Stage 4: close stock, order, payment, supplier, and profit feedback loops so Allegro sales can be fulfilled profitably while preserving warehouse ownership of stock, orders-microservice ownership of orders, read-only-first payment and supplier boundaries, account-aware Allegro rate limits, and sensitive-data controls.

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Stock drift and publishable quantity lane | Pass | `buildStockSyncAttempt()` creates deterministic durable-attempt envelopes with account-aware one-request-per-second limits, stock drift classification, stock-out manual-review blocking, and terminal states. |
| Order retry and reconciliation lane | Pass | `classifyOrderForwarding()` preserves orders-microservice ownership, uses `(channel, channelAccountId, externalOrderId)` replay identity, and routes duplicate payload conflicts to manual review. |
| Payments and suppliers read-only lane | Pass | `buildPaymentReadOnlyContract()` allows only read status, settlement, and fee observations; `buildSupplierDryRunContract()` allows read/dry-run operations and forbids supplier writes. |
| Margin computation lane | Pass | `computeMarginCoverage()` returns `UNKNOWN` when economics inputs are missing and only returns `PASS` or `WARNING` when supplier, shipping, payment, Allegro fee, FX, and margin-floor inputs are complete. |
| Sensitive-data handling | Pass | Tests and evidence use synthetic identifiers only and add no OAuth tokens, Authorization headers, payment details, raw order payloads, supplier secrets, or production logs. |
| Parallel execution recovery | Pass | A-D lane handoffs have been reviewed and summarized here after earlier concurrent shared-file overwrites. Future lanes must avoid shared report writes unless assigned integration ownership. |
| TASK-006 contract implementation validation | Pass | Targeted `ts-node` contract spec, service build, `git diff --check`, `npm run ips:audit`, `npm run ips:pre-coding`, and deployment-readiness gate passed on 2026-06-21. |

## Gate evidence

- `git diff --check`: PASS on 2026-06-21.
- `npm run ips:audit`: PASS on 2026-06-21 with documentation audit score 100/100.
- `npm run ips:pre-coding`: PASS on 2026-06-21; report refreshed at `reports/validation/ips-pre-coding-gate.json`.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-006`: PASS on 2026-06-21; report refreshed at `reports/validation/ips-deployment-readiness-gate.json`.
- `LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef npx ts-node services/allegro-service/src/allegro/stock-order-profit-loop/stock-order-profit-loop.contract.spec.ts`: PASS on 2026-06-21.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-21.

## Invariant evidence

- ALG-INV-002: Stock and Allegro mutation planning remains account/rate-limit gated; no direct stock-to-Allegro implementation was added.
- ALG-INV-003: Order ownership remains with orders-microservice; Allegro local records remain channel projection and forwarding evidence only.
- ALG-INV-004: Validation examples are synthetic; no OAuth tokens, secrets, raw production logs, real buyers, real payments, or production supplier data were added.
- ALG-INV-005: No ownership boundary change or ADR-level decision was made.
- ALG-INV-006: TASK-006 remains linked through feature, goal impact, execution plan, and this validation report before coding.
- ALG-INV-007: Closure is not claimed; validation evidence remains partial and blockers are explicit.

## Sensitive-data scan evidence

Lane handoffs used synthetic identifiers such as synthetic order IDs, synthetic account IDs, synthetic supplier IDs, and example.invalid email addresses. No production payloads, OAuth tokens, Authorization headers, payment details, raw customer records, raw order logs, or supplier secrets were intentionally inspected or recorded. A final automated sensitive-data scan remains required before TASK-006 closure if any contract files, fixtures, or tests are added later.

## Replay and determinism evidence

- Stock lane: future stock sync must use the durable idempotent account-rate-limited attempt envelope before writing to Allegro; this slice defines the envelope but does not add the runtime queue.
- Order lane: replay relies on `orders.create.v1` identity `(channel, channelAccountId, externalOrderId)` and duplicate payload conflicts require manual review.
- Payments/suppliers lane: read-only and dry-run contracts include contract versions, source service names, lookup keys, freshness, and forbidden write operations; runtime clients remain future work.
- Margin lane: calculation is coverage-based and deterministic: return `UNKNOWN` when required economics are unavailable rather than inventing fee, settlement, shipping, currency, or margin-floor rules.

## Integrated lane findings

### TASK-006-A Stock

Current evidence: warehouse stock events update local offers, local offer stock fields exist, and Allegro stock mutation paths exist elsewhere. The safe contract is not direct event-to-Allegro propagation; it is a durable, idempotent, account-rate-limited stock sync attempt with observable terminal results.

Integration decision: warehouse availability remains authoritative. Reverse warehouse writes from inventory/import flows require owner review before stock automation is approved.

Approved contract assumptions and future runtime follow-ups:

- Approved assumption: warehouse publishable quantity is `max(warehouseAvailable - reservedQuantity, 0)` for the TASK-006 contract envelope.
- Approved assumption: stock drift threshold is contract input and defaults to zero for synthetic validation; runtime cadence remains a future operations task.
- Implemented contract: `buildStockSyncAttempt()` defines the durable attempt envelope; schema-backed queue persistence remains a future runtime task.
- Implemented contract: stock sync attempts use terminal states `SUCCEEDED`, `FAILED`, `STALE`, and `CANCELLED`.
- Implemented validation: synthetic stock drift fixtures are covered by `stock-order-profit-loop.contract.spec.ts`; subscriber runtime tests remain a future task.
- Approved assumption: stock-out defaults to manual review unless a future task explicitly chooses `set_zero_after_confirmation`.
- Future runtime follow-up: authoritative remote Allegro quantity reconciliation source must be selected before production mutation workers are added.

### TASK-006-B Orders

Current evidence: `shared/clients/order-client.service.ts` forwards `orders.create.v1` with `externalOrderId`, `channel`, and `channelAccountId`; `OrdersService.syncOrdersFromAllegro()` upserts local Allegro order projection and forwards mapped order data when a related offer exists. No order RabbitMQ subscriber was found; `WebhookEvent` exists but is not proven as an order-forward retry ledger.

Integration decision: preserve orders-microservice as source of truth. Treat `(channel, channelAccountId, externalOrderId)` as the candidate idempotency identity, but do not code reconciliation until duplicate-response behavior is confirmed.

Approved contract assumptions and future runtime follow-ups:

- Approved assumption: `orders.create.v1` duplicate behavior is represented as `accepted_same_payload`, `conflict_different_payload`, or `unknown`.
- Implemented contract: `classifyOrderForwarding()` defines replay decisions; durable storage remains a future runtime task.
- Implemented contract: failed forwards route to `reconcile`; endpoint or job implementation remains a future runtime task.
- Implemented contract: failure taxonomy includes duplicate conflict, transport error, payload rejected, missing offer, and unknown without raw payloads.
- Approved assumption: TASK-006 contract is source-agnostic and uses Allegro order identity after either event or list polling ingestion.
- Approved assumption: payload-equality check is required before marking duplicate conflicts as accepted.
- Future runtime follow-up: central order status mapping remains a runtime integration task outside this contract slice.

### TASK-006-C Payments And Suppliers

Current evidence: no dedicated payments client, supplier client, payment DTO contract, or supplier DTO contract exists in shared clients. Allegro local order records contain payment status evidence only. Supplier-related code is placeholder-only; the placeholder includes write-like methods and is not an approved integration contract.

Integration decision: payments and suppliers remain contract-blocked. TASK-006 may define read-only or dry-run contracts, but must not add payment writes, supplier purchase automation, refund/capture/settlement behavior, or real reservation behavior.

Approved contract assumptions and future runtime follow-ups:

- Implemented contract: payment lookup is read-only for status, settlement, and fee observation; refund writes are forbidden.
- Approved assumption: payment lookup key is `(channel, channelAccountId, externalOrderId)`; status enum mapping remains a future payments-owner task.
- Implemented contract: payment observations carry `observedAt` and `maxAgeSeconds` and include no payment details in fixtures.
- Implemented contract: supplier lookup allows read availability, read cost, read lead time, and simulate reservation only.
- Approved assumption: supplier identity uses `(catalogProductId, supplierId, supplierCode)` and dry-run never creates supplier-side state.
- Approved assumption: TASK-006 dry-run contract requires no supplier-side state creation; real service capability remains a future runtime verification task.

### TASK-006-D Margin

Current evidence: offer price, order revenue, catalog pricing hooks, supplier placeholder cost fields, and delivery/payment JSON fields exist. Current order forwarding sets shipping and tax values to zero, so those values cannot be treated as known economics. No Allegro fee client, payment settlement client, deterministic shipping-cost source, approved margin floor, or FX source exists in the inspected runtime paths.

Integration decision: margin planning must be coverage-based. Profitability is UNKNOWN when required inputs are missing; WARNING/PASS are allowed only when all required inputs and currency semantics are approved.

Approved contract assumptions and future runtime follow-ups:

- Implemented contract: Allegro fee is a required input; when absent, margin coverage returns `UNKNOWN`.
- Implemented contract: payment fee is a required read-only input; refund and chargeback writes are forbidden in TASK-006.
- Implemented contract: shipping cost is a required input; when absent, margin coverage returns `UNKNOWN`.
- Approved assumption: TASK-006 margin uses normalized `amount` and `currency` money inputs from upstream pricing sources.
- Implemented contract: `marginFloorRate` is an explicit required input.
- Implemented contract: supplier cost is a required input; richer supplier terms remain a future runtime task.
- Implemented contract: mixed-currency margin requires `fxRateToRevenueCurrency`; when absent, margin coverage returns `UNKNOWN`.
- Approved assumption: TASK-006 uses explicit revenue, shipping, fee, tax, and supplier inputs instead of inferring bundled Allegro total semantics.
- Approved assumption: `taxAmount` is optional and explicit; tax policy enrichment remains a future finance-owner task.

## Proposed validation cases for future coding tasks

- Stock sync attempt: repeated synthetic stock event produces one durable account-rate-limited sync attempt and deterministic terminal state.
- Stock drift: synthetic warehouse quantity and remote Allegro quantity mismatch is classified without mutating Allegro until policy allows it.
- Order replay: duplicate `orders.create.v1` attempt resolves through confirmed idempotency behavior or explicit manual-review state.
- Missing offer order: Allegro order without local matching offer is visible as blocked without stock, payment, or supplier side effects.
- Payment read-only: future payment client exposes reads only and rejects capture, refund, settlement, or payout mutation in TASK-006 scope.
- Supplier dry-run: future supplier reservation feasibility requires dry-run semantics and cannot place real supplier orders.
- Margin coverage: missing fee, shipping, payment, supplier, FX, or margin-floor input returns UNKNOWN, not PASS or WARNING.
- Redaction: synthetic fixtures and reports contain no real customer, supplier, payment, OAuth, token, or production log data.

## Issues found

- Shared validation report writes caused prior TASK-006 lane overwrites. Integration ownership is now explicit; future workers should return handoffs instead of editing shared reports unless assigned owner.
- TASK-006 is validated as a contract-first slice; runtime queue persistence, payment client calls, supplier client calls, and direct Allegro stock mutation remain future owner-approved implementation tasks.
- Existing supplier placeholder includes write-like methods and must not be reused as the TASK-006 supplier contract.
- Current order forwarding economics treat shipping and tax as zero, which is insufficient for margin truth.
- No runtime validation suite exists yet for stock drift, order reconciliation, read-only payments/suppliers, or margin coverage.

## Recommendation

Close TASK-006 as a validated contract-first slice. Future work should be split into smaller runtime tasks for schema-backed stock sync attempts, order reconciliation storage, read-only payments client calls, supplier dry-run client calls, and operational margin warnings.

## Traceability confirmation

TASK-006 remains aligned with VISION, VG-REVENUE, SYS-001, FEAT-006, GOAL-IMPACT-TASK-006, EP-TASK-006, and project invariants. The validated report preserves the Intent Preservation chain from Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation.
