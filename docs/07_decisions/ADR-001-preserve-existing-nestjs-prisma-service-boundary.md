# ADR-001: Preserve Existing NestJS And Prisma Service Boundary

```yaml
id: ADR-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../06_architecture/ARCHITECTURE_OVERVIEW.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
downstream:
  - ../21_execution_plans/EP-TASK-001-apply-ips-baseline.md
related_adrs: []
```

## Context

The existing service is a production NestJS monorepo using Prisma and PostgreSQL, with separate API gateway, Allegro integration, import, settings, and frontend services.

## Decision

The IPS baseline preserves the existing NestJS, Prisma, PostgreSQL, Docker/Kubernetes, and microservice integration boundaries. Documentation gates are added without changing runtime architecture.

## Consequences

- IPS adoption is additive and should not alter production behavior.
- Future architecture changes require ADRs before implementation.
- Task plans must explicitly identify contract/schema, sensitive-data, and replay/determinism impacts.

## Validation

- Documentation-only IPS baseline does not modify source service code.
- `git diff --name-only` must show IPS docs/scripts/package metadata only for this task, excluding pre-existing unrelated Kubernetes modifications.
- IPS gates validate documentation structure and traceability.
