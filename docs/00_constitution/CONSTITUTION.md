# Project Constitution

```yaml
id: CONSTITUTION
status: draft
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

This constitution applies the company Intent Preservation System to `allegro-service`. It preserves the service intent documented in `BUSINESS.md`, `SYSTEM.md`, `README.md`, `CLAUDE.md`, and `STATE.json` while requiring traceable task execution and validation evidence before implementation and deployment work.

## Constitutional Principles

### 1. Intent preservation

All implementation work must preserve the existing purpose of `allegro-service`: multi-account Allegro marketplace integration for offer management, CSV import/transformation, order processing, and stock synchronization.

### 2. Immutable source of truth

This constitution and `../01_vision/VISION.md` are protected documents. AI agents may read, summarize, and reference them, but must not modify them after baseline creation.

### 3. Human-controlled change

Changes to business intent, product scope, or protected constraints must be proposed through `../01_vision/VISION_EVOLUTION.md` and approved by the owner before downstream documents or code are changed.

### 4. Traceability

Every task must trace through the chain:

```text
Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation
```

### 5. Documentation before implementation

Implementation work must not start until the relevant task, execution plan, validation criteria, sensitive-data classification, invariant impact, and required gates are documented.

### 6. Small AI execution units

AI-executable tasks must be bounded to a clear outcome, limited file scope, explicit non-goals, required context, validation commands, and rollback guidance.

### 7. Context minimization

Agents must read the context package for the active task and only expand context when the package or execution plan identifies a concrete need.

### 8. Validation at every level

Completion requires validation evidence at task level and gate evidence before deployment, release, or closure.

### 9. Decision memory

Major technology, integration, or architecture decisions must be captured under `../07_decisions/` as ADRs.

### 10. Auditability

The repository must remain auditable with `scripts/strict_doc_audit.py`, `scripts/pre_coding_gate.py`, and `scripts/deployment_readiness_gate.py`.

## Amendment Process

1. Draft an entry in `../01_vision/VISION_EVOLUTION.md` or a governance amendment.
2. Identify affected downstream documents.
3. Explain reason, impact, and invalidated assumptions.
4. Obtain human approval.
5. Update downstream artifacts.
6. Run the IPS gates.

## Non-Negotiable Rules For AI Agents

AI agents must not:

- modify this file or `../01_vision/VISION.md` after baseline creation;
- invent project goals not present in approved source documents;
- remove traceability links;
- skip execution plans or validation;
- store secrets, raw production records, OAuth tokens, customer identifiers, or live order data in prompts, tests, examples, logs, reports, or screenshots;
- create or modify Allegro offers without validation against catalog-microservice;
- exceed Allegro API rate limits;
- store orders locally instead of forwarding them to orders-microservice.
