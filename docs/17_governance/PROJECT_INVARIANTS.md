# Project Invariants

```yaml
id: PROJECT-INVARIANTS
status: draft
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

Define non-negotiable rules that `allegro-service` tasks must preserve.

## Applicability

Project-specific invariants apply because the service handles marketplace offers, OAuth credentials, stock updates, and order forwarding in production.

## Invariants

| ID | Level | Source | Rule | Forbidden outcome | Validation method | Gate |
|---|---|---|---|---|---|---|
| ALG-INV-001 | product | `../BUSINESS.md` | Allegro offers must not be created or modified without catalog-microservice validation. | Offer mutation bypasses product validation. | Execution plan and task validation evidence for offer-changing work. | pre-coding/deployment |
| ALG-INV-002 | product | `../README.md` | Allegro API use must respect max 1 request per second per account. | Task weakens or removes rate limiting. | Code review/test evidence for Allegro API changes. | pre-coding/deployment |
| ALG-INV-003 | product | `../BUSINESS.md` | Orders must be forwarded to orders-microservice and not stored locally as source of truth. | Local order ownership is introduced. | Contract/schema review for order-handling changes. | pre-coding/deployment |
| ALG-INV-004 | operational | `../CLAUDE.md` | OAuth tokens and secrets must remain in Vault, Kubernetes secrets, or approved environment flow. | Secrets appear in code, docs, tests, logs, reports, or prompts. | Sensitive-data scan and review. | pre-coding/deployment |
| ALG-INV-005 | architecture | `../06_architecture/ARCHITECTURE_OVERVIEW.md` | Runtime service boundaries remain unchanged unless an ADR approves a change. | IPS task silently changes architecture. | ADR and diff review. | pre-coding/deployment |
| ALG-INV-006 | operational | `../00_constitution/CONSTITUTION.md` | Implementation work must trace to vision, feature, task, execution plan, and validation. | Code change proceeds from vague intent. | Strict doc audit and pre-coding gate. | pre-coding |
| ALG-INV-007 | operational | `../23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md` | Validation evidence must exist before deployment or closure. | Work closes without gate evidence. | Deployment-readiness gate. | deployment |

## Exceptions

No approved exceptions.

## Review cadence

Review invariants when changing business constraints, integration boundaries, ADRs, or deployment readiness policy.
