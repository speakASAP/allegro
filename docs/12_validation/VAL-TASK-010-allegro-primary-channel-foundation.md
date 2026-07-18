# VAL-TASK-010: Allegro Primary Channel Foundation Validation Report

```yaml
id: VAL-TASK-010
status: draft
source_task: ../11_tasks/TASK-010-allegro-primary-channel-foundation.md
execution_plan: ../21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md
created: 2026-06-29
last_updated: 2026-06-30
completeness_level: complete
sensitive_data_classification: synthetic
```

Validation id: VAL-TASK-010
Target: TASK-010
Date: 2026-06-29
Validator: AI agent

## Summary

TASK-010 opens the Allegro primary-channel foundation implementation. This
validation report covers W0/W1, W2, W3, W4, and W5 foundation work: IPS
traceability, script-safety guardrails, additive Prisma sync/projection models,
opt-in local sync evidence recording, publish preview-token binding, raw payload
retention metadata, category-parameter readiness evidence, and no-mutation
checks.

## Upstream goal

TASK-010 supports FEAT-010, GOAL-IMPACT-TASK-010, and the primary-channel master
plan by turning Allegro import and export mapping into safe implementation lanes.

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| TASK-010 IPS spine exists | Pass | `FEAT-010`, `TASK-010`, `GOAL-IMPACT-TASK-010`, context package, execution plan, prompt, validation report, graph nodes/edges, `TASKS.md`, and `STATE.json` are present at commit `ef315a2`. |
| Live mutation paths were not executed | Pass | Validation used diff, build, and documentation gates only. No live Allegro import or export apply, Warehouse stock mutation, BizBox apply, central order replay apply, payment/refund write, or deploy was run. |
| Script foundation scope is bounded | Pass | W1 added `services/allegro-service/src/scripts/lib/script-safety.ts` and integrated only `import-checkout-forms-local.ts` plus `audit-current-stock-source.ts`. |
| Additive schema foundation is bounded | Pass | W2 added only new Prisma models and a new migration for `AllegroSyncRun`, `AllegroSyncCursor`, `AllegroRawPayload`, `AllegroProjectionAuditLog`, and `AllegroOfferStockSnapshot`; no existing fields were renamed or dropped. |
| Opt-in sync evidence wiring is bounded | Pass | W3 added `services/allegro-service/src/scripts/lib/sync-recording.ts` and explicit `--record-sync-run --confirm-sync-recording ALLEGRO_SYNC_RECORDING_LOCAL_ONLY` gates to checkout-form import and current-stock audit scripts. Default script behavior remains no sync-evidence DB writes. |
| Publish preview-token binding is bounded | Pass | W4 added `previewToken` confirmation contracts to publish lifecycle and Catalog sell-action confirm routes. `prepare` returns the token, `confirm` requires it, and only token hashes/confirmation metadata are persisted. |
| Direct offer routes can pass preview-token controls | Pass | W4b added `previewToken` and `lifecycleIdempotencyKey` controls to direct offer update and sync-to-Allegro routes, strips those controls from command payloads, and forwards the token to the governed lifecycle. |
| Bulk publish can pass preview-token controls | Pass | W4c added bulk publish `lifecycleIdempotencyKeyPrefix`, `previewTokensByIdempotencyKey`, and `previewTokensByOfferId` controls, forwards token maps to `executeMany`, and redacts preview-token maps from request logs. |
| Raw payload retention policy is explicit and report-only | Pass | W5 added `raw-payload-retention-v1` metadata, policy snapshots in opt-in sync run config, and a read-only retention audit script. No cleanup, delete, redaction, import, export, or live Allegro write path was added. |
| Category-parameter export readiness has offline evidence | Pass | W5 added the category parameter API wrapper, authenticated read route, and a pure readiness evaluator with synthetic tests for required parameter coverage. Live UI enforcement and complete category mapping remain gated. |
| Migration was not applied to live database | Pass | W2 ran Prisma validate/generate and service build only. It did not run `migrate deploy`, direct migration runners, import scripts, or live data mutation commands. |
| Migration was not applied to live database in W3 | Pass | W3 ran Prisma validate/generate and service build only. It did not run `migrate deploy`, direct migration runners, import scripts, live data mutation commands, or deploy. |
| Live publish was not executed in W4 validation | Pass | W4 validation used build and synthetic unit specs only. It did not run live publish/update, Allegro write endpoints, migration apply, deploy, Warehouse stock mutation, or BizBox apply. |
| Live publish was not executed in W4b validation | Pass | W4b validation used diff, build, and synthetic publish lifecycle spec only. It did not run live publish/update, Allegro write endpoints, migration apply, deploy, Warehouse stock mutation, or BizBox apply. |
| Live publish was not executed in W4c validation | Pass | W4c validation used diff, build, and synthetic publish lifecycle spec only. It did not run live publish/update, Allegro write endpoints, migration apply, deploy, Warehouse stock mutation, or BizBox apply. |
| Live mutation paths were not executed in W5 validation | Pass | W5 validation used diff, build, synthetic category readiness tests, documentation review, and report-only code paths only. It did not run live Allegro reads/writes, import apply, export apply, migration apply, deploy, Warehouse stock mutation, or BizBox apply. |
| Owner-approved current-stock Warehouse apply executed | Pass | On 2026-06-29 owner approval was granted for stock apply. Guarded dry-run/verify found 9 unique stock-authoritative offers, Warehouse matched 9/9, and guarded apply used `--confirm-apply ALLEGRO_CURRENT_STOCK_IMPORT` against warehouse `c0de0000-0000-4000-8000-000000000013`; applied 9, failed 0. |
| W2 live migration and deploy coordination completed | Pass | Live Prisma history was baseline-resolved for already-existing schema migrations, then `20260629170000_add_allegro_sync_projection_foundation` was applied. `migrate status` reports up to date and Kubernetes deployments now run image tag `c0d4953`. |
| Local stock sync evidence recording executed | Pass | `audit-current-stock-source` ran with `--record-sync-run --confirm-sync-recording ALLEGRO_SYNC_RECORDING_LOCAL_ONLY`; it wrote 3 sync runs, 27 raw payloads, 27 projection audit logs, and 27 stock snapshots. |
| Raw payload retention audit works in runtime | Pass | `audit-raw-payload-retention` now bootstraps `DATABASE_URL` from pod `DB_*` env and reported 27 `offer_stock_payload` records, 0 expired, report-only cleanup. |
| TASK-009 IPS debt repaired | Pass | TASK-009 documentation/graph debt was repaired on 2026-06-29; strict audit, pre-coding, and TASK-010 readiness gates now pass for this slice. |

## Gate evidence

- `git diff --check`: PASS on 2026-06-29 during W0/W1 validation.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after
  script safety helper integration.
- `npx prisma validate --schema prisma/schema.prisma`: PASS on 2026-06-29 after
  W2 schema model additions.
- `npx prisma generate --schema prisma/schema.prisma`: PASS on 2026-06-29 after
  W2 schema model additions.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W2
  additive schema model additions.
- `git diff --check`: PASS on 2026-06-29 after W3 opt-in sync recording
  helper wiring.
- `npx prisma validate --schema prisma/schema.prisma`: PASS on 2026-06-29 after
  W3 script wiring.
- `npx prisma generate --schema prisma/schema.prisma`: PASS on 2026-06-29 after
  W3 script wiring.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W3
  opt-in sync recording helper wiring.
- `npm run ips:audit`: FAIL on 2026-06-29 with 17 findings, all tied to
  pre-existing TASK-009 documentation/graph debt plus the audit heuristic that
  treats the active TASK-009 plan as blocking prompt use. TASK-010-specific
  heading, metadata, and placeholder findings were corrected before this report
  update.
- `npm run ips:pre-coding`: FAIL on 2026-06-29 because
  `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md` still
  lacks a validation plan. TASK count, upstream traceability, project
  invariants, shared principles, and sensitive-data checks passed.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`:
  FAIL on 2026-06-29 because strict audit and pre-coding gate inherit TASK-009
  debt. Protected-file checks and target validation-report discovery passed.
- `npm run ips:audit`: FAIL on 2026-06-29 after W3 with the same 17
  TASK-009 documentation/graph findings; no new TASK-010 findings appeared in
  the gate output.
- `npm run ips:pre-coding`: FAIL on 2026-06-29 after W3 because
  `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md` still
  lacks a validation plan. Sensitive-data findings remained empty.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`:
  FAIL on 2026-06-29 after W3 because strict audit and pre-coding gate inherit
  TASK-009 debt. Protected-file checks and target validation-report discovery
  passed.
- `git diff --check`: PASS on 2026-06-29 after W4 preview-token binding.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W4
  preview-token binding.
- `npx ts-node services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts`:
  PASS on 2026-06-29. Synthetic tests cover missing preview-token rejection and
  preview-token-confirmed update execution.
- `npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`:
  PASS on 2026-06-29 after Catalog sell-action confirm pass-through updates.
- `git diff --check`: PASS on 2026-06-29 after W4b direct route preview-token
  pass-through.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W4b
  direct route preview-token pass-through.
- `npx ts-node services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts`:
  PASS on 2026-06-29 after W4b direct route preview-token pass-through.
- `git diff --check`: PASS on 2026-06-29 after W4c bulk publish
  preview-token pass-through.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W4c
  bulk publish preview-token pass-through.
- `npx ts-node services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts`:
  PASS on 2026-06-29 after W4c bulk publish preview-token pass-through.
- `git diff --check`: PASS on 2026-06-29 after W5 raw payload retention and
  category-parameter readiness updates.
- `npx ts-node services/allegro-service/src/allegro/categories/category-parameter-readiness.spec.ts`:
  PASS on 2026-06-29. Synthetic tests cover ready, missing required parameter,
  and missing category requirement cases.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-29 after W5
  raw payload retention and category-parameter readiness updates.
- `npm run ips:audit`: FAIL on 2026-06-29 after W5 with the same 17 TASK-009
  documentation/graph findings; no new TASK-010 findings appeared in the gate
  output.
- Live Prisma baseline and migration deploy: PASS on 2026-06-29. Seven
  already-existing schema migrations were marked applied in
  `_prisma_migrations`, then
  `20260629170000_add_allegro_sync_projection_foundation` was applied;
  post-check reported database schema up to date and the five W2 tables
  present.
- `./scripts/deploy.sh`: PASS on 2026-06-29 for image tag `8552ef5` in
  211.30s, then PASS for image tag `c0d4953` in 56.20s after the retention
  audit runtime fix.
- External health after deploy: PASS on 2026-06-29. The frontend route
  returned HTTP 200 and the API health route returned `status=ok`.
- Current-stock dry-run/verify: PASS on 2026-06-29. Mode `dry-run`,
  `mutatesWarehouse=false`, 9 unique stock-authoritative offers, Warehouse
  matches 9, mismatches 0, errors 0.
- Owner-approved current-stock Warehouse apply: PASS on 2026-06-29. Mode
  `apply`, `mutatesWarehouse=true`, warehouse
  `c0de0000-0000-4000-8000-000000000013`, `applied=9`, `applyFailed=0`,
  reason code `ALLEGRO_CURRENT_STOCK_IMPORT`.
- Post-apply dry-run/verify: PASS on 2026-06-29. Warehouse still matched
  9/9 unique stock-authoritative offers with errors 0.
- Local sync evidence recording: PASS on 2026-06-29. Confirmed local-only
  sync recording wrote 3 sync runs, 27 raw payloads, 27 audit logs, and 27
  stock snapshots.
- Raw payload retention audit: PASS on 2026-06-29 after `c0d4953`.
  Report-only audit found 27 `offer_stock_payload` records and 0 expired
  payloads.
- `npm run ips:audit`: FAIL on 2026-06-29 after live-cycle documentation
  updates with the same 17 TASK-009 documentation/graph findings; no new
  TASK-010 findings appeared in the gate output.

## Invariant evidence

- ALG-INV-001: Pass. TASK-010 did not add offer mutation or bypass Catalog
  validation.
- ALG-INV-002: Pass. TASK-010 did not change Allegro API rate-limit behavior.
- ALG-INV-003: Pass. TASK-010 did not forward or own central orders.
- ALG-INV-004: Pass. `npm run ips:pre-coding` reported no sensitive-data
  findings. W3 validation did not print raw Allegro payloads, buyer fields,
  raw preview tokens, token hashes, account secrets, addresses, emails, or live
  order/offer identifiers in this report.
- ALG-INV-005: Pass. TASK-010 did not change runtime service ownership
  boundaries; W2 added channel projection tables only.
- ALG-INV-006: Pass. TASK-010 traceability exists across feature, task,
  goal-impact, context, execution plan, prompt, validation, graph, `TASKS.md`,
  and `STATE.json`.
- ALG-INV-007: Pass. TASK-010 validation evidence is recorded, and the
  TASK-009 IPS documentation debt that previously blocked readiness closure was
  repaired on 2026-06-29.

## Sensitive-data scan evidence

`npm run ips:pre-coding` reported no sensitive-data findings. TASK-010
validation artifacts use synthetic or aggregate evidence only and do not add raw
buyer data, emails, phone numbers, addresses, payment payloads, OAuth tokens,
Authorization headers, service credentials, raw order payloads, raw offer
payloads, or unmasked production screenshots. W3 code can record raw payloads
only when an operator explicitly passes `--record-sync-run` with
`--confirm-sync-recording ALLEGRO_SYNC_RECORDING_LOCAL_ONLY`.

## Replay and determinism evidence

W1 adds a shared `script-safety` helper so safe scripts report mutation scope,
mode, task id, allowed writes, forbidden writes, forwarding status, and
confirmation status consistently. W2 adds account-aware sync runs, cursors, raw
payload hashes, projection audit logs, and stock snapshots so future imports can
be replayed and reviewed without using `SyncJob` or `WebhookEvent` as overloaded
primary-channel state. `AllegroSyncRun.idempotencyKey` is unique when present so
replayed sync runs can be bound to one durable run record. Future apply paths
still need preview-token binding and idempotency before production use.

W3 wires the schema foundation into safe script paths behind explicit opt-in
recording. `import-checkout-forms-local.ts` can record `order.checkout-forms`
sync runs, cursors, hashed raw checkout-form payloads, and projection audit logs
without forwarding orders to another service. `audit-current-stock-source.ts`
can record `sale.product-offers.stock` sync runs, cursors, raw detail payload
hashes, projection audit logs, and `AllegroOfferStockSnapshot` rows from the
Allegro sale product-offers detail endpoint. The Allegro sale offers listing
endpoint remains comparison/listing evidence only; Warehouse remains the
physical stock owner.
`script-safety` now reports `mutatesLocalSyncEvidence` separately from local
projection writes.

W4 adds preview-token binding to publish confirmation. `prepare` returns a
deterministic token bound to the redacted command payload, action, idempotency
key, requester, target, and stale window. `confirm` requires that token before
queueing a publish/update attempt and stores only token hashes and confirmation
metadata in `policySnapshot.previewTokenBinding`. Catalog sell-action confirm
routes pass this token through to the governed lifecycle. This is a fail-closed
foundation; full offer export remains gated by category/parameter validation,
owner approval, and live write procedure.

W4b propagates preview-token controls into direct offer update and sync routes.
`UpdateOfferDto` accepts `previewToken` and `lifecycleIdempotencyKey`, and
`OffersController` strips those lifecycle-only fields before hashing or sending
command payloads. The sync-to-Allegro route accepts the same controls in its
request body. Existing one-step routes without a token remain fail-closed under
the W4 confirmation gate.

W4c propagates preview-token controls into the bulk publish route. The route now
accepts a stable lifecycle idempotency prefix plus tokens keyed either by
idempotency key or offer id, forwards the resolved token map to `executeMany`,
and redacts token maps from request-body logs.

W5 makes raw payload retention explicit without adding destructive cleanup.
Opt-in sync recording snapshots `raw-payload-retention-v1` policy metadata, uses
the shared redaction version constant, and exposes a report-only audit script
that can count rows past their retention windows. The script is intentionally
read-only: it reports retention debt but does not update, redact, delete, import,
export, deploy, or call live Allegro.

W5 also adds category-parameter readiness evidence before broader offer export.
The Allegro category parameter wrapper and authenticated read route provide the
missing local retrieval surface, while the pure readiness evaluator can validate
whether a draft contains required category parameters using synthetic payloads.
This does not yet claim full category coverage or live UI enforcement.

## Issues found

- Historical issue resolved: TASK-009 documentation/graph audit debt existed
  before TASK-010 and blocked earlier gates, then was repaired separately on
  2026-06-29 before this durable forwarding deployment evidence was recorded.
- Owner approval for the one-time current-stock Warehouse apply was granted
  and used on 2026-06-29. Recurring automatic stock sync and Allegro
  quantity-command write-back remain separate follow-up work.
- Finance owner approval for refunds, captures, payouts, and settlement writes
  is not granted in TASK-010.
- Customer service owner approval for returns, claims, invoices, and issues
  write-back is not granted in TASK-010.
- Fulfillment owner approval for shipment and label write-back is not granted in
  TASK-010.
- Raw payload cleanup/delete automation is not implemented. Retention is
  metadata/report-only until a separate owner-approved maintenance job exists.
- Full live category mapping coverage and UI/API enforcement of category
  parameter readiness remain gated beyond the W5 offline helper.
- Live Prisma history had to be baseline-resolved because
  `_prisma_migrations` was absent while older schema changes already existed.
  The W2 sync/projection migration is now applied, but this baseline event
  should remain documented for future migration audits.
- W4 intentionally makes confirmation token-bound. Direct convenience routes
  that still use one-step prepare/confirm/execute must either accept and forward
  preview tokens or remain blocked/fail-closed before production use.
- W4b/W4c cover direct single-offer update, sync-to-Allegro, and bulk publish
  token propagation. W5 covers retention metadata and offline category-parameter
  readiness evidence. Migration/deploy coordination and the owner-approved
  current-stock Warehouse apply are complete; live category coverage and Allegro
  quantity-command write-back remain follow-up work before production use.

## Recommendation

Accept TASK-010-W0, W1, W2, W3, W4 preview-token binding, W5
retention/category-readiness foundation, P1/P2/P7 guarded import surfaces, and
durable order-forwarding attempt storage as implemented. TASK-009 IPS debt was
repaired on 2026-06-29, and the TASK-010 strict audit, pre-coding, and
readiness gates now pass for this slice. Continue to require preview/dry-run
evidence and explicit owner approval for any new live apply path beyond the
2026-06-29 current-stock Warehouse import.

## Traceability confirmation

TASK-010 is aligned with FEAT-010, GOAL-IMPACT-TASK-010, the Allegro mapping
document, and the primary-channel implementation plan. It preserves the Intent
Preservation chain and does not authorize additional live mutations beyond the
documented owner-approved stock apply, schema migration, deployment, and
guarded read checks.

## P1/P2/P7 Validation Addendum

Date: 2026-06-29

### Implemented scope

- P1: `OrdersService.syncOrdersFromAllegro()` now defaults to local projection
  only. Central order forwarding requires exact confirmation
  `ALLEGRO_ORDER_FORWARDING_TO_ORDERS_MICROSERVICE`.
- P2: order-derived offer/product recovery scripts now separate dry-run,
  local projection, and Catalog apply modes with exact confirmations.
- P2: active-offer Catalog import script now defaults to dry-run and refuses
  missing apply confirmation before Nest/Prisma startup.
- P2: HTTP offer import approval routes now require
  `ALLEGRO_HTTP_OFFER_IMPORT_CATALOG_APPLY`; the legacy GET all-import route
  is blocked.
- P7: read-only operations API and dashboard Operations page expose sync run,
  cursor, raw payload metadata, projection audit, and stock snapshot evidence.

### Additional gate evidence

- `git diff --check`: PASS after P1/P2/P7 code and docs updates.
- `npx ts-node services/allegro-service/src/allegro/orders/order-forwarding.mapper.spec.ts`:
  PASS.
- `npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`:
  PASS. Covers default no-forward behavior and explicit guarded forwarding.
- `npx ts-node services/allegro-service/src/allegro/operations/operations.service.spec.ts`:
  PASS. Covers read-only summary counts and verifies raw payload JSON is not
  selected by the metadata list.
- `cd services/allegro-service && npm run build`: PASS after guarded import and
  operations API changes.
- `cd services/frontend && npm run build`: PASS after the dashboard Operations route.
- `node dist/scripts/import-order-offer-products.js --account-name statexcz --apply`:
  expected FAIL before apply with missing
  `ALLEGRO_ORDER_OFFER_CATALOG_IMPORT` confirmation.
- `node dist/scripts/import-allegro-offers-to-catalog.js --user-id 00000000-0000-0000-0000-000000000000 --apply`:
  expected FAIL before app/DB startup with missing
  `ALLEGRO_ACTIVE_OFFER_CATALOG_IMPORT` confirmation.

### Remaining blockers

- Durable central order forwarding attempt/status storage is implemented in the addendum below.
- `orders.create.v1` duplicate/equality behavior is confirmed by orders-microservice source inspection and verification scripts.
- `[MISSING: governed preview-token policy for OffersController import approval routes]`
- `[MISSING: Catalog owner approval contract for broad active-offer Catalog import]`
- `[MISSING: governed Allegro quantity command write-back with polling and terminal state checks]`
- TASK-009 audit/pre-coding debt was repaired separately on 2026-06-29; TASK-010 strict audit, pre-coding, and readiness gates now pass for this slice.

## Durable Order Replay/Equality Storage Addendum

Date: 2026-06-29

### Implemented scope

- Added additive Prisma model and tracked migration `20260629210000_add_allegro_order_forwarding_attempts` for `AllegroOrderForwardingAttempt`.
- `OrdersService.syncOrdersFromAllegro()` now records forwarding attempt evidence for disabled local-only projection, mapping-blocked forwarding, successful explicit forwarding, and failed explicit forwarding.
- Forwarding attempt records include `orders.create.v1` idempotency key, channel/account/order identity, payload hash, replay equality status, blocked reasons, request summary, response summary, and error summary.
- `GET /api/allegro/operations/order-forwarding-attempts` exposes read-only forwarding evidence through the existing authenticated operations surface.
- Default order sync remains local projection only. Central forwarding still requires `forwardToOrdersMicroservice=true` and exact confirmation `ALLEGRO_ORDER_FORWARDING_TO_ORDERS_MICROSERVICE`.

### Gate evidence

- `git diff --check`: PASS after durable order forwarding storage changes.
- `npx prisma validate --schema prisma/schema.prisma`: PASS.
- `npx prisma generate --schema prisma/schema.prisma`: PASS.
- `npx ts-node services/allegro-service/src/allegro/orders/order-forwarding.mapper.spec.ts`: PASS.
- `npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`: PASS. Synthetic coverage includes disabled, blocked, forwarded, and audit-write-failed durable attempt behavior.
- `npx ts-node services/allegro-service/src/allegro/operations/operations.service.spec.ts`: PASS. Synthetic coverage includes summary counts and order-forwarding-attempt list selection without raw payload/body fields.
- `cd services/allegro-service && npm run build`: PASS.
- `npm run ips:audit`: PASS, 100/100, 73 files checked, 0 findings.
- `npm run ips:pre-coding`: PASS.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`: PASS.
- Live Prisma migration deploy: PASS on 2026-06-29.
  `20260629210000_add_allegro_order_forwarding_attempts` was applied against
  the cluster database through the cluster-internal Postgres service IP, and
  post-deploy `migrate status` reported database schema up to date with 9
  migrations.
- Live table verification: PASS on 2026-06-29.
  `public.allegro_order_forwarding_attempts` exists in the Allegro database;
  row count was 0 before any live central order-forwarding command.
- `./scripts/deploy.sh`: PARTIAL on 2026-06-29 for the code-bearing
  image tag `14183a9`. Image build, push, manifest apply, and image set
  completed, then the script exited 1 after an intermediate `allegro-service`
  rollout wait timeout while the new pod was still starting.
- Follow-up Kubernetes rollout verification: PASS on 2026-06-29.
  `allegro-service`, `allegro-api-gateway`, `allegro-settings`,
  `allegro-imports`, and `allegro-frontend` all successfully rolled out after
  the intermediate wait timeout.
- Final evidence redeploy policy: PASS. Documentation-only evidence commits
  may advance the image tag beyond the code-bearing rollout; the handoff must
  verify that pushed `main`, Kubernetes image tags, migration status, and live
  routes agree at completion time.
- External health after deployment: PASS on 2026-06-29.
  `https://allegro.alfares.cz/api/health` returned API gateway `status=ok`,
  and `https://allegro.alfares.cz/` returned HTTP 200.
- Protected operations route check: PASS on 2026-06-29.
  Unauthenticated
  `GET /api/allegro/operations/order-forwarding-attempts?page=1&limit=5`
  returned HTTP 401 `No token provided`, confirming the route is reachable
  through the guarded operations surface without exposing data anonymously.

### Boundaries

- Live database migration apply completed for
  `20260629210000_add_allegro_order_forwarding_attempts`; the forwarding
  attempts table exists and was empty before any live central forwarding.
- Kubernetes deployments were rolled after the durable forwarding code and
  evidence commits. The first code-bearing rollout hit an intermediate wait
  timeout, but follow-up rollout status passed for all five Allegro deployments;
  final completion requires the handoff to verify pushed `main` and live image
  tags agree.
- No live central order forwarding command was run.
- No Warehouse, Catalog, BizBox, Allegro write, payment/refund, shipment, label, or fulfillment write-back path was run.
- `orders.create.v1` duplicate/equality behavior is confirmed by orders-microservice source inspection and verification scripts. No live central forwarding command was run.

## Orders-Microservice Duplicate/Equality Confirmation Addendum

Date: 2026-06-29

### Confirmed contract

- Orders treats `contractVersion=orders.create.v1`, `channel`, `channelAccountId`, and `externalOrderId` as the create-order idempotency contract.
- Runtime duplicate lookup uses persisted `channel`, `channelAccountId`, and `externalOrderId` after API contract-version validation.
- Exact same-key replay returns the existing canonical order with existing item rows.
- Mismatched same-key replay raises HTTP 409 Conflict before insert, event publish, Warehouse handoff, or other duplicate side effects.
- Allegro shared `OrderClientService` sends `contractVersion: CREATE_ORDER_CONTRACT_VERSION`, normalizes `channelAccountId`, posts to orders API route /api/orders, and preserves `ORDER_IDEMPOTENCY_CONFLICT` as conflict semantics.

### Evidence

- `orders-microservice`: `npm run build`: PASS.
- `orders-microservice`: `npm run verify:idempotency-contract`: PASS.
- `orders-microservice`: `npm run verify:duplicate-order-protection`: PASS.
- `orders-microservice`: `npm run verify:channel-adapter-idempotency`: FAIL outside this Allegro slice because the broad cross-repo script failed on `flipflop-service order client missing: default`; Allegro order client includes the required contract/version/default/conflict markers.
- `allegro-service`: `npx ts-node services/allegro-service/src/allegro/orders/order-forwarding.mapper.spec.ts`: PASS.
- `allegro-service`: `npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`: PASS.
- `allegro-service`: `cd services/allegro-service && npm run build`: PASS.

### Boundaries

- No live central order forwarding command was run.
- No orders-microservice code or database state was changed.
- No Allegro deploy or live migration apply was run during the orders-microservice duplicate/equality verification; the Allegro migration and deployment happened later in the durable forwarding deployment step.

## 2026-06-30 Preview-Token Import Approval and Quantity Command Write-Back Evidence

- `POST /allegro/offers/import/approve` and
  `POST /allegro/offers/import/sales-center/approve` now require the preview
  token and previewed offer-id set returned by the matching preview route, in
  addition to the explicit Catalog apply confirmation.
- Added governed Allegro quantity command attempts with preview-token-bound
  prepare/confirm/execute/poll flow exposed by the new quantity command API endpoints.
- Added additive `AllegroQuantityCommandAttempt` schema and SQL migration file
  for durable idempotency, command id, target quantity, policy snapshot,
  failure context, and terminal status evidence. The migration was not applied
  to the live database in this pass.
- Warehouse remains physical stock owner. The quantity command path mutates
  Allegro only after preview-token confirmation; local offer quantity is updated
  only after command polling reports terminal success.
- Validation run on 2026-06-30:
  - `git diff --check`: PASS.
  - `LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef npx ts-node services/allegro-service/src/allegro/quantity-commands/quantity-commands.spec.ts`: PASS.
  - `cd services/allegro-service && LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef npm run build`: PASS.
  - `npm run ips:audit`: PASS.
  - `npm run ips:pre-coding`: PASS.
  - `npx prisma validate --schema prisma/schema.prisma`: PASS.
  - `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`: PASS.
- Deployment status: PASS on 2026-06-30. `./scripts/deploy.sh` completed successfully and rolled `allegro-service`, `allegro-api-gateway`, `allegro-settings`, `allegro-imports`, and `allegro-frontend`; final handoff must verify the live image tag against pushed `main` after evidence commits.
- Migration status: PASS on 2026-06-30. `/app/shared/node_modules/.bin/prisma migrate deploy --schema=/tmp/prisma/schema.prisma` ran inside the deployed `allegro-service` pod using runtime DB env, reported 10 migrations, and `migrate status` reported database schema up to date.
- Live table verification: PASS on 2026-06-30. Deployed Prisma client query `allegroQuantityCommandAttempt.count()` returned 0, confirming the table exists before live quantity commands.
- Live route verification: PASS on 2026-06-30. `https://allegro.alfares.cz/api/health` returned HTTP 200, `https://allegro.alfares.cz/` returned HTTP 200, and unauthenticated guarded routes for quantity commands and operations quantity-command attempts returned HTTP 401 `No token provided`.

## 2026-06-30 Authenticated Quantity Command Smoke Addendum

- Live image verification: PASS. Remote `main` is `268e845`, and Kubernetes deployments `allegro-service`, `allegro-api-gateway`, `allegro-settings`, `allegro-imports`, and `allegro-frontend` all run image tag `268e845` with ready/updated/available replicas at 1.
- Public route smoke: PASS. `https://allegro.alfares.cz/api/health` returned HTTP 200, `https://allegro.alfares.cz/` returned HTTP 200, and unauthenticated quantity-command routes returned HTTP 401.
- Authenticated quantity-command smoke: PASS. A short-lived runtime JWT was generated inside the deployed pod for the owner of an existing active offer. `POST /api/allegro/quantity-commands/prepare` returned HTTP 200 and status `PREPARED`; `POST /api/allegro/quantity-commands/:attemptId/confirm` returned HTTP 200 and status `QUEUED`.
- Mutation boundary: PASS. The smoke used target quantity equal to the current local quantity, did not call `execute`, did not call `confirm-and-execute`, did not call `poll`, did not create an Allegro command id, and did not perform a real Allegro quantity change. Preview tokens and JWT material were not printed or stored in validation artifacts.
- Recurring stock blocker closed: automatic Warehouse-driven Allegro quantity command execution is implemented for stock.updated and stock.out; live execution now happens from future Warehouse stock events without manual approval.

## 2026-06-30 Warehouse recurring stock policy addendum

Result: Pass. The missing recurring stock orchestration policy was converted into code for the Allegro adapter. Warehouse is the only sellable-stock source; `stock.updated` uses the Warehouse `available` quantity, and `stock.out` forces target quantity `0`. Each linked Allegro offer now gets a durable `AllegroQuantityCommandAttempt` with `approvalRequired=false`, `approvalMode=automatic_execute`, Warehouse policy snapshot, idempotency key, one-request-per-second default pacing, Allegro quantity command submit, polling, and terminal-state recording. Local Allegro projection is marked `PENDING` before the command and `SYNCED` only after successful terminal confirmation; failures mark the attempt failed and keep remediation context.

Boundary: this change implements the Allegro sales-channel adapter only. Bazos, FlipFlop, and other channel adapters still need to subscribe to the same Warehouse `stock.updated`/`stock.out` policy in their own services. No synthetic or live Warehouse stock event was published during validation, and no live Allegro quantity mutation was manually triggered outside future event processing.

Additional gate evidence:

- `git diff --check`: PASS on 2026-06-30 after automatic Warehouse stock-event sync implementation.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-30 after `shared/rabbitmq/stock-events.subscriber.ts` implementation.
