# TASK-007: Plan Growth Analytics And Demand Loops

```yaml
id: TASK-007
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-20
completeness_level: complete
upstream:
  - ../10_features/FEAT-007-growth-analytics-and-demand-loops.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-007.md
execution_plan:
  - ../21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md
```

## Objective

Define growth event, leads, marketing, and digest contracts that turn Allegro operations into demand intelligence.

## Upstream Links

- [docs/08_roadmap/ROADMAP.md](../08_roadmap/ROADMAP.md)
- [docs/09_milestones/MS-006-growth-analytics-and-remarketing.md](../09_milestones/MS-006-growth-analytics-and-remarketing.md)
- [docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md](../10_features/FEAT-007-growth-analytics-and-demand-loops.md)
- [docs/16_operations/INTEGRATIONS.md](../16_operations/INTEGRATIONS.md)

## Goal Impact

This task helps the system earn more by identifying which products should be listed, improved, replenished, discounted, promoted, or removed.

## Project Invariant Impact

Applies ALG-INV-004, ALG-INV-006, and ALG-INV-007.

## Sensitive-Data Classification

Classification: synthetic. No raw customer identifiers, raw order records, or production logs in analytics examples.

## Contract/Schema Impact

Creates event contracts for logging, leads, marketing, and notifications.

## Replay/Determinism Impact

Growth events must be replay-safe and idempotent where consumed by leads or marketing systems.

## Scope

Funnel taxonomy, demand signals, segment definitions, digest payloads, redaction policy, and event versioning.

## Non-Goals

No production writes to leads/marketing until contracts are validated. No customer PII exports.

## Acceptance Criteria

- [x] Funnel event taxonomy is versioned.
- [x] Leads and marketing events have explicit schemas.
- [x] Digest metrics are defined from available data.
- [x] Redaction rules are testable.

## Required Context

Roadmap Stage 5, integrations document, logging service, notification service, sensitive data policy.

## Validation Task

Synthetic event contract tests and redaction scan.

## Required Gates

Pre-coding gate, contract validation, replay/idempotency review.

## Execution Plan Requirement

This task was approved for contract-first implementation by owner instruction on 2026-06-20 and is now implemented and validated without runtime leads, marketing, logging, or notification writes.
