# TASK-008-A Rate-Limit And Queue Handoff

## Intent Preservation Chain

- Vision: `docs/01_vision/VISION.md` [MISSING: not re-opened in this lane; execution-plan trace used instead]
- Goal Impact: `docs/22_goal_impact/GOAL-IMPACT-TASK-008.md` [MISSING: not re-opened in this lane; execution-plan trace used instead]
- System: `docs/04_systems/SYS-001-allegro-marketplace-integration.md` [MISSING: not re-opened in this lane; roadmap/integrations/runtime evidence used instead]
- Feature: `docs/10_features/FEAT-008-operations-trust-and-scale.md`
- Task: `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md`
- Execution Plan: `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`
- Coding Prompt: [MISSING: TASK-008 remains planning-only and is not approved for coding prompt conversion]
- Code: read-only runtime evidence from `services/allegro-service/src/allegro/**`, `shared/rabbitmq/stock-events.subscriber.ts`, and `shared/resilience/**`
- Validation: synthetic failure-path cases and sensitive-data sanity scan only; no repo-wide IPS gates run in this lane by design

## Scope And Readiness

- Lane objective: map account-aware Allegro throttling and queue/backpressure points, plus measurable failure modes, without changing runtime behavior.
- Readiness judgment: ready for integration as a planning handoff. Not ready for runtime implementation because queue ownership, polling SLO thresholds, and legacy direct-path retirement scope are still unresolved.

## Source Summary

- `docs/08_roadmap/ROADMAP.md` and `docs/17_governance/PROJECT_INVARIANTS.md` keep `ALG-INV-002` fixed at max `1 request per second per account` unless a newer approved policy exists.
- `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md` assigns this lane to inspection-only output: control map, metrics, and synthetic failure cases.
- `services/allegro-service/src/allegro/policy/policy-engine.service.ts` records `rate-limit-readiness` only as a policy pass statement; it does not itself enforce pacing.
- `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` is the clearest governed queue surface: `PREPARED -> BLOCKED/PREPARED -> QUEUED -> RUNNING -> SUCCEEDED/FAILED`, with stale detection and monitoring summary counts.
- `shared/rabbitmq/stock-events.subscriber.ts` is the active inbound queue/backpressure surface for stock changes. It consumes `stock.#`, updates local offer stock, acknowledges on success, and dead-letters by `nack(..., false, false)` on processing errors.
- `services/allegro-service/src/allegro/events/events.service.ts` and `allegro-api.service.ts` expose offer/order polling surfaces that need rate-limit-aware scheduling but do not document queue ownership or pacing in this lane.
- `services/allegro-service/src/allegro/offers/offers.service.ts` still contains legacy direct mutation/retry paths, including explicit `429` handling text, publish queue logging, retry loops, and a `200ms` inter-call delay in clone flows. That is evidence of rate-limit sensitivity, but not yet a single canonical per-account throttling implementation.

## Control Map

| Control point | Runtime evidence | Current behavior | Account awareness | Queue/backpressure observation | Recommended metric/alert candidate |
| --- | --- | --- | --- | --- | --- |
| Policy gate: rate-limit readiness | `services/allegro-service/src/allegro/policy/policy-engine.service.ts` | Marks publish attempts as expected to enter governed queue before Allegro execution. | Yes in policy wording and target metadata. | Policy-only; no measured queue depth here. | Count policy evaluations by `accountId`; alert if attempts bypass governed lifecycle in future diffs. |
| Governed publish queue | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` | `confirm()` transitions attempts to `QUEUED`; `execute()` moves to `RUNNING`; `monitoringSummary()` counts blocked/queued/running/failed/stale. | Yes: attempts store `accountId`, `requestedByUserId`, `catalogProductId`, `offerId`. | Canonical backpressure surface for publish/update lifecycle, but execution still appears request-driven rather than worker-claimed. | Queue depth by `accountId`; stale count; oldest queued age; failed attempt rate; blocked reason frequency. |
| Idempotent attempt key | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts` | Deterministic SHA-based idempotency key prevents duplicate attempt creation for same action/requester/target. | Yes through target payload including `accountId`. | Limits duplicate enqueue pressure for repeated prepare calls. | Duplicate-attempt reuse ratio; alert if same operator creates many near-identical attempts with different custom keys. |
| Stock inbound queue | `shared/rabbitmq/stock-events.subscriber.ts` | Subscribes to `stock.events` topic, queue `stock.allegro-service`, updates local offer stock, rejects bad messages without requeue. | Indirect only; handler updates all offers for a `catalogProductId`, regardless of per-account pacing. | RabbitMQ queue is explicit; no prefetch/concurrency cap is visible; poison messages are dropped after error. | Queue lag; consumer error count; rejected-message count; product-level fan-out size; repeated stock drift alerts. |
| Offer event polling | `services/allegro-service/src/allegro/events/events.service.ts`, `services/allegro-service/src/allegro/allegro-api.service.ts` | Fetches offer events with `after` cursor and configurable limit. | [UNKNOWN: account partitioning for event polling callers is not visible in this lane.] | Polling backlog can create implicit backpressure if cursor advancement stalls. | Poll interval SLO; cursor age; empty-poll ratio; fetch failure rate; per-account poll duration. |
| Order event polling fallback | `services/allegro-service/src/allegro/events/events.service.ts`, `services/allegro-service/src/allegro/allegro-api.service.ts` | If `/order/events` is unavailable, returns empty events and relies on order sync fallback. | [UNKNOWN: account partitioning for order sync fallback.] | Silent empty fallback can hide backlog rather than exposing queue pressure. | Alert when order-event fallback path is hit repeatedly; track fallback frequency and time since last non-empty order ingest. |
| Legacy direct mutation/retry paths | `services/allegro-service/src/allegro/offers/offers.service.ts` | Contains manual retry loops, `429` message extraction, publish queue logging, and fixed delay snippets. | Partial at best; account context is not visibly enforced in every snippet inspected. | Residual non-governed traffic can compete with governed lifecycle and mask true queue pressure. | Alert on Allegro `429` rate, retry-loop count, and any mutation call sites outside publish lifecycle. |

## Measurable Failure Modes

| Failure mode | Evidence | Observable symptom | Candidate metric | Candidate alert threshold |
| --- | --- | --- | --- | --- |
| Publish attempts accumulate in `QUEUED` without execution drain | `publish-lifecycle.service.ts` queue and stale states | Growing queue depth, rising oldest queued age, stale transitions after `staleAt` | `allegro_publish_attempt_queued_total`, `allegro_publish_attempt_oldest_queued_seconds`, `allegro_publish_attempt_stale_total` | Page if any account has queued age above `[MISSING: approved SLO]`; warn if stale attempts > 0 for 15m |
| Attempts reach `FAILED` after execution | `publish-lifecycle.service.ts` failure context and remediation | Increasing failed counts, repeated same failure code | `allegro_publish_attempt_failed_total{code,accountId,action}` | Warn on repeated same code per account within 15m; page on cross-account spike |
| Policy-blocked attempts hide operational readiness debt | `policy-engine.service.ts` blocker and warning gates | Many blocked attempts for account-readiness, catalog-validation, stock-readiness | `allegro_publish_attempt_blocked_total{gate,accountId}` | Warn on sustained blocker rate increase; page if account-readiness blockers spike across all active accounts |
| Rate-limit violations surface as HTTP `429` | `offers.service.ts` explicit `429` handling text | Allegro responses return rate-limit errors, retry loops increase latency | `allegro_api_http_429_total{accountId,route}`, `allegro_api_retry_total{accountId,route}` | Warn on any sustained `429`; page if `429` continues beyond `[MISSING: approved retry budget]` |
| Stock event consumer drops messages | `stock-events.subscriber.ts` `nack(msg, false, false)` on error | Message loss, stock drift, repeated processing errors | `allegro_stock_event_consumer_error_total`, `allegro_stock_event_rejected_total`, `allegro_stock_event_queue_lag_seconds` | Page on any rejected-message burst; warn if queue lag grows steadily |
| Polling cursor stalls or endpoint fallback hides missing events | `events.service.ts` returns empty order events on fallback | No new order events while sync fallback keeps returning empty | `allegro_order_event_fallback_total`, `allegro_offer_event_cursor_age_seconds`, `allegro_order_event_last_nonempty_age_seconds` | Warn on repeated fallback hits; page if cursor age exceeds `[MISSING: polling SLO]` |
| Legacy direct paths bypass governed queue | `policy-engine.service.ts` legacy warning plus `offers.service.ts` direct mutation evidence | Publish/update happens without governed attempt record, making queue depth misleading | `allegro_legacy_mutation_call_total{route}`, `allegro_publish_attempt_missing_context_total` | Page on any production mutation route proven outside lifecycle after integration approval |
| Fixed-delay pacing is insufficient for multi-account bursts | `offers.service.ts` `200ms` spacing and other retry sleeps | Bursty API traffic, uneven per-account saturation, misleading aggregate success rate | `allegro_api_request_spacing_ms{accountId}`, `allegro_account_request_rate_per_second` | Warn if any account exceeds approved 1 rps invariant; page if sustained |

## Synthetic Failure-Path Validation Cases

These are planning-only cases for TASK-008-E or later coding tasks. They use synthetic accounts, offers, products, tokens, and event payloads only.

1. Queue saturation case
   - Create synthetic publish attempts for one `accountId` until queue depth exceeds the agreed per-account budget.
   - Expected result: attempts remain visible in governed `QUEUED` state; oldest queued age and backlog metrics rise; no hidden direct mutation path is used.

2. Account isolation case
   - Flood synthetic attempts for `account-A` while keeping a small stream for `account-B`.
   - Expected result: `account-B` retains progress; metrics are partitioned by `accountId`; alerts identify the noisy account instead of the whole service.

3. OAuth-expired before execution case
   - Queue a synthetic attempt with an account whose token expires before execution starts.
   - Expected result: failure or block surfaces through account-readiness/failure metrics without exposing token material; remediation points to re-authorization only.

4. Allegro `429` burst case
   - Stub Allegro responses to return `429` for a bounded synthetic account window.
   - Expected result: request-rate metrics, retry metrics, and per-account alerts fire; no secret-bearing response body is logged into evidence.

5. Stock consumer poison-message case
   - Publish malformed synthetic `stock.updated` payload to `stock.allegro-service`.
   - Expected result: consumer error and rejected-message counters increment; message is not requeued endlessly; stock drift alert coverage remains visible.

6. Order-event fallback invisibility case
   - Force synthetic `/order/events` unavailability while keeping order-sync empty.
   - Expected result: fallback counter increases and stale-ingest alert fires before operators assume healthy order flow.

7. Legacy bypass detection case
   - Execute a synthetic direct mutation path outside governed lifecycle in a test harness.
   - Expected result: dedicated bypass metric/alert fires because queue depth alone cannot explain the mutation.

8. Stale-attempt rollover case
   - Leave synthetic publish attempts unexecuted past `staleAt`.
   - Expected result: derived `STALE` state appears and oldest queued/stale counters become actionable.

## Explicit Blockers And Missing Facts

- [MISSING: approved per-account queue depth budget and queue-age SLO]
- [MISSING: approved alert thresholds for `429`, retry budget, and stale-attempt age]
- [MISSING: canonical worker or scheduler that drains governed `QUEUED` attempts asynchronously per account]
- [MISSING: explicit account-partition contract for offer-event and order-event polling]
- [MISSING: approved queue/consumer ownership for stock drift reconciliation versus direct Allegro stock sync]
- [UNKNOWN: whether any uninspected runtime paths already enforce per-account throttling below `offers.service.ts` snippets]
- [UNKNOWN: whether production telemetry already exists in logging/metrics infrastructure for these counters]

## Sensitive-Data-Safe Evidence

- No raw OAuth tokens, client secrets, queue credentials, customer data, or production log excerpts are included here.
- Evidence is limited to source file paths, control behavior summaries, and synthetic validation design.
- The only command-based validation for this lane is a sensitive-data sanity grep on this handoff file.

## Exact Commands Used

```bash
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && printf "PWD=%s\n" "$PWD" && git status --short --branch && git log -1 --oneline'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" docs/10_features/FEAT-008-operations-trust-and-scale.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" docs/08_roadmap/ROADMAP.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" docs/17_governance/PROJECT_INVARIANTS.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,260p" docs/16_operations/INTEGRATIONS.md'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && rg -n "rate.?limit|thrott|queue|bull|backpressure|retry|429|Too Many|poll|worker|concurrency|p-limit|bottleneck|sleep|delay" services/allegro-service/src shared prisma -g "*.ts" -g "*.js" -g "*.md"'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,260p" services/allegro-service/src/allegro/policy/policy-engine.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,440p" services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,220p" shared/rabbitmq/stock-events.subscriber.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1,260p" services/allegro-service/src/allegro/events/events.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "3110,3175p" services/allegro-service/src/allegro/offers/offers.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "4960,5055p" services/allegro-service/src/allegro/offers/offers.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "6288,6325p" services/allegro-service/src/allegro/offers/offers.service.ts'
ssh alfares 'cd /home/ssf/Documents/Github/allegro-service && sed -n "1030,1075p" services/allegro-service/src/allegro/allegro-api.service.ts'
```
