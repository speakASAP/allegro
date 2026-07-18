# FEAT-006: Stock Order Profit Loop

```yaml
id: FEAT-006
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../09_milestones/MS-005-stock-order-profit-loop.md
downstream:
  - ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
related_adrs: []
```

## Goal

Close the loop between warehouse stock, Allegro quantity, orders, payments, suppliers, and profit signals.

## User Story

As a business owner, I need Allegro to sell products that can be fulfilled profitably, detect stock/order drift quickly, and surface replenishment or margin problems before they cost money.

## Acceptance Criteria

- Stock updates can propagate to Allegro through governed, rate-limited execution.
- Order-forwarding failures are retried, reconciled, and visible.
- Payment/supplier integrations start with read-only or dry-run contracts.
- Profitability flags are computed where source data is available.

## Dependencies

- warehouse, orders, payments, suppliers contracts.
- Notifications and logging event taxonomy.

## Traceability

- ../09_milestones/MS-005-stock-order-profit-loop.md
- ../11_tasks/TASK-006-plan-stock-order-profit-loop.md

## Validation

Stock event tests, order idempotency/retry tests, read-only contract tests, and redaction scans.
