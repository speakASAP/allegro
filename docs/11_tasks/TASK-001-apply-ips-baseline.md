# TASK-001: Apply IPS Baseline

```yaml
id: TASK-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../10_features/FEAT-001-ips-governed-allegro-delivery.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
execution_plan:
  - ../21_execution_plans/EP-TASK-001-apply-ips-baseline.md
```

## Objective

Apply the company Intent Preservation System baseline to the remote `allegro-service` repository without changing runtime service behavior.

## Upstream Links

- Vision: `../01_vision/VISION.md`
- Business case: `../02_business_case/BUSINESS_CASE.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Feature: `../10_features/FEAT-001-ips-governed-allegro-delivery.md`

## Goal Impact

This task improves traceability and validation for future production changes while preserving the existing Allegro service purpose and constraints. Goal impact record: `../22_goal_impact/GOAL-IMPACT-TASK-001.md`.

## Project Invariant Impact

Applicable invariants: ALG-INV-001 through ALG-INV-007 in `../17_governance/PROJECT_INVARIANTS.md`. This task is documentation and gate-script work only; it must not change offer mutation, order forwarding, rate limiting, secret handling, or runtime boundaries.

## Sensitive-Data Classification

Classification: none

This task uses only existing documentation and synthetic structural examples. It must not include secrets, OAuth token values, raw production orders, customer identifiers, logs with credentials, or production exports.

## Contract/Schema Impact

No runtime API, database schema, message contract, or external service contract changes. Documentation contracts and gate reports are added.

## Replay/Determinism Impact

Gate scripts are deterministic for a given repository state except report timestamps. Runtime replay behavior is not changed.

## Scope

- Add canonical IPS folders and service-specific baseline docs.
- Add documentation contracts and templates.
- Add standard gate scripts.
- Add npm scripts for IPS checks.
- Capture validation evidence.

## Non-Goals

- Changing Kubernetes manifests.
- Changing TypeScript service code.
- Deploying production changes.
- Modifying Allegro API behavior.
- Updating database migrations or Prisma schema.

## Acceptance Criteria

- [x] Canonical IPS folders exist.
- [x] Required IPS documents exist with traceability.
- [x] Task and execution plan declare invariants, sensitive-data classification, contract impact, replay impact, and gates.
- [x] Gate scripts exist under `scripts/`.
- [x] `package.json` includes IPS check commands.
- [x] Validation report exists for TASK-001.

## Required Context

- `../BUSINESS.md`
- `../SYSTEM.md`
- `../README.md`
- `../CLAUDE.md`
- `../STATE.json`
- `../23_documentation_contracts/DOCUMENTATION_COMPLETENESS_STANDARD.md`
- `../17_governance/PROJECT_INVARIANTS.md`

## Validation Task

Validate the baseline by running strict documentation audit, pre-coding gate, and deployment-readiness gate for TASK-001.

## Required Gates

- Pre-coding gate: `python3 scripts/pre_coding_gate.py --root .`
- Strict documentation audit: `python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues`
- Deployment-readiness gate: `python3 scripts/deployment_readiness_gate.py --root . --target TASK-001`

## Execution Plan Requirement

This task must not be converted into a coding prompt until an approved or explicitly draft execution plan exists. Current execution plan: `../21_execution_plans/EP-TASK-001-apply-ips-baseline.md`.
