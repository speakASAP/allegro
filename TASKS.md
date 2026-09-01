---

# Tasks: allegro-service

## Backlog
<!-- Human-managed -->
Owner created TASK-009 runtime/UI implementation goal on 2026-06-27.

## Active

<!-- Coordinator-maintained -->

## Completed
<!-- Coordinator-append-only -->
- 2026-04-05 documentation-standard-applied
- 2026-06-13 revenue-roadmap-created: expanded IPS roadmap into MS-002 through MS-007 with features, tasks, execution plans, goal-impact records, integrations map, and tracked backlog.
- 2026-06-15 TASK-002-governed-publish-lifecycle-validated: lifecycle schema, publish/update attempts, guarded remote update routing, targeted spec, build, strict audit, pre-coding gate, and deployment-readiness gate passed.
- 2026-06-15 TASK-003-marketplace-policy-engine-validated: reusable read-only policy engine implemented, lifecycle integrated, targeted policy/lifecycle specs and build passed.
- 2026-06-19 TASK-004-catalog-sell-on-allegro-action-validated: catalog-facing prepare/confirm/status and bulk-planning contract implemented with draft reuse/creation, lifecycle-backed queueing, targeted spec, build, strict audit, pre-coding gate, and deployment-readiness gate passed.
- 2026-06-20 TASK-005-ai-offer-optimization-contract-validated: advisory ai-microservice contract, contract module/service/specs, review-state model, synthetic fixtures, redaction profile, build/spec validation, and IPS evidence completed without direct marketplace mutation.
- 2026-06-20 TASK-007-growth-analytics-contract-pack-validated: funnel taxonomy, leads/marketing envelope drafts, digest payload definitions, redaction/replay/versioning rules, integrated validation evidence, and repo-state updates completed without downstream runtime writes.
- 2026-06-20 TASK-008-operations-trust-plan-validated: queue/rate-limit planning, OAuth health signals, MinIO media contract gating, deployment smoke and rollback evidence, integrated validation report, and repo-state updates completed without runtime changes.
- 2026-06-21 TASK-006-stock order profit loop contract validated: stock-sync attempt, order reconciliation, read-only payment, supplier dry-run, and margin coverage contracts implemented with synthetic validation and no runtime writes.
- 2026-06-27 TASK 009 live validated: Allegro landing, registration/login SPA routes, dashboard/products, API gateway, backend health route, Catalog product selection endpoint wiring, and governed publish-flow backend routes deployed and smoke validated on allegro.alfares.cz.

- 2026-06-30 Task 010 allegro primary channel foundation validated: Warehouse-only recurring stock policy implemented for Allegro stock events; stock.updated/stock.out automatically execute governed Allegro quantity commands at one request per second, with zero quantity setting the Allegro offer quantity to 0.
- 2026-06-30 TASK-011 catalog canonical content preview connector validated: Catalog content previews feed local Allegro draft descriptions and ProductsPage evidence while publish confirmation remains preview-token-gated. Strict audit, pre-coding gate, targeted spec, backend build, frontend build, and diff check passed without deploy.

- 2026-07-02 TASK-011 Goal 25 manual review metadata adopted: catalog-sell-action now passes Catalog manual/stale/review metadata through preview responses and ProductsPage renders Manual override, Source changed, and Review required badges without changing publish confirmation behavior.
- 2026-07-02 TASK-011 Goal 25 manual review metadata deployed: Allegro services rolled out image 087eec8 after k3s recovery; /health and root SPA smoke returned HTTP 200 and frontend bundle contains Manual override, Source changed, and Review required markers.

## Project Completion Marker

- 2026-06-21: Project marked completed/frozen after TASK-006 validation.
- 2026-06-27: TASK-009 live validated and project returned to completed state after deploying the public Allegro landing and registered-client dashboard.
- 2026-06-30: TASK-011 implemented as a no-deploy connector lane for Catalog canonical content previews in draft preparation.

# Tasks

## Active

- complete IPS adoption profile for allegro-service

## Ready Next

- review marketplace integration drift and event-handling follow-ups
- confirm operational health evidence for the next governance review
- Confirm the repo status during the next governance review.

## Blocked

- no active blockers beyond requiring truthful project-owner approval evidence for onboarding

## Completed
- real repository intent documented in README, BUSINESS.md, and SYSTEM.md
- central adoption profile created and validated against the IPS planning gate
- architecture, invariants, and validation-debt artifacts aligned to the repo reality

## Handoff
- keep the final validation evidence and repo state in STATE.json and project validation artifacts
