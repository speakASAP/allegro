# CP-TASK-001: IPS Baseline Context Package

```yaml
id: CP-TASK-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
source_task: ../11_tasks/TASK-001-apply-ips-baseline.md
```

## Target task

`../11_tasks/TASK-001-apply-ips-baseline.md`

## Upstream traceability

- Vision: `../01_vision/VISION.md`
- Feature: `../10_features/FEAT-001-ips-governed-allegro-delivery.md`
- Execution plan: `../21_execution_plans/EP-TASK-001-apply-ips-baseline.md`

## Included documents

- `../BUSINESS.md`
- `../SYSTEM.md`
- `../README.md`
- `../CLAUDE.md`
- `../STATE.json`
- `../23_documentation_contracts/DOCUMENTATION_COMPLETENESS_STANDARD.md`
- `../17_governance/PROJECT_INVARIANTS.md`

## Excluded documents

- Runtime source code under `services/` and `shared/` unless gate failures require inspection.
- Production logs, secrets, tokens, and raw operational data.
- Unrelated pre-existing Kubernetes modifications.

## Constraints

- Do not change runtime service behavior.
- Do not touch Kubernetes manifests for this task.
- Do not include sensitive values or production data in artifacts.
- Preserve business constraints from `../BUSINESS.md`.

## Agent prompt

Apply the IPS baseline using existing repository docs as source material, add gate scripts and documentation artifacts, run the IPS validation commands, and report evidence and deviations.

## Validation instructions

Run strict documentation audit, pre-coding gate, and deployment-readiness gate for TASK-001.
