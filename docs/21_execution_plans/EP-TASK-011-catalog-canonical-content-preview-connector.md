# EP-TASK-011: Catalog Canonical Content Preview Connector Execution Plan

```yaml
id: EP-TASK-011
status: approved
source_task: ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md
owner: Allegro Integration Owner
created: 2026-06-30
last_updated: 2026-06-30
completeness_level: complete
constitution: ../00_constitution/CONSTITUTION.md
vision: ../01_vision/VISION.md
system: ../04_systems/SYS-001-allegro-marketplace-integration.md
feature: ../10_features/FEAT-011-catalog-canonical-content-preview-connector.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-011.md
```

## Metadata

- Source task: `../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md`
- Status: approved for bounded implementation.
- Integration owner: current thread.
- Validation owner: current thread.
- Deployment: explicitly out of scope.

## Upstream Traceability

- Vision: `../01_vision/VISION.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Feature: `../10_features/FEAT-011-catalog-canonical-content-preview-connector.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-011.md`
- Existing draft feature: `../10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- Primary channel foundation: `../10_features/FEAT-010-allegro-primary-channel-foundation.md`

## Goal Impact

This plan makes Catalog generated Allegro content visible and usable in the
Allegro draft workflow. It improves draft quality without weakening the existing
preview-token publish gate or moving final Allegro publish ownership to Catalog.

## Project Invariants

- Catalog owns canonical product/content source data.
- Allegro owns local draft preparation and governed publish attempts.
- Warehouse remains stock source of truth.
- No deploy, migration, secret, or Kubernetes edits are part of this lane.
- Validation evidence is required before closure.

## Sensitive-Data Handling

Classification: synthetic validation plus protected internal Catalog content.
Validation must not print service tokens, OAuth tokens, Authorization headers,
secret values, customer identifiers, or raw private production records.

## Contract Validation Plan

- Add `CatalogClientService.getProductContentPreview(productId, marketplace)`.
- Treat Catalog preview as optional evidence: failure to fetch preview should not
  bypass product loading or publish gates.
- For draft creation, use generated preview description only when
  `dto.description` is `undefined`; explicit request description wins.
- Include preview source evidence in prepare/status responses and local raw data.
- Confirm publish must send the prepare preview token back to the backend.

## Scope

- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/*`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`
- TASK-011 IPS artifacts and graph/repo-state files.

## Non-Goals

- No deploy.
- No live publish/update execution.
- No migration or schema change.
- No Kubernetes/secret/deployment edits.
- No final Allegro payload refactor outside existing local description storage.
- No change to Auth, Catalog, Warehouse, Orders, Payments, or Imports ownership.

## Files to Inspect

- `AGENTS.md`
- `AGENT_OPERATIONS.md`
- `TASKS.md`
- `STATE.json`
- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/*`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`

## Files to Create

- `docs/10_features/FEAT-011-catalog-canonical-content-preview-connector.md`
- `docs/11_tasks/TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/13_context_packages/CP-TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/14_prompts/PROMPT-TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-011.md`

## Files to Modify

- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`
- TASK-011 IPS artifacts, `TASKS.md`, `STATE.json`, and `graph/project_graph.example.yaml`.

## Files That Must Not Be Modified

- `deployment/k8s/secrets/**`
- Kubernetes manifests and deploy scripts unless owner separately approves.
- Prisma migrations and schema.
- `OffersService` final publish payload except minimal pass-through already
  present in existing local draft create/update paths.
- Sibling service repositories or databases.

## Implementation Steps

1. Confirm remote status is clean or inspect overlapping dirty files.
2. Add TASK-011 IPS spine and graph traceability.
3. Add Catalog client method for the protected content-preview endpoint.
4. Enrich catalog-sell-action product loading with optional Allegro content preview.
5. Use generated preview description only when the request omits description.
6. Expose preview evidence in prepare/status/update/confirm product responses.
7. Add synthetic catalog-sell-action spec coverage for generated and explicit
   descriptions.
8. Fix frontend confirm routes to send preview token in the request body.
9. Store prepare preview token client-side until confirmation and never render
   the raw token.
10. Render Catalog connector preview and source evidence in ProductsPage draft flow.
11. Run validation gates and update the validation report.

## Parallel Execution

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-011-W0 | Ready now | IPS spine | Create/update TASK-011 docs, graph, TASKS, STATE. | IPS docs, graph, state files | Runtime code until plan exists | Traceable task pack | None |
| TASK-011-W1 | Ready after W0 | Backend connector | Catalog client method and catalog-sell-action response/description fallback/spec. | shared client, catalog-sell-action files | publish lifecycle ownership, migrations, deploy files | Synthetic spec coverage | W0 |
| TASK-011-W2 | Ready after W1 | Frontend draft flow | ProductsPage/API token body and preview rendering. | ProductsPage, frontend API | unrelated routes/pages | Buildable UI | W1 response contract |
| TASK-011-W3 | Final integration | Validation report | Run gates and record evidence. | validation report | deploy | Closure evidence | W1/W2 complete |

No separate Codex threads are started for this lane because W1 and W2 share one
response contract and the allowed file set is small. Integration and validation
owners remain in this thread. Merge order: W0 -> W1 -> W2 -> W3.

## Test Plan

- `git diff --check`
- `npm run ips:audit`
- `npm run ips:pre-coding`
- `npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`
- `cd services/allegro-service && npm run build`
- `cd services/frontend && npm run build`

## Validation Plan

Validation succeeds when diff hygiene passes, IPS gates do not identify current
TASK-011 blockers, synthetic backend spec proves preview description behavior,
backend/frontend builds pass, and the report records that no deploy or live
mutation command ran.

## Gate Commands

```bash
git diff --check
npm run ips:audit
npm run ips:pre-coding
npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts
cd services/allegro-service && npm run build
cd services/frontend && npm run build
```

## Documentation Updates

- Add TASK-011 feature, task, context package, coding prompt, execution plan,
  goal-impact, and validation report artifacts.
- Update `TASKS.md`, `STATE.json`, and `graph/project_graph.example.yaml` so
  the new lane is discoverable by IPS tooling and future agents.
- Record final validation evidence in the validation report without adding
  secrets, raw tokens, or live customer payloads.

## Rollback Plan

Revert TASK-011 docs/state/graph changes, the Catalog client method,
catalog-sell-action preview integration/spec changes, and ProductsPage/API token
body/rendering changes. No runtime data rollback is required because this lane
must not deploy, apply migrations, or run live publish commands.

## Agent Handoff Prompt

Continue TASK-011 in `/home/ssf/Documents/Github/allegro` on `alfares`.
Preserve the allowed file boundaries, keep Allegro publish ownership unchanged,
do not deploy, and finish by running the gate commands and updating
`docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md`.

## Completion Checklist

- [x] Remote status inspected before edits.
- [x] IPS spine created for TASK-011.
- [x] Catalog client preview method added.
- [x] Backend prepare/status preview evidence and description fallback added.
- [x] ProductsPage/API preview-token and Catalog preview UI updated.
- [x] Targeted synthetic spec coverage added.
- [x] Required validation gates run or explicitly reported.
- [x] No deploy run.
