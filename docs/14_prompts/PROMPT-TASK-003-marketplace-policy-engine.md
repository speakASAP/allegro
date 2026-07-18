# PROMPT-TASK-003: Marketplace Policy Engine Coding Prompt

```yaml
id: PROMPT-TASK-003-marketplace-policy-engine
status: validated
source_task: ../11_tasks/TASK-003-define-marketplace-policy-engine.md
execution_plan: ../21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
sensitive_data_classification: synthetic
```

## Role

You are a worker agent implementing TASK-003 for allegro-service. Preserve the existing NestJS and Prisma service boundary, catalog ownership, Allegro account-aware rate limits, OAuth secrecy, and IPS traceability chain.

## Task

Create a reusable Allegro marketplace policy engine that returns deterministic policy results for offer publish/update readiness. Results must distinguish blockers, warnings, and recommendations; each blocker must include owner service and remediation guidance.

## Context

Read before coding:

- `docs/08_roadmap/ROADMAP.md`
- `docs/10_features/FEAT-003-marketplace-policy-engine.md`
- `docs/11_tasks/TASK-003-define-marketplace-policy-engine.md`
- `docs/21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-003.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/16_operations/INTEGRATIONS.md`
- `services/allegro-service/src/allegro/publish-lifecycle/`
- `services/allegro-service/src/allegro/offers/`
- `services/allegro-service/src/allegro/dto/`

## Constraints

- Use synthetic tests and fixtures only.
- Do not add production secrets, OAuth tokens, Authorization headers, raw customer data, raw order data, or raw logs.
- Do not change catalog, order, stock, payment, or supplier ownership boundaries.
- Do not publish, update, reserve stock, create orders, or write payment/supplier state from the policy engine.
- Keep policy output deterministic for the same input snapshot.
- Do not deploy from this prompt.

## Acceptance criteria

- Policy result distinguishes blockers, warnings, and recommendations.
- Every blocker has owner service and remediation guidance.
- Policy output can be reused by lifecycle, catalog action, AI suggestions, and monitoring.
- Tests cover synthetic passing and blocked products.
- Validation evidence records IPS gates, targeted tests, redaction/synthetic-data handling, and deviations.

## Validation

Run and record:

```bash
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
cd services/allegro-service && npx ts-node src/allegro/policy/policy-engine.spec.ts
python3 scripts/deployment_readiness_gate.py --root . --target TASK-003
```
