# EP-TASK-009: Public Client Landing And Dashboard Execution Plan

```yaml
id: EP-TASK-009
status: validated
source_task: ../11_tasks/TASK-009-public-client-landing-dashboard.md
owner: Project Owner
created: 2026-06-27
last_updated: 2026-06-29
completeness_level: validated
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-009-public-client-ui.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-009.md
```

## Metadata

- Source task: ../11_tasks/TASK-009-public-client-landing-dashboard.md
- Lifecycle state: live validated; TASK-009 implementation and deployment are complete, and this plan is retained as the auditable implementation record.
- Reference service: `/home/ssf/Documents/Github/bazos`

## Upstream Traceability

- Constitution: ../00_constitution/CONSTITUTION.md
- Vision: ../01_vision/VISION.md
- Business case: ../02_business_case/BUSINESS_CASE.md
- Roadmap: ../08_roadmap/ROADMAP.md
- Feature: ../10_features/FEAT-009-public-client-ui.md
- Goal impact: ../22_goal_impact/GOAL-IMPACT-TASK-009.md
- Task: ../11_tasks/TASK-009-public-client-landing-dashboard.md

## Goal Impact

Make the Allegro service visible and usable at `allegro.alfares.cz` for registered sellers, using Bazos as a proven reference while adapting the UX to Allegro marketplace terms, OAuth/account readiness, Catalog-owned products, and the governed Allegro publish lifecycle.

## Project Invariants

- ALG-INV-001: Catalog validation remains required before offer mutation.
- ALG-INV-002: Account-aware Allegro rate limits remain a backend/lifecycle control and must not be bypassed by UI.
- ALG-INV-004: UI, docs, validation, and screenshots must not expose OAuth tokens, secrets, raw production logs, or customer/order data.
- ALG-INV-005: Runtime ownership boundary changes require ADR; this task should consume existing contracts.
- ALG-INV-006: Maintain traceability before coding.
- ALG-INV-007: Collect validation evidence before closure.

## Sensitive-Data Handling

Classification: synthetic. Use synthetic product names and UI examples only. Do not record real token values, user identifiers, order payloads, account credentials, or raw logs.

## Contract Validation Plan

TASK-009 consumes existing Auth, Catalog product search, API gateway, and Allegro catalog-sell-action contracts. Validation must prove the public frontend routes, protected API route wiring, and guarded prepare/status/edit/confirm UI semantics without adding a new backend mutation contract.

## Replay/Determinism Plan

Public route smokes and frontend builds are deterministic. Publish-like UI actions must remain split into prepare, draft edit, status, and explicit confirm states so authenticated smoke tests can be repeated without autonomous publication or hidden state changes.

## Scope

1. Adapt Bazos landing structure to Allegro React landing page.
2. Adapt Bazos client catalog publishing flow to existing Allegro dashboard/products frontend.
3. Integrate runtime serving so `allegro.alfares.cz` serves frontend routes while preserving API and `/health`.
4. Validate frontend build, route behavior, and guarded publish UX.

## Non-Goals

- No direct publish bypass.
- No backend contract rewrite unless an existing dirty integration requires completion in a separate integration pass.
- No database mutations during validation beyond normal authenticated UI smoke if explicitly approved.
- No production secret disclosure or unrelated refactor.

## Files to Inspect

- `/home/ssf/Documents/Github/bazos/implementation-goals/GOAL-06-landing-admin-client-ui.md`
- `/home/ssf/Documents/Github/bazos/implementation-goals/GOAL-08-hosted-auth-ui.md`
- `/home/ssf/Documents/Github/bazos/implementation-goals/GOAL-12-client-catalog-publishing-flow.md`
- `services/frontend/src`
- `services/allegro-service/src/allegro/catalog-sell-action`
- `k8s/ingress.yaml`, `k8s/deployment.yaml`, `Dockerfile`, `services/frontend/Dockerfile`

## Files to Create

- `docs/10_features/FEAT-009-public-client-ui.md`
- `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`
- `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-009.md`
- `docs/12_validation/VAL-TASK-009-public-client-landing-dashboard.md`
- optional task-scoped validation evidence under `reports/validation/`

## Files to Modify

- `TASKS.md`
- `STATE.json`
- `services/frontend/src/pages/LandingPage.tsx`
- `services/frontend/src/pages/Dashboard.tsx`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`
- runtime routing/deployment files only in final integration if needed to serve frontend at `allegro.alfares.cz`.

## Files That Must Not Be Modified

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- Real production secret files or Vault-managed values
- Unrelated service modules
- Existing dirty backend files unless the integration owner explicitly classifies them as required TASK-009 contract completion.

## Parallel Execution

- Integration owner: original thread.
- Validation owner: original thread.
- Merge order: 1. IPS task scaffold; 2. landing lane; 3. dashboard lane; 4. integration/runtime route; 5. build and smoke validation; 6. commit/deploy only after validation.
- Shared contracts: Catalog product read contract, Allegro catalog-sell prepare/status/confirm contract, Auth JWT handling, frontend route model.

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-009-A | Ready now | Allegro landing lane | Convert Bazos landing story into Allegro-specific React landing page. | `services/frontend/src/pages/LandingPage.tsx`; optional page-local styles. | Dashboard, API client, backend, k8s. | Public landing with CTAs and guarded Allegro workflow messaging. | None. |
| TASK-009-B | Ready now | Client dashboard and Catalog publish lane | Add dashboard/product workflow for Catalog selection, draft preparation, status, edit, and explicit confirm where existing endpoints support it. | `services/frontend/src/pages/Dashboard.tsx`, `services/frontend/src/pages/ProductsPage.tsx`, `services/frontend/src/services/api.ts`, optional product-flow component. | Landing page, backend, k8s. | Customer dashboard flow and clear unsupported-state blockers. | Existing backend product-scoped endpoints may be incomplete or dirty. |
| TASK-009-C | Final integration | Runtime route and validation lane | Integrate worker outputs, decide frontend serving approach, build, smoke, and document evidence. | Task docs, validation docs, deployment/runtime files if needed. | Secrets, unrelated backend. | `allegro.alfares.cz` serves frontend and API health remains available. | Depends on A/B completion. |

## Implementation Steps

1. Create the IPS scaffold for FEAT-009, TASK-009, GOAL-IMPACT-TASK-009, this execution plan, validation, context, and coding-prompt traceability.
2. Implement the public Allegro landing route using the Bazos public-client pattern as reference while preserving Allegro-specific Catalog, OAuth, account, rate-limit, and guarded publish language.
3. Implement the authenticated dashboard and products workflow for Catalog product selection, draft preparation, status, draft edit, and explicit publish confirmation where existing backend endpoints support the flow.
4. Integrate frontend serving, API gateway routing, backend health routing, Kubernetes manifests, image build/push steps, and deploy-script rollout order so `https://allegro.alfares.cz` serves the frontend while `/api` and `/health` keep their intended owners.
5. Validate build, backend contract spec, Kubernetes dry-run, deploy rollout, endpoint readiness, public routes, protected API route wiring, and frontend bundle content; record evidence in the TASK-009 validation report.

## Test Plan

- `git diff --check`
- `cd services/frontend && npm run build`
- Route smoke for `/`, `/login`, `/register`, `/dashboard`, `/health`
- If authenticated smoke is available, verify product selection and guarded draft prepare/confirm UI states.

## Validation Plan

Validation succeeds when frontend build passes, route smokes prove public serving works, UI states preserve guarded publish semantics, sensitive-data constraints are intact, and unresolved blockers are recorded explicitly without fabricating missing contracts.

## Gate Commands

```bash
git diff --check
cd services/frontend && npm run build
curl -fsS https://allegro.alfares.cz/health
curl -I https://allegro.alfares.cz/
```

## Documentation Updates

- Update `docs/10_features/FEAT-009-public-client-ui.md`, `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`, `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md`, `docs/22_goal_impact/GOAL-IMPACT-TASK-009.md`, `docs/13_context_packages/CP-TASK-009-public-client-landing-dashboard.md`, `docs/14_prompts/PROMPT-TASK-009-public-client-landing-dashboard.md`, `docs/12_validation/VAL-TASK-009-public-client-landing-dashboard.md`, `graph/project_graph.example.yaml`, `TASKS.md`, and `STATE.json` when TASK-009 status or evidence changes.
- Keep deployment evidence synthetic and route/status focused; do not paste credentials, JWTs, OAuth tokens, customer data, raw orders, or raw production logs.

## Rollback Plan

Revert task-scoped frontend/runtime changes and restore previous ingress/deployment behavior. Do not remove unrelated pre-existing backend changes without owner approval.

## Agent Handoff Prompt

You are a TASK-009 worker for allegro-service. Preserve the chain Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation. Use Bazos as a UI and flow reference, but make the result Allegro-specific and preserve Catalog, Auth, OAuth, account, rate-limit, and confirmation boundaries. Work only in your assigned files and report blockers instead of editing shared contracts implicitly.

## Completion Checklist

- [ ] Implementation complete
- [ ] Tests complete
- [ ] Validation evidence collected
- [ ] Documentation updated
- [ ] Deviations documented
