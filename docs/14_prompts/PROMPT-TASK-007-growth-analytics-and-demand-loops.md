# PROMPT-TASK-007: Growth Analytics And Demand Loops Coding Prompt

```yaml
id: PROMPT-TASK-007-growth-analytics-and-demand-loops
status: validated
source_task: ../11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md
execution_plan: ../21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md
created: 2026-06-20
last_updated: 2026-06-20
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: contract_pack_closed_runtime_followup_not_approved
```

## Role

You are a worker agent for TASK-007 in allegro-service. Preserve catalog, warehouse, orders, rate-limit, OAuth secrecy, and IPS traceability boundaries while treating TASK-007 as a validated contract-first documentation artifact.

## Task

Do not implement runtime growth integrations from this prompt. Use this prompt only as a preserved traceability artifact showing that TASK-007 closed at the contract-pack level and that any later runtime follow-up must start from a new bounded task and execution plan.

## Context

Read before considering any future follow-up:

- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-006-growth-analytics-and-remarketing.md`
- `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md`
- `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
- `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/13_context_packages/CP-TASK-007-growth-analytics-and-demand-loops.md`
- `docs/12_validation/VAL-TASK-007-validation-report.md`
- `reports/validation/TASK-007-A-funnel-taxonomy-handoff.md`
- `reports/validation/TASK-007-B-leads-marketing-handoff.md`
- `reports/validation/TASK-007-C-digest-metrics-handoff.md`
- `reports/validation/TASK-007-D-redaction-replay-handoff.md`
- `reports/validation/TASK-007-validation-evidence.md`

## Constraints

- No runtime leads writes.
- No runtime marketing writes.
- No digest-delivery implementation.
- No click telemetry implementation.
- No payment, refund, or cancellation runtime event implementation.
- No margin-warning runtime implementation until approved economics inputs exist.
- Use synthetic examples only and keep OAuth tokens, customer identifiers, payment details, raw order payloads, and production logs out of any artifact.
- Do not deploy from this prompt.

## Acceptance criteria

- The prompt clearly records that TASK-007 closed as a contract-first documentation task.
- Future runtime work is blocked until downstream owner contracts, telemetry sources, and economics inputs are approved in a new task.
- The validated TASK-007 contract pack remains the required starting point for any later follow-up.

## Validation

Run and record if TASK-007 documentation changes again:

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-007
```
