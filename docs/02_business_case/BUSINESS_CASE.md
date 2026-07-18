# Business Case: allegro-service

```yaml
id: BUSINESS-CASE-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../BUSINESS.md
  - ../01_vision/VISION.md
downstream:
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Problem

Marketplace operations need a dedicated Allegro integration that can manage offers, import CSV data, process marketplace order events, and synchronize stock while respecting ownership boundaries across catalog, warehouse, orders, auth, logging, and notification services.

## Users And Consumers

- Internal operators using the frontend service.
- flipflop-service as documented consumer for stock and order sync.
- catalog-microservice, warehouse-microservice, orders-microservice, auth-microservice, logging-microservice, and notifications-microservice as ecosystem dependencies.

## Value

The service centralizes Allegro marketplace integration while allowing product, stock, and order ownership to remain in their dedicated microservices.

## Success Metrics

- Production service remains available at `https://allegro.alfares.cz`.
- Stock updates are consumed from warehouse `stock.updated` events.
- Orders are forwarded to orders-microservice.
- Offer changes are validated against catalog-microservice.
- Allegro API usage respects max 1 request per second per account.

## Constraints

- Do not create or modify Allegro offers without catalog validation.
- Do not store orders locally as the source of truth.
- Do not hardcode OAuth tokens or secrets.
- Keep secrets in Vault, Kubernetes Secret, or approved local `.env` flow.
- Preserve the existing NestJS, PostgreSQL, and Prisma stack unless an ADR approves a change.

## Traceability

- Vision: `../01_vision/VISION.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Invariants: `../17_governance/PROJECT_INVARIANTS.md`

## Validation

Business alignment is validated by IPS gate reports and task validation reports under `../12_validation/`.
