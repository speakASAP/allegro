# FEAT-004: Catalog Sell On Allegro Action

```yaml
id: FEAT-004
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-19
completeness_level: complete
upstream:
  - ../09_milestones/MS-003-catalog-to-allegro-conversion-engine.md
  - ../10_features/FEAT-002-governed-publish-lifecycle.md
  - ../10_features/FEAT-003-marketplace-policy-engine.md
downstream:
  - ../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md
related_adrs: []
```

## Goal

Expose a catalog-facing Allegro sell action that prepares drafts, evaluates readiness, requires confirmation, and queues publish attempts through Allegro guardrails.

## User Story

As a catalog user, I need to click Sell on Allegro for a product and receive draft details, readiness blockers, account/category choices, and a confirmable publish status without learning the internal Allegro service workflow.

## Acceptance Criteria

- Prepare endpoint creates or reuses a draft without publishing.
- Confirm endpoint queues publish only after policy gates allow it.
- Status endpoint returns attempt state, blockers, Allegro command state, and next action.
- Bulk prepare/publish respects account-level rate limits.
- Catalog remains product owner; Allegro stores channel state only.

## Dependencies

- MS-002 lifecycle and policy engine.
- Catalog product/pricing/media contracts.
- Warehouse stock data.
- Auth/RBAC for publish confirmation.

## Traceability

- ../09_milestones/MS-003-catalog-to-allegro-conversion-engine.md
- ../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md

## Validation

Contract tests, controller tests, policy integration tests, gateway smoke tests, and targeted catalog-sell-action validation all passed on 2026-06-19.
