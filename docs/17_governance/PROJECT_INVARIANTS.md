# Project Invariants

```yaml
id: PROJECT-INVARIANTS
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
  - ../BUSINESS.md
  - ../SYSTEM.md
```

## Purpose
Define the non-negotiable rules that `allegro-service` must preserve while integrating with the Alfares marketplace ecosystem.

## Applicability
These invariants apply because the service handles marketplace offer updates, OAuth-backed marketplace access, stock synchronization, and order forwarding in production.

## Invariants

| ID | Level | Source | Rule | Forbidden outcome | Validation method | Gate |
|---|---|---|---|---|---|---|
| ALG-INV-001 | product | `../BUSINESS.md` | Allegro offers must not be created or modified without catalog validation. | Offer mutation bypasses product validation. | Execution plan and task validation evidence. | pre-coding/deployment |
| ALG-INV-002 | product | `../README.md` | Allegro API use must respect the documented max 1 request per second per account. | Rate limiting is weakened or bypassed. | Code review and validation evidence. | pre-coding/deployment |
| ALG-INV-003 | product | `../BUSINESS.md` | Orders must be forwarded to `orders-microservice` and not stored locally as the source of truth. | Local order ownership is introduced. | Contract and schema review. | pre-coding/deployment |
| ALG-INV-004 | operational | `../CLAUDE.md` | OAuth tokens and secrets must remain in Vault, Kubernetes secrets, or approved environment flow. | Secrets appear in code, logs, prompts, screenshots, or repo docs. | Sensitive-data scan and review. | pre-coding/deployment |
| ALG-INV-005 | architecture | `../06_architecture/INTEGRATION_CONTRACT.md` | Runtime service boundaries remain unchanged unless an ADR approves a change. | IPS work silently changes the architecture. | ADR and diff review. | pre-coding/deployment |
| ALG-INV-006 | operational | `../00_constitution/CONSTITUTION.md` | Implementation work must trace from vision through validation. | Code change proceeds without traceable governance. | Strict doc audit and pre-coding gate. | pre-coding |
| ALG-INV-007 | operational | `../23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md` | Validation evidence must exist before deployment or closure. | Work closes without gate evidence. | Deployment-readiness gate. | deployment |

## Exceptions
No approved exceptions.

## Review cadence
Review invariants when changing business constraints, integration boundaries, service ownership, or deployment readiness policy.
