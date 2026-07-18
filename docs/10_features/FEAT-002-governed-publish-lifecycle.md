# FEAT-002: Governed Publish Lifecycle

```yaml
id: FEAT-002
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../09_milestones/MS-002-revenue-orchestration-foundation.md
  - ../05_subsystems/SUB-001-allegro-offer-order-stock-flow.md
downstream:
  - ../11_tasks/TASK-002-design-governed-publish-lifecycle.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Replace direct, hard-to-observe Allegro offer mutations with a durable lifecycle for publish and update work.

## User Story

As an operator, I need every publish/update attempt to show who requested it, which catalog product and Allegro account it targets, which policy gates passed or blocked it, when it was queued/executed, and what Allegro returned, so I can safely grow listings and resolve failures.

## Acceptance Criteria

- Publish/update attempts have durable records with idempotency keys.
- Attempt statuses support prepared, blocked, confirmed, queued, running, succeeded, failed, cancelled, and stale states.
- Allegro command ids and task results are captured without secrets.
- Lifecycle records are queryable by product, offer, account, status, and time.
- Legacy direct paths are identified and routed through or blocked by the lifecycle.

## Dependencies

- Prisma schema migration.
- Allegro API command flow.
- Catalog and account references.
- Logging and notification services.

## Traceability

- ../09_milestones/MS-002-revenue-orchestration-foundation.md
- ../11_tasks/TASK-002-design-governed-publish-lifecycle.md

## Validation

Schema validation, service unit tests for state transitions, idempotency tests, and redaction review.
