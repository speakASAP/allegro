# Vision: allegro-service

```yaml
id: VISION-ALLEGRO-SERVICE
status: approved
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

## One-sentence vision
Keep the Allegro marketplace integration operational, truthful, and traceable across offer management, stock synchronization, and order-forwarding workflows.

## Problem statement
The repository must keep marketplace integration behavior and ecosystem boundaries explicit so the service can be governed without inventing unsupported runtime responsibilities.

## Target users
- marketplace operators
- catalog and warehouse teams
- orders and notifications consumers
- service owners responsible for production health and governance

## Core user need
The project needs a truthful, reviewable integration contract that preserves operational intent without overclaiming responsibility for unrelated domains.

## Key outcomes
- accurate marketplace synchronization and offer processing
- truthful event and service dependencies
- traceable validation and onboarding evidence

## Non-goals
- owning payment or invoice workflows
- storing order data as a local source of truth
- fabricating service responsibilities beyond the real integration boundary

## Success criteria
- the repo passes the IPS adoption validator
- stock.updated and order-forwarding contracts remain documented and valid
- project governance stays honest about repository ownership and runtime boundaries

## Approval
status: approved
Approved by: project owner
Approval evidence: owner-confirmation: allegro-onboarding-approved
