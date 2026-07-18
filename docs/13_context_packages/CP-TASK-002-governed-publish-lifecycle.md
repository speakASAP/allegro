# CP-TASK-002: Governed Publish Lifecycle Context Package

```yaml
id: CP-TASK-002
status: validated
source_task: ../11_tasks/TASK-002-design-governed-publish-lifecycle.md
execution_plan: ../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md
coding_prompt: ../14_prompts/PROMPT-TASK-002-governed-publish-lifecycle.md
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
sensitive_data_classification: synthetic
```

## Target task

TASK-002: `../11_tasks/TASK-002-design-governed-publish-lifecycle.md` - design and implement the governed Allegro publish/update lifecycle with durable attempts, idempotency, policy evidence, monitoring, and safe execution gates.

## Upstream traceability

- Vision: `../01_vision/VISION.md`
- Roadmap: `../08_roadmap/ROADMAP.md`
- Feature: `../10_features/FEAT-002-governed-publish-lifecycle.md`
- Task: `../11_tasks/TASK-002-design-governed-publish-lifecycle.md`
- Execution plan: `../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-002.md`
- Coding prompt: `../14_prompts/PROMPT-TASK-002-governed-publish-lifecycle.md`
- Validation: `../12_validation/VAL-TASK-002-validation-report.md`

## Included documents

- `../08_roadmap/ROADMAP.md`
- `../10_features/FEAT-002-governed-publish-lifecycle.md`
- `../11_tasks/TASK-002-design-governed-publish-lifecycle.md`
- `../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-002.md`
- `../14_prompts/PROMPT-TASK-002-governed-publish-lifecycle.md`
- `../12_validation/VAL-TASK-002-validation-report.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../16_operations/INTEGRATIONS.md`

## Excluded documents

- Protected constitution and vision source text beyond traceability references.
- Raw production logs, real orders, real customer data, OAuth tokens, Authorization headers, client secrets, and production payloads.
- TASK-003 through TASK-008 implementation prompts, because they are separate goals and not part of TASK-002 closure.

## Constraints

- Preserve catalog validation before offer mutation.
- Preserve account-aware Allegro rate limits.
- Preserve orders-microservice as order owner where orders are referenced.
- Use synthetic tests and fixtures only.
- Do not include secrets, tokens, raw customer records, or production logs.
- Do not change runtime ownership boundaries without an ADR.
- Record validation evidence before closure.

## Agent prompt

Use `../14_prompts/PROMPT-TASK-002-governed-publish-lifecycle.md` as the coding prompt. The expected output is a governed lifecycle implementation with durable publish/update attempts, idempotency, lifecycle states, guarded remote create/update behavior, redacted terminal failure context, monitoring queries, and validation evidence.

## Validation instructions

Run and record:

```bash
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
cd services/allegro-service && LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret npx ts-node src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts
python3 scripts/deployment_readiness_gate.py --root . --target TASK-002
```

Validation evidence belongs in `../12_validation/VAL-TASK-002-validation-report.md` and generated gate reports under `../reports/validation/`.
