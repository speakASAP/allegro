# GOAL-IMPACT-TASK-010: Allegro Primary Channel Foundation

```yaml
id: GOAL-IMPACT-TASK-010
artifact_type: task
artifact_id: TASK-010
artifact_path: ../11_tasks/TASK-010-allegro-primary-channel-foundation.md
primary_goal: Make Allegro the primary recoverable and governed Alfares sales channel
secondary_goals:
  - VG-REVENUE
  - VG-004
impact_level: critical
impact_description: Allegro data exchange research is converted into owner-gated implementation lanes for production use.
success_metric: Allegro import and export scripts plus projections can run through dry-run, preview, apply, idempotency, and validation gates without violating Catalog, Warehouse, Orders, Payments, Imports, or Auth ownership.
upstream_links:
  - docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md
  - docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md
  - docs/10_features/FEAT-010-allegro-primary-channel-foundation.md
downstream_links:
  - docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md
validation_method: IPS gates, script-framework validation, service build, dry-run no-mutation evidence, and task-scoped deployment readiness checks.
status: approved
```

## Explanation

Allegro is the highest-priority sales channel, but it cannot become the
source-of-truth service for products, stock, orders, payments, or identity.
TASK-010 creates the foundation that lets Allegro operate as the primary channel
adapter while preserving source ownership and creating reusable patterns for
future sales channels.

## Evidence

- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md` defines the current data
  structure, existing projections, and import and export boundaries.
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md` defines the
  phased roadmap and agent-ready implementation lanes.
- `services/allegro-service/src/scripts/*` contains the current guarded and
  unsafe script surfaces that must be normalized.
- `prisma/schema.prisma` contains the current Allegro projection baseline.

## Validation

Impact is validated when TASK-010 has a complete IPS spine, a safe first
implementation slice, no live mutation side effects, and recorded validation
evidence that distinguishes TASK-010 results from pre-existing TASK-009
documentation debt.
