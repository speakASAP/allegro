# VAL-TASK-009: Public Client Landing And Dashboard Validation Report

```yaml
id: VAL-TASK-009
status: live_validated
source_task: ../11_tasks/TASK-009-public-client-landing-dashboard.md
execution_plan: ../21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md
created: 2026-06-27
last_updated: 2026-06-29
completeness_level: live_validated
sensitive_data_classification: synthetic
```

Validation id: VAL-TASK-009
Target: TASK-009
Date: 2026-06-27
Validator: integration owner

## Summary

Landing, dashboard, API gateway, frontend runtime manifests, and deploy integration are live validated on 2026-06-27. The final deployment runs `allegro-service`, `allegro-api-gateway`, and `allegro-frontend` from image tag `829b701`; ingress routes API prefix /api to API gateway, health route /health to backend, and root route / to frontend. Public smoke proves the landing, registration/login SPA routes, dashboard, dashboard products route, backend health, and API gateway health are reachable on `https://allegro.alfares.cz`.

## Upstream goal

TASK-009 supports FEAT-009 by making the Allegro service visible and usable for registered sellers while preserving Catalog validation and governed publish lifecycle controls.

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Public landing served at root route / | Pass | `curl -i https://allegro.alfares.cz/` returned `HTTP/2 200` and frontend HTML on 2026-06-27. |
| Registration/sign-in routes available | Pass | register route /register and login route /login returned `HTTP/2 200` frontend HTML; API route /api/auth/register returned API JSON through gateway. |
| Dashboard route available | Pass | dashboard route /dashboard and dashboard products route /dashboard/products returned `HTTP/2 200` frontend HTML. |
| Catalog product selection flow present | Source pass | `ProductsPage.tsx` uses API route /api/allegro/products, which Allegro backend maps through `CatalogClientService.searchProducts()`. |
| Guarded prepare/confirm semantics preserved | Source pass | UI separates prepare, draft edit, status, and explicit confirm; targeted `catalog-sell-action.spec.ts` passed. |
| Frontend build passes | Pass | `cd services/frontend && npm run build` passed on 2026-06-27. |
| Sensitive data excluded | Pass | Validation commands and docs used paths, status, and synthetic descriptions only; no token values were printed. |

## Gate evidence

- `git diff --check`: PASS on 2026-06-27.
- `cd services/frontend && npm run build`: PASS on 2026-06-27.
- `kubectl apply --dry-run=server -f k8s/api-gateway-deployment.yaml -f k8s/api-gateway-service.yaml -f k8s/frontend-deployment.yaml -f k8s/frontend-service.yaml -f k8s/ingress.yaml -n statex-apps`: PASS on 2026-06-27.
- `docker build -t localhost:5000/allegro-service:task009-validate .`: PASS on 2026-06-27.
- `docker build -f services/api-gateway/Dockerfile -t localhost:5000/allegro-api-gateway:task009-validate .`: PASS on 2026-06-27.
- `docker build -f services/frontend/Dockerfile --build-arg FRONTEND_API_URL=https://allegro.alfares.cz/api -t localhost:5000/allegro-frontend:task009-validate .`: PASS on 2026-06-27.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-27.
- `npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`: PASS on 2026-06-27 with `.env` loaded; shell emitted non-fatal warnings from non-shell-compatible `.env` lines before the spec PASS.
- `./scripts/deploy.sh`: PASS on 2026-06-27 after deploy hardening; final deployment image tag `829b701`.
- `kubectl -n statex-apps get deploy allegro-service allegro-api-gateway allegro-frontend`: PASS; all three deployments showed `ready=1 updated=1 available=1` with image tag `829b701`.
- `kubectl -n statex-apps get endpoints allegro-service allegro-api-gateway allegro-frontend`: PASS; endpoints existed for backend `:3403`, API gateway `:3411`, and frontend `:3410`.
- `curl -i https://allegro.alfares.cz/`: PASS; `HTTP/2 200` frontend HTML.
- `curl -i https://allegro.alfares.cz/login`: PASS; `HTTP/2 200` frontend HTML.
- `curl -i https://allegro.alfares.cz/register`: PASS; `HTTP/2 200` frontend HTML.
- `curl -i https://allegro.alfares.cz/dashboard`: PASS; `HTTP/2 200` frontend HTML.
- `curl -i https://allegro.alfares.cz/dashboard/products`: PASS; `HTTP/2 200` frontend HTML.
- `curl -i https://allegro.alfares.cz/health`: PASS; `HTTP/2 200` backend JSON.
- `curl -i https://allegro.alfares.cz/api/health`: PASS; `HTTP/2 200` API gateway JSON.
- `curl -i https://allegro.alfares.cz/api/allegro/products`: PASS for protected route wiring; returned `HTTP/2 401`, proving the gateway/backend route is present and auth-protected rather than missing or crashing.
- Frontend asset check: PASS; deployed JS bundle contains `Alfares Allegro`, `Allegro`, `Catalog`, and `Publish`; dashboard products navigation is owned by `services/frontend/src/App.tsx` and `services/frontend/src/pages/Dashboard.tsx`.
- `npm run ips:audit`: PASS on 2026-06-29 after TASK-009 IPS repair; strict audit reported 73 files checked, 0 files with issues, 0 findings, score 100/100.
- `npm run ips:pre-coding`: PASS on 2026-06-29 after TASK-009 IPS repair; report written to `reports/validation/ips-pre-coding-gate.json`.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-009`: PASS on 2026-06-29 after TASK-009 IPS repair; report written to `reports/validation/ips-deployment-readiness-gate.json`.

## Invariant evidence

- ALG-INV-001: Source pass. Product selection routes through Allegro backend `CatalogClientService`; publish preparation uses guarded catalog-sell action.
- ALG-INV-002: Source pass. UI does not implement rate-limit bypass; it delegates prepare/confirm to backend lifecycle endpoints.
- ALG-INV-004: Source pass. No secrets, OAuth tokens, raw logs, customer data, payment details, or raw order payloads were added to docs or UI examples.
- ALG-INV-006: Traceability scaffold exists before coding.
- ALG-INV-007: Source, deploy, route smoke, and IPS repair validation evidence are recorded.

## Sensitive-data scan evidence

Pass. TASK-009 validation used route names, HTTP statuses, build results, Kubernetes readiness status, and synthetic UI descriptions only. No OAuth token, client secret, Authorization header, customer identifier, payment detail, raw order payload, or raw production log was added to the validation artifact.

## Replay and determinism evidence

Pass. Public route smokes, frontend build, Kubernetes dry-run, image build, endpoint readiness checks, and protected-route 401 checks are repeatable without mutating seller data. The product publish UI keeps draft preparation and explicit confirmation as separate states so authenticated smoke can be repeated without autonomous publication.

## Issues Found

- Initial live state: root, login, and dashboard routes on `allegro.alfares.cz` returned backend 404 because ingress pointed directly to the backend service.
- Earlier TASK-009 deployment attempts temporarily produced public root route / 503 while ingress pointed to frontend without ready endpoints; deploy script now applies ingress only after successful rollouts.
- Earlier Kubernetes/container runtime delays were resolved enough for final rollout; final live state has ready pods and endpoints for all three services.
- Existing backend `catalog-sell-action` files were already dirty before TASK-009 integration; integration owner classified them as required completion work because the dashboard depends on product-scoped status, draft update, and confirm routes.

## Recommendation

TASK-009 can close from a deployment perspective. Remaining product behavior work should be opened as follow-up tasks only if owner wants deeper authenticated user-flow validation with real seller accounts and Catalog fixtures.

## Source Validation Notes

- Worker A implemented landing page only and reported frontend build plus targeted diff check passing.
- Worker B implemented dashboard/products/API helper flow and reported frontend build plus targeted diff check passing.
- Integration owner added API Gateway and frontend Kubernetes manifests plus deploy-script image build/push integration.
- Existing dirty backend `catalog-sell-action` changes were validated because the new dashboard depends on product-scoped status, draft update, and confirm routes.

## Deployment Status

Deployed and smoke validated. `https://allegro.alfares.cz/` serves the Allegro frontend; API prefix /api routes to API gateway; health route /health routes to backend. Runtime images are aligned to `829b701` on 2026-06-27.

## Traceability confirmation

TASK-009 remains aligned with FEAT-009, GOAL-IMPACT-TASK-009, EP-TASK-009, and the Allegro service vision because it converts the existing governed Catalog-to-Allegro contracts into a customer-visible landing and dashboard while preserving Catalog validation, Auth boundaries, OAuth/account readiness, rate-limit ownership, explicit publication confirmation, and sensitive-data restrictions.
