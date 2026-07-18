# PROMPT-TASK-008: Operations Trust And Scale Coding Prompt

```yaml
id: PROMPT-TASK-008-operations-trust-and-scale
status: validated
source_task: ../11_tasks/TASK-008-plan-operations-trust-and-scale.md
execution_plan: ../21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md
created: 2026-06-21
last_updated: 2026-06-21
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: planning_pack_closed_runtime_followup_not_approved
```

## Role

You are a worker agent for TASK-008 in allegro-service. Preserve catalog, orders, rate-limit, OAuth secrecy, deployment safety, and IPS traceability boundaries while treating TASK-008 as a validated planning-only operations artifact.

## Task

Do not implement runtime rate-limit enforcement changes, OAuth alert delivery hooks, MinIO media integration, deploy-script edits, Kubernetes manifest edits, or production smoke execution from this prompt. Use this prompt only as a preserved traceability artifact showing that TASK-008 closed at the operations-planning level and that any later runtime follow-up must start from a new bounded task and execution plan.

## Context

Read before considering any future follow-up:

- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-007-operations-trust-and-scale.md`
- `docs/10_features/FEAT-008-operations-trust-and-scale.md`
- `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md`
- `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-008.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/13_context_packages/CP-TASK-008-operations-trust-and-scale.md`
- `docs/12_validation/VAL-TASK-008-validation-report.md`
- `reports/validation/TASK-008-A-rate-limit-queue-handoff.md`
- `reports/validation/TASK-008-B-oauth-health-handoff.md`
- `reports/validation/TASK-008-C-minio-media-handoff.md`
- `reports/validation/TASK-008-D-smoke-rollback-handoff.md`
- `reports/validation/TASK-008-validation-evidence.md`

## Constraints

- No runtime queue or throttling implementation.
- No OAuth notification or secret-handling runtime changes.
- No MinIO/media storage implementation.
- No deploy-script or Kubernetes manifest changes.
- No production smoke or rollback execution from this prompt.
- Use synthetic examples only and keep OAuth tokens, client secrets, queue credentials, customer identifiers, payment details, and raw production logs out of any artifact.
- Do not deploy from this prompt.

## Acceptance criteria

- The prompt clearly records that TASK-008 closed as a planning-only operations task.
- Future runtime work remains blocked until missing external owners, contract facts, and approved follow-up tasks exist.
- The validated TASK-008 handoff pack remains the required starting point for any later operational implementation work.

## Validation

Run and record if TASK-008 documentation changes again:

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-008
```
