# MS-003: Catalog-To-Allegro Conversion Engine

```yaml
id: MS-003
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
downstream:
  - ../10_features/FEAT-004-catalog-sell-on-allegro-action.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Increase the number of catalog products that can be safely listed on Allegro by giving catalog and operators a guided prepare, validate, confirm, and publish workflow.

## Scope

- Catalog-facing Sell on Allegro action contract.
- Offer draft generation from catalog product, pricing, media, stock, and attribute data.
- Readiness scoring with missing-data remediation instructions.
- Bulk prepare and publish planning with rate-limit and account capacity awareness.
- Status polling for publish attempts and policy blockers.

## Dependencies

- MS-002 lifecycle and policy foundation.
- catalog-microservice product/pricing/media contracts.
- warehouse-microservice stock availability.
- Allegro category and parameter APIs.

## Completion Criteria

- A catalog product can be prepared as an Allegro draft without publishing.
- Confirmation is required before queueing a publish operation.
- Policy blockers are returned as actionable fields for catalog/operator correction.
- Bulk operations cannot bypass rate limits, OAuth readiness, or catalog validation.

## Validation

Contract tests for catalog action DTOs, policy tests for readiness blockers, queue/idempotency tests, and smoke tests for gateway routing.
