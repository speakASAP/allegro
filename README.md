# allegro-service

Multi-account Allegro marketplace integration — offer management, CSV import/transformation, order processing, stock sync.

**Production**: https://allegro.alfares.cz

## Architecture

5 NestJS services, shared PostgreSQL via database-server, Prisma ORM.

| Service | Port | Role |
|---------|------|------|
| API Gateway | 3411 | Routing + auth |
| allegro-service | 3403 | Allegro API integration |
| import-service | 3406 | CSV import + transformation |
| settings-service | 3408 | User settings + OAuth tokens |
| frontend-service | 3410 | Web UI |

**Integrations**: catalog-microservice (3200) · warehouse-microservice (3201) · orders-microservice (3203) · auth-microservice (3370) · logging-microservice (3367) · notifications-microservice (3368)

All secrets in Vault (`secret/prod/allegro-service`) and local `.env`.

## Quick Start

```bash
./scripts/deploy.sh
docker compose up -d          # or: npm run start:dev
```

See [docs/LOCAL_DEV_SETUP.md](docs/LOCAL_DEV_SETUP.md) for the full local dev checklist.

## Environment Variables

All vars defined in `.env.example`. Key groups:

| Group | Key vars |
|-------|----------|
| App | `NODE_ENV`, `DOMAIN`, `SERVICE_NAME` |
| DB | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Allegro OAuth | `ALLEGRO_CLIENT_ID`, `ALLEGRO_CLIENT_SECRET`, `ALLEGRO_REDIRECT_URI` |
| Allegro API | `ALLEGRO_API_URL`, `ALLEGRO_USE_SANDBOX` |
| Services | `AUTH_SERVICE_URL`, `CATALOG_SERVICE_URL`, `WAREHOUSE_SERVICE_URL`, `ORDER_SERVICE_URL`, `LOGGING_SERVICE_URL`, `NOTIFICATION_SERVICE_URL` |
| JWT | `JWT_SECRET` (must match auth-microservice) |
| Ports | `API_GATEWAY_PORT`, `ALLEGRO_SERVICE_PORT`, `IMPORT_SERVICE_PORT`, `ALLEGRO_SETTINGS_SERVICE_PORT`, `ALLEGRO_FRONTEND_SERVICE_PORT` |

## Deployment

```bash
# On production server
cd ~/nginx-microservice
./scripts/blue-green/deploy-smart.sh allegro-service
```

See [docs/OPS.md](docs/OPS.md) for log commands and known fixes.

## Key Constraints

- Never create/modify Allegro offers without validation against catalog-microservice
- Allegro API rate limit: max 1 req/s per account
- Orders forwarded to orders-microservice — not stored locally
- Timeouts indicate bad code, not network issues — check logs, don't increase timeouts

## Docs

| File | Topic |
|------|-------|
| [BUSINESS.md](BUSINESS.md) | Goals, SLA, consumers |
| [SYSTEM.md](SYSTEM.md) | Stack, integrations, current state |
| [docs/LOCAL_DEV_SETUP.md](docs/LOCAL_DEV_SETUP.md) | Local dev with Kubernetes service DNSs |
| [docs/OPS.md](docs/OPS.md) | Log commands, nginx fix |
| [docs/EVENT_POLLING.md](docs/EVENT_POLLING.md) | Allegro event polling |
| [docs/OAUTH_QUICK_REFERENCE.md](docs/OAUTH_QUICK_REFERENCE.md) | OAuth troubleshooting |
| [docs/MULTI_ACCOUNT_OFFERS_PLAN.md](docs/MULTI_ACCOUNT_OFFERS_PLAN.md) | Multi-account feature plan |
| [docs/MULTIPLATFORM_PLAN.md](docs/MULTIPLATFORM_PLAN.md) | Future multiplatform architecture |
| [scripts/MIGRATION_README.md](scripts/MIGRATION_README.md) | Product migration to catalog-microservice |

## Status
Status: active
Lifecycle: production
Repository focus: multi-account Allegro marketplace integration for offer management, CSV transformation, order processing, and stock synchronization.

## Documentation authority
This repository is the authoritative source for its runtime and marketplace integration intent. The shared intent-preservation-system repo remains the source of truth for IPS standards, templates, and validators.

## Capabilities
- auth: required — The marketplace integration requires service authentication and shared platform access.
- postgres: required — The service persists operational and marketplace state in the shared PostgreSQL platform.
- redis: not-applicable — No Redis-backed runtime is owned by this repo.
- logging: required — Logs are emitted to the shared logging microservice.
- notifications: required — Order and operational alerts flow through the shared notification platform.
- ai: not-applicable — No AI runtime is required for the marketplace integration boundary.
- payments: not-applicable — Payment capture is outside the project ownership boundary.
- catalog: required — Product and offer data are validated against the catalog service.
- orders: required — The service forwards orders to the orders service and keeps local ownership minimal.
- warehouse: required — stock.updated is consumed to keep offers synchronized with warehouse state.
- invoices: not-applicable — Invoice generation is outside this repo scope.
- object-storage: not-applicable — No object-storage runtime is owned here.
- event-bus: required — RabbitMQ messages drive stock synchronization and downstream operational updates.
- docs-rag: not-applicable — This repo does not own document retrieval flows.
- monitoring: required — Health and readiness checks are required in production.
- backups: not-applicable — Backup ownership is not part of this repository scope.

## Interfaces
- Repository: https://github.com/speakASAP/allegro.git
- Production domain: https://allegro.alfares.cz
- Shared services: auth-service, catalog-microservice, warehouse-microservice, orders-microservice, logging-microservice, notifications-microservice
- Runtime health contract: GET /health when a live service is present.

## Development
- The service is operated as a production marketplace integration with per-account automation and validation.
- Changes are gated by repository-local operational intent and the central IPS adoption validator.
- Validation runs from the repo root with the shared IPS guardrails.

## Configuration
- Runtime configuration is kept in repository-local config and platform environment settings.
- Secrets are managed via Vault and injected through the platform service configuration flow.

## Deployment
- This repo follows the standard Alfares service deployment and validation flow.
- Deployment and rollout health must remain aligned with the production marketplace environment.

## Health and observability
- Production health and readiness checks are mandatory for this runtime service.
- Event, log, and failure-mode evidence must remain truthful and traceable to the repository's real operational boundary.
