# CP-TASK-009: Public Client Landing And Dashboard Context Package

## Target task

- TASK-009
- Task document: `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`
- Execution plan: `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md`
- Validation report: `docs/12_validation/VAL-TASK-009-public-client-landing-dashboard.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-003-catalog-to-allegro-conversion-engine.md`
- `docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- `docs/10_features/FEAT-009-public-client-ui.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-009.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Included documents

- `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`
- `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md`
- `docs/12_validation/VAL-TASK-009-public-client-landing-dashboard.md`
- `docs/10_features/FEAT-009-public-client-ui.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-009.md`
- `services/frontend/src/pages/LandingPage.tsx`
- `services/frontend/src/pages/Dashboard.tsx`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`
- `services/api-gateway/src/gateway/gateway.controller.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.controller.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts`
- `k8s/ingress.yaml`
- `k8s/api-gateway-deployment.yaml`
- `k8s/frontend-deployment.yaml`
- `scripts/deploy.sh`

## Excluded documents

- External Bazos reference files that live outside this repository
- Real secret files, Vault-managed values, `.env` material, OAuth tokens, JWTs, and Authorization headers
- Raw customer, payment, order, supplier, or production log payloads
- Runtime product, offer, order, stock, Warehouse, Catalog, or Allegro write operations outside the approved TASK-009 UI/runtime serving scope

## Constraints

- TASK-009 is live validated and closed as the public landing and registered-client dashboard implementation.
- The dashboard may expose existing guarded publish lifecycle controls, but it must not imply or implement autonomous publishing.
- Catalog validation, account readiness, OAuth readiness, backend rate-limit ownership, and explicit confirmation remain backend/lifecycle boundaries.
- Public route and protected API evidence must stay route/status oriented and synthetic.
- External Bazos artifacts are reference material only and must not be represented as local IPS paths.

## Agent prompt

If TASK-009 documentation is changed again, preserve the existing live-validated implementation record and keep all updates inside the FEAT-009 to TASK-009 to EP-TASK-009 to PROMPT-TASK-009 to code to VAL-TASK-009 chain. Do not introduce new runtime behavior from this preserved prompt; open a new bounded task for follow-up product behavior, Auth, Catalog, publish lifecycle, deployment, or smoke-test changes.

## Validation instructions

- Re-read `VAL-TASK-009-public-client-landing-dashboard.md` before changing TASK-009 status or evidence.
- Re-run `npm run ips:audit`, `npm run ips:pre-coding`, and `python3 scripts/deployment_readiness_gate.py --root . --target TASK-009` after TASK-009 documentation changes.
- For runtime changes, also run the affected frontend/backend build or targeted spec named by the new task.
