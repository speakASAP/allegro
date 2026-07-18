# PROMPT-TASK-004: Catalog Sell On Allegro Action Coding Prompt

```yaml
id: PROMPT-TASK-004-catalog-sell-on-allegro-action
status: validated
source_task: ../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md
execution_plan: ../21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md
created: 2026-06-19
last_updated: 2026-06-19
completeness_level: validated
sensitive_data_classification: synthetic
```

## Role

You are a worker agent implementing TASK-004 for allegro-service. Preserve the existing NestJS and Prisma service boundary, catalog ownership, account-aware publish guardrails, OAuth secrecy, and IPS traceability chain.

## Task

Add a catalog-facing Sell on Allegro contract that creates or reuses a local draft, evaluates readiness through lifecycle and policy services, returns account/category context, and queues publish only after explicit confirmation.

## Context

Read before coding:

- `docs/08_roadmap/ROADMAP.md`
- `docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- `docs/11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md`
- `docs/21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-004.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/16_operations/INTEGRATIONS.md`
- `services/allegro-service/src/allegro/publish-lifecycle/`
- `services/allegro-service/src/allegro/policy/`
- `services/allegro-service/src/allegro/offers/`
- `services/allegro-service/src/allegro/products/`

## Constraints

- Use synthetic tests and fixtures only.
- Do not add production secrets, OAuth tokens, Authorization headers, raw customer data, raw order data, or raw logs.
- Do not change catalog, order, stock, payment, or supplier ownership boundaries.
- Do not publish directly from prepare; confirmation may queue but must not execute the publish command.
- Keep bulk operations rate-limit aware per account.
- Do not deploy from this prompt.

## Acceptance criteria

- Prepare creates or reuses a local draft without publishing.
- Confirm queues publish only after policy gates allow it.
- Status returns blockers and next action.
- Bulk operations respect account-level rate limits.
- Validation evidence records IPS gates, targeted tests, redaction/synthetic-data handling, and deviations.

## Validation

Run and record:

```bash
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
cd services/allegro-service && LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef npx ts-node src/allegro/catalog-sell-action/catalog-sell-action.spec.ts
python3 scripts/deployment_readiness_gate.py --root . --target TASK-004
```
