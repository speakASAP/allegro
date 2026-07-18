# PROMPT-TASK-002: Governed Publish Lifecycle Coding Prompt

```yaml
id: PROMPT-TASK-002-governed-publish-lifecycle
status: validated
source_task: ../11_tasks/TASK-002-design-governed-publish-lifecycle.md
execution_plan: ../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
sensitive_data_classification: synthetic
```

## Role

You are a worker agent implementing TASK-002 for allegro-service. Preserve the existing NestJS and Prisma service boundary, catalog validation ownership, Allegro account-aware rate limits, OAuth secrecy, and the IPS traceability chain.

## Task

Implement the governed Allegro publish/update lifecycle described by TASK-002 and EP-TASK-002: durable publish/update attempts, lifecycle statuses, idempotency keys, policy snapshots, monitored status queries, guarded remote create/update behavior, and terminal Allegro result preservation.

## Context

Read these sources before coding:

- `docs/08_roadmap/ROADMAP.md`
- `docs/10_features/FEAT-002-governed-publish-lifecycle.md`
- `docs/11_tasks/TASK-002-design-governed-publish-lifecycle.md`
- `docs/21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-002.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/16_operations/INTEGRATIONS.md`
- `prisma/schema.prisma`
- `services/allegro-service/src/allegro/offers/`
- `services/allegro-service/src/allegro/allegro-api.service.ts`

## Constraints

- Use synthetic tests and fixtures only.
- Do not store OAuth tokens, Authorization headers, client secrets, raw customer data, or production logs in attempts, tests, reports, or prompts.
- Do not change catalog, order, stock, payment, or supplier ownership boundaries.
- Do not allow remote offer create/update paths to bypass lifecycle policy and confirmation gates.
- Keep write-like operations idempotent with durable attempt records or explicit deterministic terminal states.
- Do not deploy from this prompt.

## Acceptance criteria

- Durable attempt schema and migration exist for publish/update actions, statuses, policy snapshots, idempotency, redacted failures, command IDs, and timestamps.
- Prepare/confirm/status/monitoring behavior is implemented and routes remote-affecting paths through the governed lifecycle.
- Direct remote create is blocked unless explicitly local-only or lifecycle-confirmed.
- Update execution preserves terminal Allegro success/failure result codes and redacts secret-like payload fields.
- Idempotency prevents duplicate attempts for repeated deterministic keys.
- Validation report records gates, targeted tests, build evidence, sensitive-data handling, replay evidence, deviations, and closure recommendation.

## Validation

Run and record:

```bash
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
cd services/allegro-service && LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret npx ts-node src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts
python3 scripts/deployment_readiness_gate.py --root . --target TASK-002
```

Closure requires passing targeted runtime checks and repository IPS gates, with evidence in `docs/12_validation/VAL-TASK-002-validation-report.md`.
