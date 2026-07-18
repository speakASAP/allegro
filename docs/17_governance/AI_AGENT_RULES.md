# AI Agent Rules

```yaml
id: AI-AGENT-RULES-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ./PROJECT_INVARIANTS.md
downstream:
  - ../21_execution_plans/EP-TASK-001-apply-ips-baseline.md
related_adrs: []
```

## Purpose

Define AI-agent behavior for `allegro-service` under IPS.

## Required Work Chain

Preserve:

```text
Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation
```

## Before Coding

Verify task, traceability, goal impact, execution plan, context package, validation criteria, invariants, sensitive-data classification, contract/schema impact, replay/determinism impact, and required gates.

## Forbidden Behavior

AI agents must not invent goals, skip validation, expose secrets, use production records in artifacts, alter protected vision/constitution files, bypass catalog validation, weaken rate limits, or turn the service into local owner of orders.

## Validation

Run IPS gates and report evidence in the final work summary.
