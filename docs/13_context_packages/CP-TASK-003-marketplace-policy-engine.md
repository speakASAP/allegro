# CP-TASK-003: Marketplace Policy Engine Context Package

```yaml
id: CP-TASK-003
status: validated
source_task: ../11_tasks/TASK-003-define-marketplace-policy-engine.md
execution_plan: ../21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md
coding_prompt: ../14_prompts/PROMPT-TASK-003-marketplace-policy-engine.md
created: 2026-06-15
last_updated: 2026-06-15
completeness_level: validated
sensitive_data_classification: synthetic
```

## Target task

TASK-003: `../11_tasks/TASK-003-define-marketplace-policy-engine.md` - define and implement reusable Allegro policy gates.

## Upstream traceability

- Roadmap: `../08_roadmap/ROADMAP.md`
- Feature: `../10_features/FEAT-003-marketplace-policy-engine.md`
- Task: `../11_tasks/TASK-003-define-marketplace-policy-engine.md`
- Execution plan: `../21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-003.md`
- Coding prompt: `../14_prompts/PROMPT-TASK-003-marketplace-policy-engine.md`

## Included documents

- `../08_roadmap/ROADMAP.md`
- `../10_features/FEAT-003-marketplace-policy-engine.md`
- `../11_tasks/TASK-003-define-marketplace-policy-engine.md`
- `../21_execution_plans/EP-TASK-003-define-marketplace-policy-engine.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-003.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../16_operations/INTEGRATIONS.md`
- `../14_prompts/PROMPT-TASK-003-marketplace-policy-engine.md`

## Excluded documents

- Protected constitution and vision source text beyond traceability references.
- Raw production data, secrets, tokens, production logs, and real customer/order/payment/supplier data.
- TASK-004 through TASK-008 implementation prompts.

## Constraints

- Policy gates are read/evaluate only.
- No direct Allegro publish/update side effects.
- No payment/supplier writes.
- Deterministic output for the same synthetic input snapshot.
- Explicit owner service and remediation guidance for blockers.

## Agent prompt

Use `../14_prompts/PROMPT-TASK-003-marketplace-policy-engine.md` as the coding prompt. Implement the smallest reusable policy engine slice that satisfies TASK-003 acceptance criteria and can later be consumed by lifecycle, catalog action, AI suggestions, and monitoring.

## Validation instructions

Run IPS audit, pre-coding gate, targeted policy tests, service build, and deployment-readiness for TASK-003. Record evidence in `../12_validation/VAL-TASK-003-validation-report.md`.
