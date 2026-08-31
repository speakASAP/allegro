
# EP-TASK-001-bootstrap-service: Bootstrap allegro

id: EP-TASK-001-bootstrap-service
status: approved
source_task: ../11_tasks/TASK-001-bootstrap-service.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
validation:
  - ../12_validation/VAL-TASK-001-bootstrap-service.md
owner: project owner
created: 2026-08-31
last_updated: 2026-08-31
completeness_level: complete
parallelization_strategy: single_agent
required_gates:
  - adoption
  - pre-coding

## Upstream traceability
- ../../BUSINESS.md
- ../../SYSTEM.md
- ../01_vision/VISION.md
- ../11_tasks/TASK-001-bootstrap-service.md
- ../22_goal_impact/GOAL-IMPACT-TASK-001.md

## Scope
- define the truthful adoption profile for the Allegro integration
- document the real runtime and ecosystem dependencies
- preserve order forwarding, stock synchronization, and validation evidence

## Non-goals
- inventing payments or invoice ownership
- changing runtime behavior outside the repo's actual scope
- writing secret values into repository documents

## Project invariants
- remain honest about runtime ownership
- keep event and dependency contracts aligned with the service reality
- maintain governance evidence and traceability within the shared IPS standard

## Sensitive-data handling
- keep marketplace credentials in secure secret storage
- avoid writing secret values into docs or validation evidence
- validate only sanitized configuration references in the repo files

## Contract validation plan
- confirm the required service dependencies are documented in ips-adoption.json
- validate event and order-forwarding commitments against the business and system docs
- confirm stock.updated consumption remains the authoritative event contract

## Replay and determinism plan
Use the same IPS adoption validation and project documentation process each time to prevent drift and preserve deterministic evidence.

## Files to inspect
- README.md
- BUSINESS.md
- SYSTEM.md
- STATE.json
- docs/06_architecture/INTEGRATION_CONTRACT.md
- docs/17_governance/PROJECT_INVARIANTS.md

## Files to create
- ips-adoption.json
- docs/11_tasks/TASK-001-bootstrap-service.md
- docs/22_goal_impact/GOAL-IMPACT-TASK-001.md
- docs/12_validation/VAL-TASK-001-bootstrap-service.md

## Files to modify
- README.md when adding truthful documentation sections
- BUSINESS.md when adding approval and project scope details
- SYSTEM.md when clarifying project responsibilities and dependencies
- STATE.json when updating status and follow-ups

## Files that must not be modified
- docs/00_constitution/CONSTITUTION.md
- docs/01_vision/VISION.md
- shared/config/ecosystem-repositories.json

## Implementation steps
1. confirm the real project scope and dependency boundaries from existing repo docs
2. run the non-destructive scaffold and complete any missing adoption artifacts
3. fill required sections and approval evidence for protected docs
4. validate the project with the central IPS planning gate
5. commit only after the validation passes

## Parallel execution
| Workstream | Status | Owner role | Allowed files | Dependencies | Validation | Merge order |
| --- | --- | --- | --- | --- | --- | --- |
| Documentation and contracts | ready now | project owner | repo docs and adoption files | existing repo reality | validator output | first |
| Application validation | dependency-gated | validation owner | service checks and health evidence | real runtime validation | service logs and health checks | second |
| Final integration | final integration | integration owner | deployment and policy artifacts | validated docs and contracts | final project validation | last |

## Blockers
No blocking issues remain after the real repo intent and service boundary were verified.

## Test plan
- run the central IPS validator in planning mode
- review required capability decisions and service boundary claims
- verify no placeholder text remains in protected or generated docs

## Validation plan
- adoption gate: python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning
- project checks: repo-local validation and health evidence
- final acceptance: approval evidence and truthful capability review

## Gate commands
python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning
python3 ../intent-preservation-system/scripts/pre_coding_gate.py --root .

## Documentation updates
- README.md
- BUSINESS.md
- SYSTEM.md
- AGENTS.md
- TASKS.md
- docs/06_architecture/INTEGRATION_CONTRACT.md
- docs/17_governance/PROJECT_INVARIANTS.md
- docs/orchestrator/VALIDATION_DEBT.md

## Rollback plan
If a documentation-only repo change introduces drift, revert the adoption docs and re-run the validator with the repo's real runtime boundary as the source of truth.

## Handoff
The project remains ready for downstream validation and any future service implementation tasks, as long as all tasks stay aligned with the repository's truthful marketplace boundaries.

## Completion checklist
- [x] Protected intent approved
- [x] Adoption profile valid
- [x] Integration decisions complete
- [x] Validation report complete
