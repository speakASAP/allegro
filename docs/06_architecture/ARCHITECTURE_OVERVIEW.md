# Architecture Overview

```yaml
id: ARCHITECTURE-OVERVIEW-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../SYSTEM.md
  - ../README.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
downstream:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Summary

`allegro-service` is a NestJS and Prisma monorepo service set backed by PostgreSQL and integrated with Allegro REST API/OAuth2 plus Alfares ecosystem microservices.

## Runtime Services

| Service | Port | Role |
|---|---:|---|
| API Gateway | 3411 | Routing and auth boundary |
| allegro-service | 3403 | Allegro API integration |
| import-service | 3406 | CSV import and transformation |
| settings-service | 3408 | User settings and OAuth token flow |
| frontend-service | 3410 | Web UI |

## Integration Model

- catalog-microservice supplies product data validation.
- warehouse-microservice emits stock updates.
- orders-microservice receives forwarded orders.
- auth-microservice validates admin auth.
- logging and notifications microservices receive operational events.
- Vault and Kubernetes secrets hold production secrets.

## Constraints

- Allegro API rate limit: max 1 request per second per account.
- Offer mutation must be validated against catalog-microservice.
- Orders are not locally owned.
- OAuth tokens and secrets must not be hardcoded or exposed in IPS artifacts.

## Validation

Architecture-impacting changes require an ADR update and IPS gate evidence.
