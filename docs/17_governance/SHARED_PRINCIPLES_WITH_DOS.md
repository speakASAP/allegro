# Shared Principles With DOS

```yaml
id: SHARED-PRINCIPLES-WITH-DOS
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream:
  - ./AI_AGENT_RULES.md
related_adrs: []
```

## Purpose

Document cross-repository alignment boundaries when DOS patterns are referenced.

## Relationship

DOS is a reference project for compatible documentation and delivery patterns. DOS is not the source of truth for `allegro-service` or for this repository product intent.

## Shared Principles

- Preserve original intent.
- Keep traceability from goal to validation.
- Require bounded execution plans before code.
- Capture validation evidence before deployment or closure.
- Keep sensitive data out of prompts, examples, tests, and reports.

## Boundaries

`allegro-service` source of truth remains its approved documents in this repository. DOS patterns may inform workflow structure but must not override Allegro service constraints, business goals, or integration ownership.

## Validation

Cross-repository work must explicitly state when DOS alignment is in scope and must preserve the reference-project boundary.
