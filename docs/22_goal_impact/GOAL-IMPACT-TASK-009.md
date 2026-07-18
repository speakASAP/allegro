# GOAL-IMPACT-TASK-009: Public Client Landing And Dashboard

```yaml
id: GOAL-IMPACT-TASK-009
artifact_type: task
artifact_id: TASK-009
artifact_path: ../11_tasks/TASK-009-public-client-landing-dashboard.md
primary_goal: Make Allegro service usable by registered sellers through a public landing and client dashboard.
secondary_goals:
  - Catalog-to-Allegro conversion
  - Auth-backed customer access
  - Guarded publish lifecycle visibility
impact_level: high
impact_description: Converts existing Allegro API contracts into a visible customer workflow that can increase marketplace listing throughput while preserving governance.
success_metric: Registered users can reach allegro.alfares.cz, open the dashboard, select Catalog products, prepare guarded Allegro drafts, and see explicit publish status or blockers.
upstream_links:
  - docs/10_features/FEAT-009-public-client-ui.md
downstream_links:
  - docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md
validation_method: Frontend build, route smoke, protected dashboard smoke, and product publish-flow evidence.
status: approved
```

## Explanation

The Allegro service already has Catalog sell-action contracts and a frontend codebase, but the live public domain currently returns backend 404 for `/`. This goal makes the service customer-visible by publishing a clear landing page and a dashboard workflow modeled after the Bazos client experience while preserving Allegro-specific policy, OAuth, account, rate-limit, and Catalog ownership constraints.

## Evidence

- Owner request on 2026-06-27 created the new goal after live verification showed `https://allegro.alfares.cz/` returned backend 404 while `https://catalog.alfares.cz` hosted the only usable Catalog UI.
- `bazos-service` provides a working reference for landing, Auth handoff, client workspace, and catalog-to-channel publishing.
- TASK-004 already established the Allegro Catalog sell-action prepare/confirm/status contract.

## Validation

Validation succeeds when the frontend is built, route smokes prove the public domain serves the landing/dashboard instead of backend 404, and the product publish workflow either works end-to-end with explicit confirmation or reports source-backed blockers without implying unsupported behavior.
