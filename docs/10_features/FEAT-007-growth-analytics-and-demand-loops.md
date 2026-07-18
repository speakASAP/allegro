# FEAT-007: Growth Analytics And Demand Loops

```yaml
id: FEAT-007
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../09_milestones/MS-006-growth-analytics-and-remarketing.md
downstream:
  - ../11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md
related_adrs: []
```

## Goal

Turn Allegro activity into growth signals for catalog, leads, marketing, and operators.

## User Story

As a growth manager, I need to know which products should be listed, improved, promoted, replenished, or removed so the Allegro channel earns more with less manual analysis.

## Acceptance Criteria

- Funnel events are structured and versioned.
- Lead and marketing event contracts are documented before production writes.
- Daily/weekly digests summarize revenue, blockers, stockouts, failed publishes, and opportunities.
- Sensitive data is excluded from analytics payloads.

## Dependencies

- Logging, leads, marketing, notifications contracts.
- Publish/order/stock/margin events.

## Traceability

- ../09_milestones/MS-006-growth-analytics-and-remarketing.md
- ../11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md

## Validation

Synthetic event contract tests, digest tests, redaction scans, and replay/idempotency checks.
