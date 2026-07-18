# CP-TASK-004: Catalog Sell On Allegro Action Context Package

```yaml
id: CP-TASK-004
status: validated
source_task: ../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md
execution_plan: ../21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md
coding_prompt: ../14_prompts/PROMPT-TASK-004-catalog-sell-on-allegro-action.md
created: 2026-06-19
last_updated: 2026-06-19
completeness_level: validated
sensitive_data_classification: synthetic
```

## Target task

TASK-004: `../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md` - implement the catalog-facing Sell on Allegro prepare, confirm, status, and bulk-planning contract.

## Upstream traceability

- Roadmap: `../08_roadmap/ROADMAP.md`
- Feature: `../10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- Task: `../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md`
- Execution plan: `../21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-004.md`
- Coding prompt: `../14_prompts/PROMPT-TASK-004-catalog-sell-on-allegro-action.md`

## Included documents

- `../08_roadmap/ROADMAP.md`
- `../10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- `../11_tasks/TASK-004-design-catalog-sell-on-allegro-action.md`
- `../21_execution_plans/EP-TASK-004-design-catalog-sell-on-allegro-action.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-004.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../16_operations/INTEGRATIONS.md`
- `../14_prompts/PROMPT-TASK-004-catalog-sell-on-allegro-action.md`
- `../services/allegro-service/src/allegro/publish-lifecycle/`
- `../services/allegro-service/src/allegro/policy/`

## Excluded documents

- Protected constitution and vision source text beyond traceability references.
- Raw production data, secrets, tokens, production logs, and real customer/order/payment/supplier data.
- TASK-005 through TASK-008 implementation prompts.

## Constraints

- Keep catalog as product owner and Allegro as channel-state owner only.
- Do not publish directly from prepare or confirm.
- Reuse the governed publish lifecycle and policy engine.
- Use synthetic tests and fixtures only.
- Do not change orders, payments, supplier, or warehouse ownership.

## Agent prompt

Use `../14_prompts/PROMPT-TASK-004-catalog-sell-on-allegro-action.md` as the coding prompt. Implement the smallest catalog-facing route/service slice that creates or reuses a local draft, returns policy-backed readiness, and queues publish attempts only through lifecycle confirmation.

## Validation instructions

Run IPS audit, pre-coding gate, targeted catalog-sell spec, service build, and deployment-readiness for TASK-004. Record evidence in `../12_validation/VAL-TASK-004-validation-report.md`.
