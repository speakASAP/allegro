# TASK-011: Catalog Canonical Content Preview Connector

```yaml
id: TASK-011
status: approved
owner: Allegro Integration Owner
created: 2026-06-30
last_updated: 2026-06-30
completeness_level: complete
upstream:
  - ../10_features/FEAT-011-catalog-canonical-content-preview-connector.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-011.md
execution_plan:
  - ../21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md
```

## Objective

Integrate Catalog canonical content connector previews into Allegro local draft
preparation without changing Allegro publish ownership. The lane adds the shared
Catalog client method, makes catalog-sell-action prepare/status expose preview
evidence, uses the generated Allegro description when the caller omits an
explicit description, fixes ProductsPage preview-token confirmation, and shows
the Catalog preview in the ProductsPage draft flow.

## Upstream Links

- [docs/04_systems/SYS-001-allegro-marketplace-integration.md](../04_systems/SYS-001-allegro-marketplace-integration.md)
- [docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md](../10_features/FEAT-004-catalog-sell-on-allegro-action.md)
- [docs/10_features/FEAT-010-allegro-primary-channel-foundation.md](../10_features/FEAT-010-allegro-primary-channel-foundation.md)
- [docs/10_features/FEAT-011-catalog-canonical-content-preview-connector.md](../10_features/FEAT-011-catalog-canonical-content-preview-connector.md)
- [docs/17_governance/PROJECT_INVARIANTS.md](../17_governance/PROJECT_INVARIANTS.md)

## Goal Impact

TASK-011 makes Allegro draft preparation consume Catalog-owned generated content
instead of duplicating description rules locally. It improves operator review
quality while preserving the existing fail-closed publish confirmation and
preview-token ownership in Allegro.

## Project Invariant Impact

- ALG-INV-001: Catalog remains the product/content source; Allegro consumes the
  protected preview and stores local draft evidence only.
- ALG-INV-002: No Allegro API write path or rate-limit behavior is changed.
- ALG-INV-003: Orders remain outside this lane.
- ALG-INV-004: No secrets, OAuth tokens, customer data, or raw production
  private identifiers may be added to docs, tests, logs, or reports.
- ALG-INV-005: Runtime service boundaries remain unchanged; no ADR is required.
- ALG-INV-006: Implementation must trace through IPS artifacts before closure.
- ALG-INV-007: Validation evidence must exist before task closure.

## Sensitive-Data Classification

Classification: synthetic plus Catalog product content handled through existing
protected service calls. Validation uses synthetic unit fixtures and build
evidence. Do not store tokens, Authorization headers, service credentials,
customer identifiers, screenshots, or raw private production data.

## Contract Impact

Additive client/backend/frontend contract:

- Catalog client adds `getProductContentPreview(productId, marketplace)`.
- `catalog-sell-action` prepare/status responses may include
  `catalogContentPreview` with content excerpt and source evidence.
- Local draft raw data records preview source evidence and whether the generated
  description was applied.
- Publish confirmation still requires the preview token returned by prepare.

## Scope

- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/*`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`
- TASK-011 IPS artifacts, `TASKS.md`, `STATE.json`, and graph traceability.

## Non-Goals

- No deploy.
- No Kubernetes, secret, or environment edits.
- No Prisma migrations.
- No change to Allegro final publish ownership.
- No live Allegro publish/update execution.
- No broad refactor outside the allowed files.

## Acceptance Criteria

- [ ] Catalog client can fetch protected content previews for `allegro`.
- [ ] Prepare creates local drafts with generated Allegro description when the
  request omits description.
- [ ] Explicit caller-provided description wins over generated preview content.
- [ ] Prepare/status responses expose Catalog preview source evidence.
- [ ] ProductsPage shows the Catalog connector preview and evidence in the draft
  flow.
- [ ] ProductsPage sends the prepare preview token when confirming publish.
- [ ] `git diff --check` passes.
- [ ] `npm run ips:audit` and `npm run ips:pre-coding` are run when available.
- [ ] Targeted catalog-sell-action spec/build pass.
- [ ] Frontend build passes because ProductsPage/API are changed.

## Required Context

- `AGENTS.md`
- `/home/ssf/.codex/AGENTS.md`
- `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- `AGENT_OPERATIONS.md`
- `TASKS.md`
- `STATE.json`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `services/allegro-service/src/allegro/catalog-sell-action/*`
- `shared/clients/catalog-client.service.ts`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`

## Parallel Execution

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-011-W0 | Ready now | IPS spine and repo-state integration | Create feature/task/goal-impact/context/execution-plan/prompt/validation/graph/TASKS/STATE artifacts. | IPS docs, graph, `TASKS.md`, `STATE.json` | Runtime code until plan exists | Complete traceability spine | None |
| TASK-011-W1 | Ready after W0 | Backend connector integration | Catalog client method and catalog-sell-action preview evidence/description fallback/spec. | shared Catalog client, catalog-sell-action files | publish lifecycle ownership, migrations, secrets | Additive backend contract and tests | W0 |
| TASK-011-W2 | Ready after W1 contract shape | ProductsPage draft flow integration | API confirm body, preview-token storage, Catalog preview rendering. | ProductsPage, frontend API service | unrelated pages/routes | Buildable UI consuming backend response | W1 response contract |
| TASK-011-W3 | Final integration | Validation evidence | Validation report and gate results | validation report | deploy files | Final evidence and no-deploy handoff | W1/W2 complete |

Integration owner: current thread.
Validation owner: current thread.
Merge order: W0, W1, W2, W3. Parallel code edits are intentionally not split
because backend response shape and ProductsPage rendering share one contract.

## Validation Task

Run the task-scoped gates listed in the execution plan, record exact results in
`docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md`, and
do not deploy.

## Execution Plan Requirement

Implementation must follow
`docs/21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md`
before code closure. Any deviation from the allowed file set, publish ownership
boundary, or no-deploy constraint must be documented in the validation report
before handoff. The validation owner must run the required gates and update
`docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md` with
the final command results.
