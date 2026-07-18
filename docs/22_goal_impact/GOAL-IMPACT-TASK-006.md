# GOAL-IMPACT-TASK-006: Stock Order Profit Loop

```yaml
id: GOAL-IMPACT-TASK-006
artifact_type: task
artifact_id: TASK-006
artifact_path: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
primary_goal: Increase profitable fulfilled Allegro orders
secondary_goals:
  - VG-003 order forwarding without local ownership
impact_level: high
impact_description: Connects operational signals that determine whether sales can be fulfilled profitably.
success_metric: Lower stock drift and order-forward failure rate; higher measurable margin coverage.
upstream_links:
  - docs/10_features/FEAT-006-stock-order-profit-loop.md
downstream_links:
  - docs/21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md
validation_method: Contract review and synthetic replay tests.
status: draft
```

## Explanation

Revenue only matters if orders can be fulfilled and margins are understood.

## Evidence

Roadmap Stage 4 and current stock-event follow-up gaps.

## Validation

Validated by contract-safe implementation plans and later targeted tests.
