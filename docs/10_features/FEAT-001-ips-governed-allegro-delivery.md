# FEAT-001: IPS-Governed Allegro Delivery

```yaml
id: FEAT-001
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../09_milestones/MS-001-ips-baseline.md
  - ../05_subsystems/SUB-001-allegro-offer-order-stock-flow.md
downstream:
  - ../11_tasks/TASK-001-apply-ips-baseline.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Goal

Make future `allegro-service` changes traceable, bounded, and validated under the company IPS standard.

## User Or System Need

Developers and AI agents need explicit intent, constraints, execution plans, and gates before changing a production marketplace integration.

## Goal Impact

Supports VG-004 by improving operational auditability while preserving VG-001 through VG-003 service boundaries.

## Scope

- Add IPS documentation hierarchy.
- Add gate scripts and npm scripts.
- Document invariants and sensitive-data rules.
- Produce baseline validation evidence.

## Non-goals

- Runtime architecture changes.
- Allegro API behavior changes.
- Database schema changes.
- Deployment script changes.

## Acceptance Criteria

- IPS required documents and required document groups exist.
- Task and execution plan include traceability, sensitive-data classification, invariant impact, and validation plan.
- Gate scripts are present under `scripts/`.
- `package.json` exposes IPS check commands.
- Validation report records evidence and deviations.

## Dependencies

- Existing `BUSINESS.md`, `SYSTEM.md`, `README.md`, `CLAUDE.md`, and `STATE.json`.
- Company standard under the Intent Preservation System.

## Traceability

- Vision: `../01_vision/VISION.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-001.md`

## Validation

Run:

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target TASK-001
```
