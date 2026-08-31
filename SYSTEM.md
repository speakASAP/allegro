# System: allegro-service

## Architecture

NestJS + PostgreSQL + Prisma. Allegro REST API + OAuth2.

- Offer CRUD, CSV import (BizBox format), order sync
- Multi-account support
- Subscribes to stock.updated via RabbitMQ

## Integrations

| Service | Usage |
|---------|-------|
| database-server:5432 | PostgreSQL |
| logging-microservice:3367 | Logs |
| auth-microservice:3370 | Admin auth |
| catalog-microservice:3200 | Product data |
| warehouse-microservice:3201 | Stock (RabbitMQ) |
| orders-microservice:3203 | Forward orders |
| notifications-microservice:3368 | Order alerts |

## Current State
<!-- AI-maintained -->
Stage: production

## Known Issues
<!-- AI-maintained -->
- None

# SYSTEM.md

completeness_level: complete

status: validated

## Purpose
The Allegro marketplace integration owns the offer-management, CSV-import, and stock-synchronization workflow for the Alfares ecosystem.

## Responsibilities
- integrate with the Allegro marketplace API and OAuth flow
- validate and transform product-offer payloads against catalog data
- consume stock.updated events from the shared event bus
- forward order events to the orders service without locally owning the order record
- emit operational and alert evidence through the platform services

## Non-responsibilities
- processing payment capture or invoice generation
- owning product master data beyond validation and synchronization contracts
- storing order records as a local source of truth

## Inputs
- catalog data and validation rules from catalog-microservice
- stock state events from warehouse-microservice
- order and operational data from the shared statex ecosystem
- OAuth and secret configuration for the Allegro account integration

## Outputs
- marketplace offer actions and CSV transformations
- order forwarding and operational event output
- log and notification evidence for production service health

## Dependencies
- auth-microservice for shared authentication boundaries
- catalog-microservice for validated product data
- warehouse-microservice for stock.updated events
- orders-microservice for order forwarding
- logging-microservice and notifications-microservice for operational evidence
- database-server for PostgreSQL persistence

## Upstream traceability
- the service is governed by the shared IPS adoption standard and project owner approval
- ecosystem contracts for shared services and RabbitMQ event consumption remain the authoritative integration source

## Downstream artifacts
- README, TASKS.md, STATE.json, and project validation records
- operational logs, alerts, and service health reports
- any marketplace-specific runtime documentation and operational procedure guides

## Validation criteria
- the central validator passes in planning mode
- the repo declares only its real runtime capabilities and dependencies
- no placeholder or invented contract remains in the adoption profile
- marketplace event contracts remain truthful about stock synchronization and order forwarding

## Open questions
- confirm any future expansion into additional marketplace accounts or offer formats as the service evolves
- review operational SLA and event-handling drift during the next governance check
