# TASK-009: Public Client Landing And Dashboard

```yaml
id: TASK-009
status: approved
owner: Project Owner
created: 2026-06-27
last_updated: 2026-06-29
completeness_level: complete
upstream:
  - ../10_features/FEAT-009-public-client-ui.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-009.md
execution_plan:
  - ../21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md
```

## Objective

Create a public Allegro landing page and an authenticated customer dashboard comparable to the current Bazos service client UI, adapted for Allegro and connected to Catalog microservice product selection and governed Allegro draft/publish actions.

## Upstream Links

- [docs/08_roadmap/ROADMAP.md](../08_roadmap/ROADMAP.md)
- [docs/09_milestones/MS-003-catalog-to-allegro-conversion-engine.md](../09_milestones/MS-003-catalog-to-allegro-conversion-engine.md)
- [docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md](../10_features/FEAT-004-catalog-sell-on-allegro-action.md)
- [docs/10_features/FEAT-009-public-client-ui.md](../10_features/FEAT-009-public-client-ui.md)
- [docs/17_governance/PROJECT_INVARIANTS.md](../17_governance/PROJECT_INVARIANTS.md)

## Goal Impact

This task turns the existing Allegro service from an API-only or internal operator surface into a customer-visible product. It should reduce friction for registered sellers by making Catalog-to-Allegro publishing discoverable and usable from `allegro.alfares.cz`.

## Project Invariant Impact

Applies ALG-INV-001, ALG-INV-002, ALG-INV-004, ALG-INV-006, and ALG-INV-007. The UI must not bypass Catalog validation, account-aware rate limits, OAuth readiness, sensitive-data handling, traceability, or validation evidence.

## Sensitive-Data Classification

Classification: synthetic. UI examples, docs, validation reports, screenshots, and tests must not include OAuth tokens, client secrets, Authorization headers, raw production logs, customer identifiers, payment details, or raw order payloads.

## Contract/Schema Impact

This task consumes existing Catalog and Allegro sell-action contracts. It may add frontend client helpers for product-scoped status, draft edit, and explicit confirm endpoints if those endpoints already exist. It must not introduce a new backend contract without a follow-up task or integration-owner approval.

## Replay/Determinism Impact

Publish-like actions remain idempotent through the existing governed lifecycle. UI actions must keep prepare, edit, confirm, and status states explicit enough for repeated smoke tests.

## Scope

- Public Allegro landing page at `/`.
- Authenticated dashboard/client workspace.
- Catalog product selection and guarded `Sell on Allegro` draft preparation.
- Explicit confirm publish controls when supported by existing backend endpoints.
- Runtime serving path for frontend on `allegro.alfares.cz`.
- Goal-driven documentation, validation evidence, and deployment-readiness notes.

## Non-Goals

- No autonomous publishing.
- No bypass of policy, OAuth, account readiness, Catalog validation, or Allegro rate limits.
- No production secret changes unless deployment integration proves a documented runtime variable is missing.
- No destructive product, offer, order, or database operations.
- No unrelated backend refactors.

## Acceptance Criteria

- [ ] `https://allegro.alfares.cz/` serves the Allegro landing page.
- [ ] Landing page has Allegro-specific positioning and clear registration/sign-in/dashboard CTAs.
- [ ] `https://allegro.alfares.cz/dashboard` serves an authenticated client dashboard shell.
- [ ] Dashboard product workflow can select Catalog products and prepare an Allegro draft or report a clear unsupported-state blocker.
- [ ] Explicit publish confirmation remains separate from draft preparation.
- [ ] Frontend build passes.
- [ ] Validation report records live route evidence, build evidence, and any remaining blockers.

## Required Context

- External `bazos-service` reference docs: GOAL-06 landing/admin/client UI, GOAL-08 hosted auth UI, and GOAL-12 client catalog publishing flow on the alfares host. These are intentionally external reference artifacts, not local IPS paths in this repository.
- Allegro frontend: `services/frontend/src`
- Allegro sell-action backend: `services/allegro-service/src/allegro/catalog-sell-action`
- Catalog microservice protected product flow

## Validation Task

Run frontend build and targeted diff checks. After integration and deploy approval, smoke public `/`, `/login`, `/register`, `/dashboard`, `/health`, and the product publish UI path.

## Required Gates

- Pre-coding traceability gate through this task and execution plan.
- Sensitive-data scan for UI/docs.
- Frontend build.
- Deployment-readiness and route smoke before closure.

## Execution Plan Requirement

This task is approved for coding through [EP-TASK-009](../21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md). Sub-agents must preserve disjoint file ownership and report blockers instead of changing contracts implicitly.
