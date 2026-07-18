# PROMPT-TASK-006: Stock Order Profit Loop Contract Coding Prompt

```yaml
id: PROMPT-TASK-006-stock-order-profit-loop
status: validated
source_task: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
execution_plan: ../21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md
context_package: ../13_context_packages/CP-TASK-006-stock-order-profit-loop.md
created: 2026-06-21
last_updated: 2026-06-21
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: owner_approved_external_contract_assumptions_2026-06-21
```

## Role

You are a worker agent for TASK-006 in allegro-service. Preserve warehouse stock ownership, orders-microservice order ownership, read-only-first payments, supplier dry-run boundaries, account-aware Allegro limits, OAuth secrecy, and the IPS traceability chain.

## Task

Implement and validate the stock order profit loop as a pure contract-first slice covering stock sync attempt envelopes, order-forward reconciliation identity, read-only payment lookup, supplier dry-run lookup, and coverage-based margin status without runtime writes.

## Context

Read before changing files:

- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-005-stock-order-profit-loop.md`
- `docs/10_features/FEAT-006-stock-order-profit-loop.md`
- `docs/11_tasks/TASK-006-plan-stock-order-profit-loop.md`
- `docs/21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-006.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/13_context_packages/CP-TASK-006-stock-order-profit-loop.md`
- `docs/12_validation/VAL-TASK-006-validation-report.md`
- `reports/validation/TASK-006-validation-evidence.md`

## Constraints

- Keep this slice pure and deterministic.
- Use synthetic fixtures and redacted examples only.
- Do not add production secrets, OAuth tokens, Authorization headers, raw customer data, raw order payloads, payment details, supplier secrets, or production logs.
- Do not change catalog, warehouse, order, payment, supplier, or Allegro runtime ownership boundaries.
- Do not add runtime controllers, workers, Prisma migrations, payment writes, supplier writes, direct Allegro stock mutation, or deploy changes in TASK-006.
- Do not deploy from this prompt.

## Acceptance criteria

- Stock drift produces a deterministic durable-attempt envelope with account-aware one-request-per-second limits.
- Stock-out can block for manual review instead of mutating Allegro.
- Order duplicate conflicts move to manual review and preserve orders-microservice ownership.
- Payment and supplier contracts are non-mutating.
- Margin coverage returns `UNKNOWN` when required economics are missing and only returns `PASS` or `WARNING` when inputs are complete.
- Validation evidence records targeted spec, build, IPS gates, synthetic-data scope, and deviations.

## Validation

Run and record:

```bash
LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef npx ts-node services/allegro-service/src/allegro/stock-order-profit-loop/stock-order-profit-loop.contract.spec.ts
cd services/allegro-service && npm run build
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-006
```
