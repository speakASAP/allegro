# EP-TASK-007: Growth Analytics And Demand Loops Execution Plan

```yaml
id: EP-TASK-007
status: validated
source_task: ../11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-20
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-007-growth-analytics-and-demand-loops.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-007.md
```

## Metadata

- Source task: ../11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md
- Status: approved for contract-first implementation by owner instruction on 2026-06-20.
- Lifecycle state: implemented and validated for TASK-007 closure on 2026-06-20; runtime downstream writes remain blocked pending external contracts.

## Upstream Traceability

- Constitution: ../00_constitution/CONSTITUTION.md
- Vision: ../01_vision/VISION.md
- Business case: ../02_business_case/BUSINESS_CASE.md
- Roadmap: ../08_roadmap/ROADMAP.md
- Feature: ../10_features/FEAT-007-growth-analytics-and-demand-loops.md
- Goal impact: ../22_goal_impact/GOAL-IMPACT-TASK-007.md

## Goal Impact

Define versioned funnel events, lead signals, marketing segments, and notification digest contracts. This supports the revenue roadmap by improving publish reliability, conversion readiness, operational visibility, or profit protection for Allegro sales.

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

Define versioned funnel events, lead signals, marketing segments, and notification digest contracts.

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

- docs/12_validation/VAL-TASK-007-validation-report.md
- reports/validation/TASK-007-validation-evidence.md

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

TASK-007 executed as four independent contract lanes plus one integration lane. TASK-007-A through TASK-007-D produced isolated handoff artifacts, and TASK-007-E integrated the shared naming, validation evidence, and repo-state updates without runtime code changes.

- Integration owner: TASK-007-E orchestrator lane.
- Validation owner: TASK-007-E orchestrator lane.
- Merge order completed: 1. TASK-007-A funnel taxonomy handoff; 2. TASK-007-B leads and marketing schema handoff; 3. TASK-007-C notification digest handoff; 4. TASK-007-D redaction and replay handoff; 5. TASK-007-E integrated validation report, evidence summary, integrations map update, and status files.
- Shared files/contracts: event contract names, `docs/16_operations/INTEGRATIONS.md`, validation reports, `TASKS.md`, and `STATE.json`. TASK-007-E resolved final shared wording and preserved missing external contract markers.

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-007-A | Ready now | Funnel event taxonomy lane | Define versioned funnel events from Allegro publish, offer, stock, order-forward, and conversion-relevant lifecycle points using synthetic examples. | roadmap Stage 5; feature/task/goal-impact docs; existing logging/event references. | Do not add production event emission or customer identifiers. | Versioned taxonomy draft, event names, required fields, and missing source markers. | None; ready to start now. |
| TASK-007-B | Ready now | Leads and marketing schema lane | Map demand and remarketing signals into leads/marketing contract candidates with ownership and consent boundaries explicit. | docs/16_operations/INTEGRATIONS.md; leads/marketing shared client references if present; sensitive data policy. | No production writes to leads/marketing and no PII exports. | Schema candidates, consent/redaction requirements, and blocked integration facts. | None; ready to start now. |
| TASK-007-C | Ready now | Notification digest metrics lane | Define digest payload and metrics from available synthetic operational data, including source fields and deterministic aggregation windows. | notification service references; operational metrics references; roadmap demand-loop text. | Do not include raw order/customer records or production logs. | Digest payload draft, metric source map, and synthetic validation cases. | None; ready to start now. |
| TASK-007-D | Ready now | Redaction, replay, and versioning lane | Define redaction tests, replay/idempotency keys, event versioning rules, and backwards-compatibility checks for all event contract lanes. | docs/17_governance/PROJECT_INVARIANTS.md; sensitive-data policy; existing validation scripts. | Do not weaken sensitive-data rules or invent approvals. | Redaction/replay checklist and contract validation cases. | None; ready to start now. |
| TASK-007-E | Final integration | Growth contract integration lane | Merge A-D outputs into a coherent event contract plan and validation report, resolving naming/version conflicts. | docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md; docs/12_validation/VAL-TASK-007-validation-report.md; TASKS.md/STATE.json only if status changes are approved. | Do not start before A-D handoffs are available or explicitly marked blocked. | Integrated growth contract plan, validation evidence, deviations, and gate results. | Dependency-gated on prior lane handoffs. |

### Agent-Ready Handoff Notes

TASK-007-A through TASK-007-D completed as isolated remote handoffs under `reports/validation/`, and TASK-007-E integrated them into the repo validation/state artifacts. External contract gaps remain explicit `[MISSING: ...]` blockers for future runtime tasks.
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

You are a TASK-007 worker for allegro-service. Preserve the chain Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation. Work only against approved TASK-007 scope, use synthetic examples, and keep raw customer/order data, secrets, production logs, and OAuth material out of notes, tests, prompts, and reports.

Read the roadmap Stage 5, FEAT-007, TASK-007, this execution plan, project invariants, integrations map, and sensitive-data policy before producing output. TASK-007-A through TASK-007-D may run only after TASK-006 integration no longer needs the same shared integration files, or after TASK-007-E is explicitly assigned as conflict resolver. Return event names, contract fields, source mappings, validation cases, blockers, and explicit unavailable-fact markers for missing or unknown external contracts instead of inventing them. Do not edit shared event names, validation reports, TASKS.md, STATE.json, or integration wording unless TASK-007-E owns that merge.
## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
