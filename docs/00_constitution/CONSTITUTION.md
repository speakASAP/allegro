# Project Constitution

```yaml
id: CONSTITUTION
status: approved
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream: []
downstream:
  - ../01_vision/VISION.md
  - ../17_governance/PROJECT_INVARIANTS.md
related_adrs: []
```

AI write access: Forbidden after this IPS baseline creation.
Human write access: Controlled through review.

## Purpose

This constitution applies the Intent Preservation System to the real `allegro-service` repository. It keeps the repository honest about its runtime boundary: a production marketplace integration for Allegro offer management, CSV import and transformation, stock synchronization, and order forwarding to the owned orders service.

## Constitutional principles

### 1. Truth before template

The repository must document real operating intent and dependencies instead of inventing responsibilities, product claims, or runtime scope.

### 2. Service-boundary honesty

`allegro-service` owns the Allegro marketplace integration and must not claim ownership of catalog, warehouse, invoice, or payment domains.

### 3. Traceability

Every task must preserve the traceability chain from vision to validation and must keep documentation and implementation aligned.

### 4. Validation before closure

Tasks, execution plans, and deployment evidence must be present before work is considered complete or releasable.

### 5. Sensitive-data protection

Secrets, OAuth tokens, marketplace credentials, and production records must never be stored in prompts, logs, screenshots, examples, or repository documentation.

### 6. Human approval for protected documents

Business, vision, and constitution artifacts require human approval evidence before they are treated as the source of truth.

## Amendment process

1. Identify the material change in scope, risk, or dependency ownership.
2. Explain the reason, expected impact, and affected downstream artifacts.
3. Confirm the change is supported by real repository evidence.
4. Capture human approval evidence.
5. Update the affected downstream artifacts and validation records.
6. Re-run the repository validation gate.

## Approval
status: approved
Approved by: project owner
Approval evidence: owner-confirmation: allegro-onboarding-approved
