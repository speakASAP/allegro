# FEAT-005: AI-Assisted Offer Optimization

```yaml
id: FEAT-005
status: validated
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-19
completeness_level: complete
upstream:
  - ../09_milestones/MS-004-intelligent-offer-optimization.md
downstream:
  - ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
related_adrs: []
```

## Goal

Use ai-microservice to propose higher-converting offer content and listing improvements while keeping all marketplace mutations policy-confirmed.

## User Story

As an operator, I need AI recommendations that explain how to improve a listing and why, but I need the system to keep control, validation, and rollback around every approved change.

## Acceptance Criteria

- AI suggestions are draft-only.
- Suggestions include confidence, evidence, policy blockers, and rollback notes.
- Approved suggestions flow through the governed publish lifecycle.
- Sensitive product/order/customer data is redacted or excluded by contract.

## Dependencies

- ai-microservice contract discovery.
- Offer quality and performance events.
- MS-002 lifecycle.

## Traceability

- ../09_milestones/MS-004-intelligent-offer-optimization.md
- ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md

## Validation

Synthetic AI contract tests, prompt redaction review, deterministic snapshot-hash checks, and review-gated suggestion record tests all passed on 2026-06-19.
