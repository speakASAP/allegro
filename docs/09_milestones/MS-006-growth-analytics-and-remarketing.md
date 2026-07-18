# MS-006: Growth Analytics And Remarketing

```yaml
id: MS-006
status: planned
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../08_roadmap/ROADMAP.md
  - ../16_operations/INTEGRATIONS.md
downstream:
  - ../10_features/FEAT-007-growth-analytics-and-demand-loops.md
related_adrs: []
```

## Goal

Turn marketplace activity into growth signals for leads, marketing, catalog, and operators.

## Scope

- Structured revenue funnel events.
- leads-microservice event contract for demand and missed-sale signals.
- marketing-microservice segment contract for high-potential products, stale inventory, price-drop candidates, and remarketing opportunities.
- Daily and weekly channel performance digest.
- Product/channel performance feedback to catalog where contract exists.

## Dependencies

- Logging event taxonomy from MS-002.
- Leads and marketing contract discovery.
- Order, stock, publish, and margin data from earlier milestones.

## Completion Criteria

- The service can report which products list, sell, block, drift, and earn profit.
- Growth events are redacted, versioned, and replay-safe.
- Marketing and leads integrations are contract-tested before production writes.

## Validation

Synthetic event tests, redaction scans, contract validation, and digest rendering tests.
