# CP-TASK-006: Stock Order Profit Loop Context Package

```yaml
id: CP-TASK-006
status: validated
source_task: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
execution_plan: ../21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md
coding_prompt: ../14_prompts/PROMPT-TASK-006-stock-order-profit-loop.md
created: 2026-06-21
last_updated: 2026-06-21
completeness_level: complete
sensitive_data_classification: synthetic
```

## Target task

TASK-006: `../11_tasks/TASK-006-plan-stock-order-profit-loop.md` - define and validate stock sync attempt, order reconciliation, read-only payment, supplier dry-run, and margin coverage contracts for profitable Allegro fulfillment.

## Upstream traceability

- Roadmap: `../08_roadmap/ROADMAP.md`
- Milestone: `../09_milestones/MS-005-stock-order-profit-loop.md`
- Feature: `../10_features/FEAT-006-stock-order-profit-loop.md`
- Task: `../11_tasks/TASK-006-plan-stock-order-profit-loop.md`
- Execution plan: `../21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-006.md`
- Integrations: `../16_operations/INTEGRATIONS.md`
- Validation report: `../12_validation/VAL-TASK-006-validation-report.md`
- Coding prompt: `../14_prompts/PROMPT-TASK-006-stock-order-profit-loop.md`

## Included documents

- `../08_roadmap/ROADMAP.md`
- `../09_milestones/MS-005-stock-order-profit-loop.md`
- `../10_features/FEAT-006-stock-order-profit-loop.md`
- `../11_tasks/TASK-006-plan-stock-order-profit-loop.md`
- `../21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-006.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `../16_operations/INTEGRATIONS.md`
- `../12_validation/VAL-TASK-006-validation-report.md`
- `../reports/validation/TASK-006-validation-evidence.md`
- `../14_prompts/PROMPT-TASK-006-stock-order-profit-loop.md`

## Excluded documents

- Protected constitution and vision source text beyond traceability references.
- Raw production marketplace payloads, OAuth tokens, secrets, customer data, order data, payment details, supplier secrets, and production logs.
- Runtime queue-worker, controller, Prisma migration, deploy, payment-write, supplier-write, and direct Allegro stock-mutation implementation files because TASK-006 closes as a contract-first slice.

## Constraints

- Warehouse remains stock owner; Allegro stock changes require durable, idempotent, account-rate-limited attempt envelopes before any future mutation path.
- Orders-microservice remains order owner; duplicate order conflicts require payload-equality review and manual review on mismatch.
- Payments-microservice is read-only for TASK-006; capture, refund, payout, and settlement writes are forbidden.
- Suppliers-microservice is dry-run/read-only for TASK-006; supplier purchase, reservation, decrement, and write operations are forbidden.
- Margin status is coverage-based and must return `UNKNOWN` when required economics inputs are missing.
- Use synthetic fixtures only and do not deploy from this context package.

## Agent prompt

Use `../14_prompts/PROMPT-TASK-006-stock-order-profit-loop.md` to implement or revise the pure contract-first artifacts only. Do not use it to add runtime workers, controllers, migrations, deploy changes, payment writes, supplier writes, or direct Allegro stock mutation.

## Validation instructions

Run the targeted TASK-006 contract spec, service build, IPS audit, pre-coding gate, and deployment-readiness gate for TASK-006. Record evidence in `../12_validation/VAL-TASK-006-validation-report.md` and `../reports/validation/TASK-006-validation-evidence.md`.
