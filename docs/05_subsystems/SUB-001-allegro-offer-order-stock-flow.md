# SUB-001: Allegro Offer, Order, And Stock Flow

```yaml
id: SUB-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
  - ../03_domain_model/CORE_ENTITIES.md
downstream:
  - ../10_features/FEAT-001-ips-governed-allegro-delivery.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Purpose

Describe the operational flow that connects offer validation, stock updates, and order forwarding across the Allegro integration services.

## Responsibilities

- Keep offer mutations behind catalog validation.
- Keep stock updates event-driven from warehouse-microservice.
- Keep order handling as forwarding to orders-microservice.
- Keep OAuth/token handling within approved settings and secret flows.

## Interfaces

- HTTP routes through API gateway.
- Allegro REST/OAuth API calls.
- RabbitMQ stock events from warehouse-microservice.
- Service calls to catalog, orders, logging, auth, and notifications microservices.

## Dependencies

See `../04_systems/SYS-001-allegro-marketplace-integration.md`.

## Inputs

- CSV imports.
- Authenticated user actions.
- Stock events.
- Allegro order events/API responses.

## Outputs

- Allegro offer mutations after validation.
- Allegro stock quantity updates.
- Forwarded order data.
- Operational logs and notifications.

## Data Ownership

- Product data: catalog-microservice.
- Stock data: warehouse-microservice.
- Orders: orders-microservice.
- OAuth credentials: Vault/Kubernetes/settings flow.
- Allegro integration state: `allegro-service` database tables through Prisma.

## Failure Modes

- Catalog validation unavailable: block offer mutation rather than bypass validation.
- Allegro rate limit pressure: throttle rather than exceeding documented limit.
- Orders service unavailable: surface failure and retry according to implementation plan; do not silently store as source of truth.
- Secret unavailable: fail closed and avoid logging credential values.

## Validation

Execution plans touching this subsystem must include contract/schema impact, sensitive-data classification, and validation evidence for the affected integration boundary.
