# FEAT-010: Allegro Primary Channel Foundation

```yaml
id: FEAT-010
status: planned
owner: Project Owner
created: 2026-06-29
last_updated: 2026-06-29
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
  - ../docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md
downstream:
  - ../11_tasks/TASK-010-allegro-primary-channel-foundation.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Make Allegro the primary Alfares sales channel through a reusable foundation for
guarded script execution, channel projections, sync runs, raw-payload evidence,
owner-gated write paths, and validation-ready import and export workflows.

## User Story

As an operator, I need Allegro imports, exports, order handoff, offer publishing,
stock synchronization planning, billing/payment visibility, and after-sale
visibility to use consistent preview/apply, idempotency, ownership, and audit
rules so Allegro can run at production scale without overwriting Catalog,
Warehouse, Orders, Payments, or Auth responsibilities.

## Acceptance Criteria

- Allegro import and export scripts share a common guard and run-summary framework.
- New Allegro sync/projection work has additive schema planning before data
  writes.
- Orders, offers, stock snapshots, billing, payments, returns, claims, invoices,
  issues, shipments, and fulfillment domains are mapped to owner-aware lanes.
- Warehouse stock apply remains blocked unless a Warehouse/stock orchestration
  owner approves the source and command semantics.
- Future channels can reuse the Allegro channel vocabulary rather than copying
  unsafe script behavior.

## Dependencies

- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `services/allegro-service/src/scripts/*`
- `prisma/schema.prisma`
- Warehouse, Catalog, Orders, Payments, Imports, Auth, API Gateway, and frontend
  public contracts.

## Traceability

- ../04_systems/SYS-001-allegro-marketplace-integration.md
- ../docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md
- ../docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md
- ../11_tasks/TASK-010-allegro-primary-channel-foundation.md

## Validation

Use strict documentation audit, pre-coding gate, task-scoped deployment
readiness where applicable, service build checks, dry-run script outputs, and
explicit no-mutation evidence. Known unrelated TASK-009 documentation debt must
be recorded separately and must not be used to excuse TASK-010 defects.
