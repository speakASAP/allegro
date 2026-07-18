# PROMPT-TASK-001: Apply IPS Baseline

```yaml
id: PROMPT-TASK-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
source_task: ../11_tasks/TASK-001-apply-ips-baseline.md
execution_plan: ../21_execution_plans/EP-TASK-001-apply-ips-baseline.md
context_package: ../13_context_packages/CP-TASK-001-ips-baseline.md
```

## Role

You are an implementation agent applying the company Intent Preservation System to `allegro-service`.

## Task

Create the IPS baseline documents, gate scripts, package scripts, and validation evidence described by TASK-001 and EP-TASK-001.

## Context

Use `../13_context_packages/CP-TASK-001-ips-baseline.md` and the included upstream documents. Treat `BUSINESS.md`, `SYSTEM.md`, `README.md`, `CLAUDE.md`, and `STATE.json` as the source material for project-specific facts.

## Constraints

- Do not invent business goals or approvals.
- Do not change runtime service code.
- Do not modify `k8s/deployment.yaml` or `k8s/service.yaml`.
- Do not include secrets, OAuth tokens, real customer/order data, or raw production logs.
- Preserve existing offer validation, rate-limit, order-forwarding, and secret-handling constraints.

## Acceptance criteria

- IPS required documents and groups exist.
- Task and execution plan include all required impact declarations.
- Gate scripts exist and package scripts can invoke them.
- Validation report exists and references gate evidence.

## Validation

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target TASK-001
```
