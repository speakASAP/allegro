# MS-005: Stock, Order, Payment, Supplier, And Profit Loop

```yaml
id: MS-005
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
  - ../16_operations/INTEGRATIONS.md
downstream:
  - ../10_features/FEAT-006-stock-order-profit-loop.md
related_adrs: []
```

## Goal

Connect stock, order, payment, supplier, and profit signals so Allegro prioritizes products that can be fulfilled profitably and exposes failures before they reduce revenue.

## Scope

- Complete warehouse event propagation to Allegro stock where policy allows.
- Order-forwarding retry, reconciliation, and operator visibility.
- SKU/catalog enrichment for forwarded orders.
- Read-only payments-microservice settlement/payment status contract.
- suppliers-microservice stock/cost/lead-time contract replacing placeholders.
- Margin and profitability flags for offers and orders.

## Dependencies

- orders-microservice `orders.create.v1` contract.
- warehouse stock event and API contracts.
- payments and suppliers contract discovery.
- Notification wiring for failures.

## Completion Criteria

- Stock drift and order-forwarding failures are observable and alertable.
- Payment and supplier integrations start read-only or dry-run until contracts are approved.
- Offer/order profitability can be calculated when required source data is available.

## Validation

Stock event tests, order idempotency tests, reconciliation tests, read-only contract tests, and notification redaction checks.
