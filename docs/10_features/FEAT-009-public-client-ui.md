# FEAT-009: Public Client UI

```yaml
id: FEAT-009
status: approved
owner: Project Owner
created: 2026-06-27
last_updated: 2026-06-27
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
  - ../09_milestones/MS-003-catalog-to-allegro-conversion-engine.md
downstream:
  - ../11_tasks/TASK-009-public-client-landing-dashboard.md
related_adrs: []
```

## Goal

Expose a public Allegro landing page and an authenticated client dashboard on `allegro.alfares.cz` so registered users can work with Catalog products and the guarded Allegro publish flow directly from the Allegro service.

## User Story

As a registered seller, I need a clear Allegro service landing page, Auth-backed access, and a client dashboard where I can choose Catalog products, prepare Allegro drafts, review policy/account/OAuth readiness, explicitly confirm publication, and monitor status without using internal-only tooling.

## Acceptance Criteria

- Public `/` explains the Allegro service and routes visitors to registration, sign-in, and the client workspace.
- Authenticated dashboard has customer-facing navigation for Catalog products, Allegro drafts/offers, orders, and account/OAuth settings.
- Product flow exposes guarded `Sell on Allegro` draft preparation from Catalog-owned product data.
- Publish confirmation remains explicit and uses the existing governed lifecycle; UI must not imply autonomous publishing.
- Runtime routing serves the frontend from `https://allegro.alfares.cz` instead of returning backend `Cannot GET /`.

## Dependencies

- Existing Allegro frontend under `services/frontend`.
- Existing Catalog sell-action contract from TASK-004.
- Catalog microservice product source and Auth-issued JWTs.
- Current Kubernetes ingress/deployment for `allegro.alfares.cz`.

## Traceability

- ../11_tasks/TASK-009-public-client-landing-dashboard.md
- ../21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md
- ../22_goal_impact/GOAL-IMPACT-TASK-009.md

## Validation

Frontend build, whitespace diff check, protected route smoke, public route smoke, and production URL verification after deployment.
