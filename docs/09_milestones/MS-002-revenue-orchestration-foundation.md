# MS-002: Revenue Orchestration Foundation

```yaml
id: MS-002
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
  - ../16_operations/INTEGRATIONS.md
  - ../17_governance/PROJECT_INVARIANTS.md
downstream:
  - ../10_features/FEAT-002-governed-publish-lifecycle.md
  - ../10_features/FEAT-003-marketplace-policy-engine.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Create the durable, observable execution foundation for all revenue-producing Allegro operations. Offer publishing, updating, stock sync, and order forwarding should move through traceable lifecycle records instead of disappearing into one-off direct service calls.

## Scope

- Durable publish/update attempt model and status lifecycle.
- Policy gate result model for catalog, OAuth, rate-limit, stock, price, category, media, delivery, payment, and GPSR readiness.
- Queue-compatible execution design with idempotency keys and account-aware pacing.
- Monitoring endpoints for blocked, stale, failed, and successful attempts.
- Initial notifications and logging event taxonomy.

## Dependencies

- Existing Prisma service boundary.
- Existing Allegro OAuth/account model.
- Existing catalog, warehouse, order, logging, notification, auth clients.
- Bazos guarded lifecycle pattern as reference, not as direct copy.

## Completion Criteria

- Every destructive Allegro offer operation has a documented policy/lifecycle path.
- Direct publish/update paths are either wrapped or explicitly marked legacy with a migration task.
- Operators can inspect blocked attempts and failure reasons.
- Validation covers schema, lifecycle transitions, idempotency, rate-limit behavior, and sensitive-data redaction.

## Validation

Run strict documentation audit, pre-coding gate, schema validation, targeted lifecycle tests, and deployment-readiness gate before production rollout.
