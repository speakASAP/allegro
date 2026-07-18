# Core Entities

```yaml
id: CORE-ENTITIES-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ./GLOSSARY.md
  - ../SYSTEM.md
downstream:
  - ../05_subsystems/SUB-001-allegro-offer-order-stock-flow.md
related_adrs: []
```

## Purpose

Captures the core business and integration entities that appear in `allegro-service` tasks and validation plans.

## Entities

| Entity | Owner | Notes |
|---|---|---|
| Offer | Allegro marketplace, validated by catalog-microservice before mutation | `allegro-service` must not mutate without catalog validation. |
| Product data | catalog-microservice | Used for offer validation and marketplace listing data. |
| Stock quantity | warehouse-microservice | Delivered through `stock.updated`; used to update Allegro quantities. |
| Order | orders-microservice | Allegro order data is forwarded; local storage is not the source of truth. |
| OAuth credential | settings-service / Vault / Kubernetes Secret | Must not appear in prompts, tests, logs, or reports. |
| Import row | import-service | CSV transformation input for offer workflows. |
| Operator session | auth-microservice | Access is authenticated through existing ecosystem auth. |

## Relationships

- Product data validates offer changes.
- Stock quantity updates marketplace offer quantity.
- Allegro orders flow to orders-microservice.
- OAuth credentials authorize Allegro API access and remain protected.

## Validation

Entity ownership must be checked in execution plans before changing contracts, schemas, or persistence behavior.
