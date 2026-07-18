# FEAT-011: Catalog Canonical Content Preview Connector

```yaml
id: FEAT-011
status: planned
owner: Project Owner
created: 2026-06-30
last_updated: 2026-06-30
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
  - ../10_features/FEAT-004-catalog-sell-on-allegro-action.md
  - ../10_features/FEAT-010-allegro-primary-channel-foundation.md
downstream:
  - ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Use Catalog-owned canonical marketplace content previews inside Allegro draft
preparation so operators can review the generated Allegro description before the
governed publish confirmation step.

## User Story

As an Allegro operator, I need the product draft flow to show the Catalog
canonical Allegro preview, its source evidence, and warnings so local Allegro
drafts use the generated description unless I explicitly override it.

## Acceptance Criteria

- Allegro uses the protected Catalog content-preview connector for marketplace
  key `allegro`.
- Draft preparation uses the generated Catalog Allegro description when the
  request does not explicitly provide a description.
- Status and prepare responses expose preview evidence without moving final
  publish ownership out of Allegro publish lifecycle.
- ProductsPage renders the Catalog connector preview and source evidence in the
  draft flow.
- Preview-token confirmation remains required for publish confirmation.

## Dependencies

- Catalog endpoint: `GET /api/products/:productId/content-previews/:marketplace`.
- Existing `CatalogSellActionService` draft lifecycle.
- Existing `PublishLifecycleService` preview-token confirmation contract.
- `services/frontend/src/pages/ProductsPage.tsx` product-scoped draft flow.

## Traceability

- ../04_systems/SYS-001-allegro-marketplace-integration.md
- ../10_features/FEAT-004-catalog-sell-on-allegro-action.md
- ../10_features/FEAT-010-allegro-primary-channel-foundation.md
- ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md

## Validation

Use strict documentation audit, pre-coding gate, task-scoped deployment
readiness where applicable, service build checks, dry-run script outputs, and
explicit no-mutation evidence. Known unrelated TASK-009 documentation debt must
be recorded separately and must not be used to excuse TASK-011 defects.
