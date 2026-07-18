# VAL-TASK-011: Catalog Canonical Content Preview Connector Validation Report

```yaml
id: VAL-TASK-011
status: passed
source_task: ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md
execution_plan: ../21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md
created: 2026-06-30
last_updated: 2026-06-30
completeness_level: complete
sensitive_data_classification: synthetic
```

Validation id: VAL-TASK-011
Target: TASK-011
Date: 2026-06-30
Validator: AI agent

## Summary

TASK-011 integrates Catalog canonical Allegro content previews into local Allegro
draft preparation and ProductsPage draft review while preserving existing
preview-token publish ownership.

## Upstream goal

TASK-011 supports FEAT-011, GOAL-IMPACT-TASK-011, and the existing Catalog sell
action flow by consuming Catalog-owned generated content instead of duplicating
content generation in Allegro.

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Catalog preview client method exists | Pass | `CatalogClientService.getProductContentPreview(productId, marketplace)` calls `/api/products/:productId/content-previews/:marketplace` through existing protected request options. |
| Generated description is used only when caller omits description | Pass | Targeted `catalog-sell-action.spec.ts` covers omitted-description prepare and rawData evidence. |
| Explicit description wins | Pass | Targeted `catalog-sell-action.spec.ts` covers request description precedence over Catalog preview content. |
| Prepare/status expose preview evidence | Pass | Service response paths include `catalogContentPreview` and source evidence copied from local draft rawData. |
| ProductsPage sends preview token on confirm | Pass | Frontend API confirm calls now submit `{ previewToken }`; ProductsPage stores the prepare token outside rendered UI text. |
| ProductsPage renders Catalog preview evidence | Pass | ProductsPage draft flow renders title/text/source/warning evidence and a `Use preview` control. |
| No deploy or live publish command was run | Pass | Validation was limited to status, diff, IPS gates, targeted spec, and builds; `./scripts/deploy.sh` was not run. |

## Gate evidence

- `git diff --check`: PASS.
- `npm run ips:audit`: PASS after TASK-011 template section repair.
- `npm run ips:pre-coding`: PASS, report written to `reports/validation/ips-pre-coding-gate.json`.
- `npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`: PASS.
- `cd services/allegro-service && npm run build`: PASS.
- `cd services/frontend && npm run build`: PASS.

## Invariant evidence

- ALG-INV-001: PASS. Catalog remains product/content source; Allegro stores local draft evidence only.
- ALG-INV-002: PASS. No Allegro API write path, publish owner, or rate-limit behavior changed.
- ALG-INV-003: PASS. Orders are untouched.
- ALG-INV-004: PASS. No secrets, OAuth tokens, customer records, or raw private production data were added.
- ALG-INV-005: PASS. No new runtime service boundary or ADR-level ownership change.
- ALG-INV-006: PASS. Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation chain is represented.
- ALG-INV-007: PASS. Validation evidence is recorded in this report.

## Sensitive-data scan evidence

No raw tokens, service credentials, OAuth material, customer identifiers, or raw
private production data are recorded in TASK-011 docs or tests. The service spec
uses synthetic Catalog preview fixtures.

## Replay and determinism evidence

TASK-011 validation uses deterministic repository gates, TypeScript builds, and
synthetic catalog-sell-action unit fixtures. No live Allegro publish, import
apply, stock update, migration, or deploy command was executed.

## No-deploy evidence

No deploy command was run. TASK-011 remains a code and documentation change in
the remote repository awaiting owner review/deploy decision.

## Issues found

- Initial strict documentation audit failed because the new TASK-011 artifacts
  missed required template sections. The sections were added and the final audit
  gate was rerun.
- No runtime blocker remains for the bounded lane. Live end-to-end Catalog data
  verification is outside this no-deploy task.

## Recommendation

Accept TASK-011 for review. Deploy only after the owner chooses a release window
and verifies the Catalog content-preview endpoint is reachable in the target
environment.

## Traceability confirmation

TASK-011 traces to FEAT-011 and GOAL-IMPACT-TASK-011, preserves the Allegro
publish ownership boundary, and records implementation evidence through the
execution plan, coding prompt, code changes, targeted spec, builds, IPS gates,
and this validation report.

## 2026-07-02 Goal 25 Manual Review Metadata Continuation

Catalog Goal 25 added marketplace-field manual/stale propagation metadata. Allegro now consumes that metadata in the existing catalog-sell-action preview surface without changing publish ownership.

### Additional Criteria Checked

| Criterion | Result | Evidence |
|---|---|---|
| Manual/stale metadata passes through preview response | Pass | `catalogContentPreview` includes `manualOverride`, `stale`, `requiresManualReview`, `propagation.staleManualFields`, `profile.manualOverrides`, `profile.sourceState`, and normalized field review flags. |
| Local draft evidence records review metadata | Pass | Targeted `catalog-sell-action.spec.ts` asserts rawData `catalogSnapshot.contentPreview.requiresManualReview` and `propagation.staleManualFields`. |
| ProductsPage surfaces review state | Pass | Catalog connector preview renders Manual override, Source changed, and Review required badges plus stale field names. |
| Publish/queue behavior unchanged | Pass | No confirm, queue, publish lifecycle, executor, Allegro API, Orders, Warehouse, or payment behavior was changed. |

### Additional Validation Evidence

- `git diff --check`: PASS.
- `LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`: PASS.
- `cd services/allegro-service && LOGGING_SERVICE_URL=http://logging-microservice:3367 npm run build`: PASS.
- `cd services/frontend && npm run build`: PASS with existing Vite CJS/Browserslist/Baseline warnings only.


### Runtime Deploy Evidence

- `./scripts/deploy.sh`: built and applied Allegro images tagged `087eec8`; the first rollout wait was interrupted by a k3s datastore/runtime backlog.
- k3s recovery evidence: after owner restart, `kubectl get deployment allegro-service allegro-api-gateway allegro-frontend allegro-settings allegro-imports -n statex-apps -o wide` showed all five deployments ready with one replica available on `localhost:5000/allegro-*:087eec8`.
- `kubectl rollout status deployment/{allegro-service,allegro-api-gateway,allegro-frontend,allegro-settings,allegro-imports} -n statex-apps --timeout=120s`: PASS for all five deployments.
- `curl -i -sS -m 15 https://allegro.alfares.cz/health`: HTTP 200, `{"status":"ok","service":"allegro-service"}`.
- `curl -i -sS -m 15 https://allegro.alfares.cz/`: HTTP 200, SPA shell served.
- Frontend bundle smoke: deployed JS contains `Manual override`, `Source changed`, and `Review required` markers.

### Runtime Blocker Resolved

During deploy, the single-node k3s control plane reported `database is locked`, lease update timeouts, and EndpointSlice update timeouts; Allegro pods remained in `ContainerCreating` with empty endpoints. After the owner restarted k3s, the rollout recovered without additional code changes.

### Boundary Decision

This continuation is read/review metadata only. It does not disable confirm, change preview-token requirements, enqueue publish work, call external Allegro APIs, mutate Catalog, mutate Warehouse, mutate Orders, run migrations, print tokens, or deploy.
