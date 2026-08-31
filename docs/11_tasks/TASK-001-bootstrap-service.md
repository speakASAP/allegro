
# TASK-001-bootstrap-service: Bootstrap allegro

id: TASK-001-bootstrap-service
status: approved
owner: project owner
created: 2026-08-31
last_updated: 2026-08-31
completeness_level: complete
upstream:
  - ../../BUSINESS.md
  - ../../SYSTEM.md
  - ../01_vision/VISION.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
execution_plan:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
project_invariant_impact: preserves
sensitive_data_classification: restricted-secret-handling
contract_schema_impact: creates
replay_determinism_impact: affected
parallel_workstream_context: final-integration
required_gates:
  - adoption
  - pre-coding

## Objective
Create a truthful IPS adoption profile for the Allegro marketplace integration that documents its real runtime boundary, event contracts, and dependency scope without inventing unrelated service ownership.

## Upstream links
- ../../BUSINESS.md
- ../../SYSTEM.md
- ../01_vision/VISION.md

## Goal impact
This task aligns the project with the central IPS documentation standard and preserves traceability across project intent, system boundary, execution plan, and validation evidence.

## Project invariant impact
- preserve the repository's real integration scope and ownership boundaries
- maintain marketplace, catalog, and warehouse integration truthfulness
- avoid unapproved claims about payments, invoices, or core order ownership

## Sensitive-data classification
Marketplace credentials and secret values are classified as restricted secret-handling data. They must remain outside repo content, with validation evidence limited to sanitized configuration references.

## Contract and schema impact
- appends the project adoption profile in ips-adoption.json
- documents the real integration boundaries in docs/06_architecture/INTEGRATION_CONTRACT.md
- preserves project governance in STATE.json, TASKS.md, and validation records

## Replay and determinism impact
The adoption work is idempotent; repeated validation should produce the same approval and capability review so the project intent remains deterministic and reviewable.

## Scope
- repository adoption profile and validation evidence
- service boundary and event contract documentation
- truthful capability review for required and not-applicable integrations

## Non-goals
- creating a synthetic runtime or fake service ownership
- writing real secrets into repo files or documentation
- inventing unrelated payment, invoice, or ERP claims

## Acceptance criteria
- the IPS validator passes for planning mode
- all required section headings exist in the project artifacts
- required capability decisions are concrete and truthful
- approval evidence is present in protected docs

## Required context
- ../../BUSINESS.md
- ../../SYSTEM.md
- ../06_architecture/INTEGRATION_CONTRACT.md
- ../17_governance/PROJECT_INVARIANTS.md
- ../21_execution_plans/EP-TASK-001-bootstrap-service.md
- ../24_onboarding/PROJECT_ADOPTION_STANDARD.md

## Validation task
Validation report: ../12_validation/VAL-TASK-001-bootstrap-service.md.

## Required gates
| Gate | Command or evidence | Blocks on |
| --- | --- | --- |
| Adoption | python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning | Missing documents or invalid capability decisions |
| Pre-coding | python3 ../intent-preservation-system/scripts/pre_coding_gate.py --root . | Traceability or invariant violations |
| Application | repository-local service test or lint evidence | implementation regressions |
| Integration | real dependency validation or health evidence | broken required integrations |

## Parallel workstream context
- Documentation and contracts: ready now
- Application validation: dependency-gated on actual service work
- Final integration: ready after validation passes
