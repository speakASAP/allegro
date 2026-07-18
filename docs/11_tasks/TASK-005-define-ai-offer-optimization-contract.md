# TASK-005: Define AI Offer Optimization Contract

```yaml
id: TASK-005
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-20
completeness_level: complete
upstream:
  - ../10_features/FEAT-005-ai-assisted-offer-optimization.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-005.md
execution_plan:
  - ../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md
```

## Objective

Define the ai-microservice contract for offer suggestions without granting AI direct marketplace mutation authority.

## Upstream Links

- [docs/08_roadmap/ROADMAP.md](../08_roadmap/ROADMAP.md)
- [docs/09_milestones/MS-004-intelligent-offer-optimization.md](../09_milestones/MS-004-intelligent-offer-optimization.md)
- [docs/10_features/FEAT-005-ai-assisted-offer-optimization.md](../10_features/FEAT-005-ai-assisted-offer-optimization.md)
- [docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md](../23_documentation_contracts/SENSITIVE_DATA_POLICY.md)
- [docs/16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md](../16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md)

## Goal Impact

AI can raise conversion by improving titles, descriptions, attributes, categories, media recommendations, and price-test ideas, but only if suggestions stay governed and measurable.

## Project Invariant Impact

Applies ALG-INV-001, ALG-INV-002, ALG-INV-004, ALG-INV-005, ALG-INV-006, and ALG-INV-007.

## Sensitive-Data Classification

Classification: synthetic. Prompts and fixtures must avoid raw customer/order data, secrets, and production logs.

## Contract/Schema Impact

Defines the advisory ai-microservice request/response contract, redaction profile, review-state lifecycle, and local suggestion record design before any runtime DTO, Prisma, or worker implementation is approved.

## Replay/Determinism Impact

AI output is non-deterministic; persisted suggestions must include input snapshot hash, contract version, correlation id, model/version metadata if provided by the contract, and review status so later approval/apply flows stay replay-safe.

## Scope

Suggestion contract, redaction rules, review states, approval path, rollback notes, expected metrics, and synthetic fixtures.

## Non-Goals

No autonomous publish, no production prompt with raw sensitive data, no unreviewed price change, and no runtime ai-microservice client implementation in this task.

## Acceptance Criteria

- [x] Contract distinguishes suggestions from approved offer changes.
- [x] Redaction and data-minimization rules are documented.
- [x] Suggestions flow into lifecycle only after explicit approval.
- [x] Validation uses synthetic examples.

## Required Context

Roadmap Stage 3, FEAT-005, sensitive data policy, lifecycle and policy docs.

## Validation Task

Contract review, synthetic fixture review, redaction scan, IPS gates.

## Required Gates

Pre-coding gate, contract validation, deployment-readiness gate before runtime use.

## Execution Plan Requirement

This task was approved for contract-first implementation by owner instruction on 2026-06-20 and is now implemented and validated without runtime code changes.
