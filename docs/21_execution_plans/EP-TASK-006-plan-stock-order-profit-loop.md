# EP-TASK-006: Stock Order Profit Loop Execution Plan

```yaml
id: EP-TASK-006
status: validated
source_task: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-21
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-006-stock-order-profit-loop.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-006.md
```

## Metadata

- Source task: ../11_tasks/TASK-006-plan-stock-order-profit-loop.md
- Status: draft for owner review.
- Lifecycle state: owner approved missing external contract assumptions on 2026-06-21; contract-first implementation completed and validated without runtime writes.

## Upstream Traceability

- Constitution: ../00_constitution/CONSTITUTION.md
- Vision: ../01_vision/VISION.md
- Business case: ../02_business_case/BUSINESS_CASE.md
- Roadmap: ../08_roadmap/ROADMAP.md
- Feature: ../10_features/FEAT-006-stock-order-profit-loop.md
- Goal impact: ../22_goal_impact/GOAL-IMPACT-TASK-006.md

## Goal Impact

Plan stock-to-Allegro sync, order reconciliation, payment read-only status, supplier read-only stock and cost, and margin computation. This supports the revenue roadmap by improving publish reliability, conversion readiness, operational visibility, or profit protection for Allegro sales.

## Project Invariants

- ALG-INV-001: Preserve catalog validation before offer mutation where offer data is affected.
- ALG-INV-002: Preserve Allegro account-aware rate limits for API work.
- ALG-INV-003: Preserve orders-microservice as order owner where orders are affected.
- ALG-INV-004: Keep secrets, OAuth tokens, customer data, and raw production logs out of code, docs, tests, prompts, and reports.
- ALG-INV-005: Create ADR before changing runtime ownership boundaries.
- ALG-INV-006: Maintain traceability before coding.
- ALG-INV-007: Collect validation evidence before closure.

## Sensitive-Data Handling

Classification: synthetic. Use synthetic products, offers, accounts, orders, payments, supplier records, events, and errors in tests and documentation. Redact authorization headers, OAuth tokens, client secrets, customer identifiers, payment details, and raw production logs.

## Contract Validation Plan

Contract or schema impact must be documented before implementation. Validate affected DTOs, service clients, Prisma schema changes, event payloads, or external service contracts with synthetic fixtures and store evidence under 12_validation or reports/validation.

## Replay/Determinism Plan

All write-like operations must be idempotent or have durable attempt records. Read-only contract discovery must define deterministic fixtures. Event emission must include idempotency or correlation keys where downstream consumers may replay data.

## Scope

Plan stock-to-Allegro sync, order reconciliation, payment read-only status, supplier read-only stock and cost, and margin computation.

## Non-Goals

- Do not modify protected vision or constitution files.
- Do not add production secrets, raw customer data, raw order data, or OAuth tokens.
- Do not change service ownership boundaries without ADR.
- Do not add unrelated runtime behavior outside the task scope.

## Files to Inspect

- docs/08_roadmap/ROADMAP.md
- docs/16_operations/INTEGRATIONS.md
- docs/17_governance/PROJECT_INVARIANTS.md
- prisma/schema.prisma
- services/allegro-service/src/allegro/
- shared/clients/

## Files to Create

- docs/12_validation/VAL-TASK-006-validation-report.md
- reports/validation/TASK-006-validation-evidence.md when generated evidence is needed

## Files to Modify

- Task-scoped service files only after approval
- Task-scoped validation reports
- TASKS.md and STATE.json when status changes

## Files That Must Not Be Modified

- docs/00_constitution/CONSTITUTION.md
- docs/01_vision/VISION.md
- Real production secret files or Vault-managed values
- Unrelated service modules outside the task scope

## Implementation Steps

1. Re-read upstream roadmap, feature, task, goal-impact, and invariants.
2. Confirm affected contracts and source-of-truth ownership.
3. Design the smallest task-scoped implementation or contract artifact.
4. Add synthetic fixtures and validation coverage.
5. Run the IPS gates and targeted tests.
6. Record validation evidence and deviations.

## Parallel Execution

TASK-006 ran four independent contract-discovery lanes, then one integration lane merged the lane evidence into the validation report. Planning gates passed on 2026-06-21. Owner approval unblocked a pure contract-first implementation; runtime mutation tasks remain separate follow-ups.

- Integration owner: Agent TASK-006-E integration owner.
- Validation owner: Agent TASK-006-E validation owner.
- Merge order completed for planning evidence: 1. TASK-006-A stock contract lane; 2. TASK-006-B order reconciliation lane; 3. TASK-006-C payments and suppliers read-only lane; 4. TASK-006-D margin computation lane; 5. TASK-006-E final integration and validation evidence.
- Shared files/contracts: docs/16_operations/INTEGRATIONS.md, shared client contracts, prisma/schema.prisma if later schema changes are approved, TASKS.md, STATE.json, and validation reports. Only TASK-006-E may merge shared contract wording after reviewing lane outputs.

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-006-A | Completed handoff | Stock drift and publishable quantity lane | Inspect warehouse client, offer stock fields, Allegro stock mutation boundaries, and existing synthetic stock fixtures. Produce stock-drift detection contract notes and validation cases only. | docs/11_tasks/TASK-006-plan-stock-order-profit-loop.md; docs/10_features/FEAT-006-stock-order-profit-loop.md; docs/16_operations/INTEGRATIONS.md; warehouse client references; offer stock DTOs. | Do not edit orders, payments, supplier, margin, Prisma migrations, or production secrets. | Stock contract findings, fixture needs, idempotency notes, and proposed validation evidence section. | None; ready to start now. |
| TASK-006-B | Completed handoff | Order retry and reconciliation lane | Inspect order forwarding, RabbitMQ subscriber behavior, orders-microservice boundary, and retry/reconciliation records. Produce replay-safe order reconciliation contract notes only. | order forwarding modules; RabbitMQ subscriber; orders client references; ALG-INV-003 ownership boundary. | Do not add local order ownership, payment behavior, stock mutations, or schema changes without integration owner approval. | Order reconciliation findings, idempotency/replay notes, and proposed validation cases. | None; ready to start now. |
| TASK-006-C | Completed handoff | Payments and suppliers read-only lane | Inspect available payments and supplier integration references. Define read-only/dry-run contract discovery questions, synthetic payloads, and blocked facts. | docs/16_operations/INTEGRATIONS.md; shared clients; payment/supplier references if present. | No payment writes, no supplier purchase automation, no raw customer/payment/supplier production data. | Read-only contract matrix with [MISSING: ...] markers where endpoints or ownership are unavailable. | None; ready to start now. |
| TASK-006-D | Completed handoff | Margin computation lane | Inspect product cost, supplier cost, Allegro fee, shipping, and offer price sources. Define deterministic margin inputs and synthetic fixture plan. | catalog/product references; supplier cost references; Allegro fee/price DTOs; roadmap profit-protection text. | Do not invent unavailable fee formulas or supplier terms; mark unknown inputs explicitly. | Margin source map, deterministic calculation assumptions, missing data markers, and validation fixture outline. | None; ready to start now. |
| TASK-006-E | Integrated planning evidence | Plan integration and evidence lane | Merge A-D outputs into one execution-ready TASK-006 contract plan, update validation report, resolve shared-file conflicts, and run IPS gates. | docs/21_execution_plans/EP-TASK-006-plan-stock-order-profit-loop.md; docs/12_validation/VAL-TASK-006-validation-report.md; TASKS.md/STATE.json only if status changes are approved. | Do not start before A-D handoffs are available or explicitly marked blocked. | Integrated plan, validation evidence references, deviations, and gate results. | Dependency-gated on prior lane handoffs. |

### Agent-Ready Handoff Notes

TASK-006-A through TASK-006-D completed handoffs, TASK-006-E integrated planning evidence, and owner approval on 2026-06-21 allowed a pure contract-first implementation. Runtime stock mutation, payment writes, supplier writes, and schema-backed durable queues remain separate future tasks.
## Test Plan

- Run npm run ips:audit.
- Run npm run ips:pre-coding.
- Run targeted unit or contract tests for the affected implementation.
- Run npm run ips:readiness before deployment or closure.

## Validation Plan

Validation succeeds when IPS gates, targeted tests, and sensitive-data checks pass, and when evidence is stored in the matching validation report. Contract-first tasks may close with approved contracts and synthetic fixtures before runtime coding begins.

## Gate Commands

```bash
npm run ips:audit
npm run ips:pre-coding
npm run ips:readiness
```

## Documentation Updates

Update the source task, feature, goal-impact record, validation report, TASKS.md, and STATE.json when implementation status changes. Update docs/16_operations/INTEGRATIONS.md when new contracts become approved.

## Rollback Plan

Revert task-scoped code and schema changes. Disable new routes, workers, or event emitters by configuration when available. Preserve audit records long enough for incident review if production attempts were created.

## Agent Handoff Prompt

TASK-006-A through TASK-006-D completed handoffs, TASK-006-E integrated planning evidence, and owner approval on 2026-06-21 allowed a pure contract-first implementation. Runtime stock mutation, payment writes, supplier writes, and schema-backed durable queues remain separate future tasks.
## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
