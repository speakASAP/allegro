
# GOAL-IMPACT-TASK-001: Apply IPS adoption baseline

id: GOAL-IMPACT-TASK-001
artifact_type: task
artifact_id: TASK-001
artifact_path: ../11_tasks/TASK-001-bootstrap-service.md
primary_goal: Keep the Allegro integration truthful, validated, and reviewable.
secondary_goals:
  - preserve marketplace integration intent
  - document the real event and dependency boundary
  - maintain governance evidence for the production service
impact_level: high
impact_description: Adds project-level traceability and validates the real service boundaries for the Allegro integration without changing runtime behavior.
success_metric: the IPS validator passes and the repo retains truthful capability decisions.
upstream_links:
  - ../01_vision/VISION.md
  - ../06_architecture/INTEGRATION_CONTRACT.md
downstream_links:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
  - ../12_validation/VAL-TASK-001-bootstrap-service.md
validation_method: The repository's planning gate and project traceability checks validate the adoption profile and required sections.
status: approved

## Goal
Create a truthful IPS onboarding profile that aligns with the real Allegro marketplace integration scope and keeps business, system, and runtime intent documented.

## Contribution
This task contributes the required project adoption evidence and preserves the actual service responsibilities without inflating non-owned domains.

## Success metric
The repo passes the IPS validation gate and contains complete, non-placeholder onboarding evidence.

## Invariant compatibility
This work preserves the repo's real boundaries and the shared governance rules without inventing unsupported runtime claims.

## Upstream and downstream links
- Upstream: ../11_tasks/TASK-001-bootstrap-service.md and ../01_vision/VISION.md
- Downstream: ../21_execution_plans/EP-TASK-001-bootstrap-service.md and ../12_validation/VAL-TASK-001-bootstrap-service.md

## Validation method
The validation method is the repository planning gate from ../intent-preservation-system/scripts/validate_adoption_profile.py plus project doc checks. The record remains traceable to ../11_tasks/TASK-001-bootstrap-service.md and ../21_execution_plans/EP-TASK-001-bootstrap-service.md.
