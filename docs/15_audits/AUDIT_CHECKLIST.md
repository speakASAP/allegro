# Audit Checklist

```yaml
id: AUDIT-CHECKLIST-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../23_documentation_contracts/DOCUMENTATION_COMPLETENESS_STANDARD.md
downstream:
  - ../12_validation/VAL-TASK-001-ips-baseline.md
related_adrs: []
```

## Required Checks

- Required IPS documents exist.
- Required document groups contain at least one artifact.
- Tasks include upstream traceability, goal impact, execution plan, validation task, and required gates.
- Execution plans include scope, non-goals, file boundaries, implementation steps, test plan, validation plan, and rollback plan.
- Project invariants are declared and considered.
- Sensitive-data classification is declared.
- Validation reports exist before closure.
- Protected vision and constitution files are not modified without human approval.

## Service-Specific Checks

- Offer mutations preserve catalog validation.
- Allegro API rate limits are not weakened.
- Orders remain forwarded to orders-microservice.
- OAuth tokens and secrets are not exposed.
- Runtime service boundaries remain consistent with ADR-001 unless a new ADR is approved.

## Commands

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root .
```

## Validation

Audit findings must be remediated or documented before implementation, deployment, or closure.
