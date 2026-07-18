# GOAL-IMPACT-TASK-004: Catalog Sell On Allegro Action

```yaml
id: GOAL-IMPACT-TASK-004
artifact_type: task
artifact_id: TASK-004
artifact_path: ../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md
primary_goal: Increase catalog-to-Allegro listing throughput
secondary_goals:
  - VG-001 multi-account marketplace operations
impact_level: high
impact_description: Converts catalog products into governed Allegro listing candidates with less manual work.
success_metric: Catalog-to-draft and draft-to-publish rates increase.
upstream_links:
  - docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md
downstream_links:
  - docs/21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md
validation_method: Contract, idempotency, policy, and gateway tests.
status: validated
```

## Explanation

A catalog action makes Allegro selling available where product data already lives, while the lifecycle and policy layers prevent unsafe direct posting.

## Evidence

Bazos `catalog sell-action` is the proven reference pattern.

## Validation

Validated on 2026-06-19 when synthetic catalog sell-action flows created or reused drafts, queued guarded publish attempts, and returned next-action status without bypassing policy gates.
