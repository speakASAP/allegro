# GOAL-IMPACT-TASK-011: Catalog Canonical Content Preview Connector

```yaml
id: GOAL-IMPACT-TASK-011
artifact_type: task
artifact_id: TASK-011
artifact_path: ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md
primary_goal: Make Allegro draft preparation consume Catalog-owned canonical marketplace content
secondary_goals:
  - VG-REVENUE
  - VG-004
impact_level: high
impact_description: Allegro operators can review generated Catalog content in the draft flow while publish confirmation remains governed by Allegro preview tokens.
success_metric: Local Allegro drafts use Catalog generated Allegro descriptions by default, explicit overrides still win, preview source evidence is visible, and publish confirmation remains preview-token-gated.
upstream_links:
  - docs/10_features/FEAT-011-catalog-canonical-content-preview-connector.md
  - docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md
  - docs/10_features/FEAT-010-allegro-primary-channel-foundation.md
downstream_links:
  - docs/21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md
validation_method: Targeted catalog-sell-action synthetic spec, Allegro service build, frontend build, IPS gates, and diff hygiene.
status: approved
```

## Explanation

Catalog owns canonical product content. Allegro should use that generated
marketplace content during draft preparation instead of reimplementing content
selection locally. TASK-011 connects the protected Catalog preview endpoint to
Allegro draft prep and exposes source evidence to the operator before the
existing guarded publish confirmation step.

## Evidence

- Catalog contract provided by owner: `GET /api/products/:productId/content-previews/:marketplace` returns generated content and source evidence.
- Existing `CatalogSellActionService` already owns local draft preparation and
  publish lifecycle preparation.
- Existing ProductsPage already owns product-scoped draft review and publish
  confirmation UI.

## Validation

Impact is validated when synthetic tests prove generated preview descriptions
are used only when no explicit description is supplied, frontend build proves the
UI contract compiles, and no deployment or live publish command is run.
