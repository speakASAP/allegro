# SYS-001: Allegro Marketplace Integration

```yaml
id: SYS-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
  - ../02_business_case/BUSINESS_CASE.md
downstream:
  - ../05_subsystems/SUB-001-allegro-offer-order-stock-flow.md
  - ../10_features/FEAT-001-ips-governed-allegro-delivery.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Purpose

Provide the production Allegro marketplace integration for offer management, CSV import/transformation, order forwarding, stock synchronization, and OAuth-backed multi-account operation.

## Responsibilities

- Route authenticated marketplace workflows through API gateway and service modules.
- Integrate with Allegro REST API and OAuth2.
- Validate offer mutations against catalog-microservice.
- Consume warehouse `stock.updated` events for stock synchronization.
- Forward orders to orders-microservice.
- Preserve logs, notifications, and auth integration boundaries.

## Non-responsibilities

- Owning product master data.
- Owning stock source-of-truth data.
- Owning orders as the order system of record.
- Storing secrets outside approved secret-management flows.

## Inputs

- Operator requests through frontend/API gateway.
- BizBox CSV import data.
- Warehouse `stock.updated` events.
- Allegro OAuth credentials from approved secret/settings flow.
- Allegro API responses.

## Outputs

- Allegro offer API calls.
- Forwarded order payloads to orders-microservice.
- Stock quantity updates to Allegro offers.
- Logs and notifications through ecosystem services.

## Dependencies

- database-server:5432 PostgreSQL.
- auth-microservice:3370.
- catalog-microservice:3200.
- warehouse-microservice:3201.
- orders-microservice:3203.
- logging-microservice:3367.
- notifications-microservice:3368.
- Allegro REST API and OAuth2.

## Traceability

- Vision goals: VG-001, VG-002, VG-003, VG-004 in `../01_vision/VISION.md`.
- Business constraints: `../02_business_case/BUSINESS_CASE.md`.
- Feature: `../10_features/FEAT-001-ips-governed-allegro-delivery.md`.

## Validation

- Run `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`.
- Run `python3 scripts/pre_coding_gate.py --root .` before implementation tasks.
- Run `python3 scripts/deployment_readiness_gate.py --root .` before deployment or closure.
- Task-specific validation reports must confirm offer validation, order forwarding boundaries, sensitive-data handling, and rate-limit preservation when applicable.
