# Glossary

```yaml
id: GLOSSARY-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../BUSINESS.md
  - ../SYSTEM.md
downstream:
  - ./CORE_ENTITIES.md
related_adrs: []
```

## Purpose

Defines domain terms used by `allegro-service` documentation and implementation planning.

## Terms

| Term | Definition | Source |
|---|---|---|
| Allegro account | OAuth-backed marketplace account used for Allegro operations. | `../CLAUDE.md` |
| Offer | Marketplace listing managed through Allegro APIs and validated against catalog-microservice before mutation. | `../BUSINESS.md` |
| CSV import | BizBox-format CSV import and transformation workflow handled by import-service. | `../SYSTEM.md` |
| Stock update | `stock.updated` event consumed from warehouse-microservice to update Allegro quantities. | `../SYSTEM.md` |
| Order forwarding | Forwarding Allegro order data to orders-microservice without local order ownership. | `../BUSINESS.md` |
| OAuth token | Allegro access credential stored only through Vault, Kubernetes secrets, or approved local environment flow. | `../CLAUDE.md` |
| API gateway | Service on port 3411 that routes requests and handles auth boundary. | `../README.md` |
| settings-service | Service on port 3408 that manages user settings and OAuth tokens. | `../README.md` |
| frontend-service | Web UI on port 3410. | `../README.md` |

## Validation

Terms must remain consistent with `../BUSINESS.md`, `../SYSTEM.md`, and `../README.md`.
