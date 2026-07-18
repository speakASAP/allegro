# TASK-002: Design Governed Publish Lifecycle

```yaml
id: TASK-002
status: completed
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-15
completeness_level: complete
upstream:
  - ../10_features/FEAT-002-governed-publish-lifecycle.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-002.md
execution_plan:
  - ../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md
```

## Objective

Design and implement the first governed Allegro publish/update lifecycle so future revenue work has durable attempts, idempotency, policy evidence, monitoring, and safe execution gates.

## Upstream Links

- Roadmap: `../08_roadmap/ROADMAP.md`
- Milestone: `../09_milestones/MS-002-revenue-orchestration-foundation.md`
- Feature: `../10_features/FEAT-002-governed-publish-lifecycle.md`
- Invariants: `../17_governance/PROJECT_INVARIANTS.md`

## Goal Impact

This task directly supports higher revenue by increasing successful listings and reducing silent publish/update failures. It also protects the channel by forcing every destructive offer action through validation, idempotency, rate-limit, and observability controls.

## Project Invariant Impact

- ALG-INV-001: requires catalog validation before offer mutation.
- ALG-INV-002: requires account-aware rate-limit evidence.
- ALG-INV-004: must not expose OAuth tokens, secrets, or customer data in attempt records.
- ALG-INV-006: requires execution plan before coding.
- ALG-INV-007: requires validation evidence before closure.

## Sensitive-Data Classification

Classification: synthetic

Implementation and tests must use synthetic product, account, offer, command, and error identifiers. Attempt records may store redacted Allegro error codes and command ids, but not OAuth tokens, Authorization headers, raw customer records, or production order data.

## Contract/Schema Impact

Expected. This task likely creates Prisma models for publish attempts and policy snapshots, plus service/controller DTOs for prepare, confirm, status, and monitoring. Schema changes require migration review and rollback plan.

## Replay/Determinism Impact

High. Publish/update attempts must use idempotency keys and deterministic lifecycle transitions so retries do not duplicate Allegro mutations.

## Scope

- Add lifecycle model and status vocabulary.
- Add prepare/confirm/status service design.
- Add idempotency key rules.
- Add policy snapshot link or embedded snapshot field.
- Add monitoring query requirements.
- Identify legacy publish/update paths that must be wrapped.

## Non-Goals

- No AI recommendations.
- No marketing/leads integration.
- No payment/supplier production writes.
- No change to catalog product ownership.
- No autonomous publishing without confirmation and policy gates.

## Acceptance Criteria

- [x] Execution plan is reviewed before coding.
- [x] Schema design preserves catalog, order, stock, and OAuth ownership boundaries.
- [x] Publish lifecycle states are documented and tested.
- [x] Idempotency prevents duplicate publish/update attempts.
- [x] Attempt records include redacted failure and remediation context.
- [x] Validation evidence is captured under `docs/12_validation/` or `reports/validation/`.

## Required Context

- `../08_roadmap/ROADMAP.md`
- `../16_operations/INTEGRATIONS.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../10_features/FEAT-002-governed-publish-lifecycle.md`
- `../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md`
- `prisma/schema.prisma`
- `services/allegro-service/src/allegro/allegro-api.service.ts`
- `services/allegro-service/src/allegro/offers/`

## Validation Task

Validate schema, lifecycle transitions, idempotency behavior, redaction, and gateway/service smoke for the new lifecycle endpoints.

## Required Gates

- Strict documentation audit.
- Pre-coding gate.
- Schema/migration review.
- Targeted tests.
- Deployment-readiness gate.

## Execution Plan Requirement

This task must not be converted into a coding prompt until an approved execution plan exists.
