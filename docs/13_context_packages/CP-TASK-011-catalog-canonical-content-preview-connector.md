# CP-TASK-011: Catalog Canonical Content Preview Connector Context Package

## Target task

- TASK-011
- Task document: `docs/11_tasks/TASK-011-catalog-canonical-content-preview-connector.md`
- Feature: `docs/10_features/FEAT-011-catalog-canonical-content-preview-connector.md`
- Execution plan: `docs/21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md`
- Validation report: `docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
- `docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- `docs/10_features/FEAT-010-allegro-primary-channel-foundation.md`
- `docs/10_features/FEAT-011-catalog-canonical-content-preview-connector.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-011.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`

## Included documents

- `AGENTS.md`
- `AGENT_OPERATIONS.md`
- `TASKS.md`
- `STATE.json`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.controller.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.dto.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`

## Excluded documents

- Kubernetes/deployment secrets and environment files.
- Prisma schema or migrations.
- Live Allegro, Catalog, Warehouse, or customer payload exports.
- OffersService final publish payload except minimal local description
  pass-through if already present.

## Constraints

- Work only in `/home/ssf/Documents/Github/allegro` on `alfares`.
- Do not deploy.
- Do not change Allegro publish ownership.
- Do not run live publish, update, stock, import apply, or migration apply
  commands.
- Keep unavailable facts explicit in handoff text instead of inventing
  contracts, approvals, or implementation details.

## Agent prompt

Implement the bounded TASK-011 lane. Add the Catalog preview client method,
backend preview evidence/description fallback, ProductsPage preview rendering,
and preview-token confirmation body. Preserve the existing governed publish
lifecycle and record validation evidence.

## Validation instructions

- Run `git status --short --branch` before and after.
- Run `git diff --check`.
- Run `npm run ips:audit` and `npm run ips:pre-coding` when available.
- Run `npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`.
- Run `cd services/allegro-service && npm run build`.
- Run `cd services/frontend && npm run build`.
- Do not deploy.
