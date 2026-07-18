# TASK-003: Define Marketplace Policy Engine

```yaml
id: TASK-003
status: completed_for_implementation
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../10_features/FEAT-003-marketplace-policy-engine.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-003.md
execution_plan:
  - ../21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md
```

## Objective

Define and implement Allegro policy gates that evaluate whether an offer mutation is allowed, risky, or blocked before it reaches Allegro.

## Upstream Links

- [docs/08_roadmap/ROADMAP.md](../08_roadmap/ROADMAP.md)
- [docs/09_milestones/MS-002-revenue-orchestration-foundation.md](../09_milestones/MS-002-revenue-orchestration-foundation.md)
- [docs/10_features/FEAT-003-marketplace-policy-engine.md](../10_features/FEAT-003-marketplace-policy-engine.md)
- [docs/17_governance/PROJECT_INVARIANTS.md](../17_governance/PROJECT_INVARIANTS.md)

## Goal Impact

Policy gates increase earnings by helping more products become publish-ready while preventing failed listings, oversell, duplicate offers, missing compliance data, weak content, and margin-negative sales.

## Project Invariant Impact

Applies ALG-INV-001, ALG-INV-002, ALG-INV-004, ALG-INV-006, and ALG-INV-007.

## Sensitive-Data Classification

Classification: synthetic. Policy fixtures must use synthetic identifiers and redacted errors.

## Contract/Schema Impact

Likely creates policy DTOs and may persist policy snapshots. Cross-service contracts are read-only unless separately approved.

## Replay/Determinism Impact

Policy output must be deterministic for the same input snapshot.

## Scope

Catalog, OAuth/account, rate-limit, duplicate, category, attribute, media, stock, price/margin, delivery, payment, GPSR, and responsible-producer gates.

## Non-Goals

No AI generation, no direct publish, no payment/supplier writes.

## Acceptance Criteria

- [x] Policy result distinguishes blockers, warnings, and recommendations.
- [x] Every blocker has owner service and remediation guidance.
- [x] Policy output is reusable by lifecycle, catalog action, AI suggestions, and monitoring.
- [x] Tests cover synthetic passing and blocked products.

## Required Context

Roadmap, integrations, project invariants, catalog/warehouse/order clients, Allegro API service, Prisma schema.

## Validation Task

Policy unit tests, redaction scan, and integration-readiness review.

## Required Gates

Pre-coding gate, contract review, targeted tests, deployment-readiness gate.

## Execution Plan Requirement

This task must not be converted into a coding prompt until an approved execution plan exists.
