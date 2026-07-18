# Vision: allegro-service

```yaml
id: VISION-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../BUSINESS.md
  - ../SYSTEM.md
  - ../README.md
downstream:
  - ../02_business_case/BUSINESS_CASE.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

AI write access: Forbidden after this IPS baseline creation.

## Original Intent

`allegro-service` exists to provide multi-account Allegro marketplace integration for offer management, CSV import and transformation, order processing, and stock synchronization.

## Vision Goals

### VG-001 Multi-account marketplace operations

The service must support Allegro account operations for offers, OAuth-backed account access, and marketplace workflows through the existing NestJS service set.

### VG-002 Safe offer and stock synchronization

The service must validate offer changes against catalog-microservice and consume warehouse stock updates without bypassing catalog and warehouse ownership boundaries.

### VG-003 Order forwarding without local ownership

The service must forward received orders to orders-microservice and must not become the system of record for order data.

### VG-004 Operational production service

The production deployment at `https://allegro.alfares.cz` must remain observable, deployable, and aligned with the existing microservice ecosystem.

## Non-Goals

- Replacing catalog-microservice as product source of truth.
- Replacing warehouse-microservice as stock source of truth.
- Replacing orders-microservice as order owner.
- Bypassing Allegro API limits or OAuth token handling rules.
- Storing secrets outside Vault, Kubernetes secrets, or approved `.env` workflows.

## Success Criteria

- Offer mutations remain validated against catalog-microservice.
- Allegro API requests respect the documented limit of max 1 request per second per account.
- Orders are forwarded to orders-microservice and not stored locally as the order source of truth.
- Stock updates from warehouse events update Allegro quantities through controlled service logic.
- IPS tasks and execution plans include traceability, sensitive-data handling, invariant impact, and validation evidence.

## Source Evidence

This vision is derived from existing approved project documentation: `../BUSINESS.md`, `../SYSTEM.md`, `../README.md`, `../CLAUDE.md`, and `../STATE.json`.
