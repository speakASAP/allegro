# EP-TASK-008: Operations Trust And Scale Execution Plan

```yaml
id: EP-TASK-008
status: validated
source_task: ../11_tasks/TASK-008-plan-operations-trust-and-scale.md
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-21
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-008-operations-trust-and-scale.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-008.md
```

## Metadata

- Source task: ../11_tasks/TASK-008-plan-operations-trust-and-scale.md
- Status: planning-first implementation integrated on 2026-06-21.
- Lifecycle state: implemented and validated for TASK-008 closure at the operational-planning level; runtime implementation remains deferred to future approved tasks.

## Upstream Traceability

- Constitution: ../00_constitution/CONSTITUTION.md
- Vision: ../01_vision/VISION.md
- Business case: ../02_business_case/BUSINESS_CASE.md
- Roadmap: ../08_roadmap/ROADMAP.md
- Feature: ../10_features/FEAT-008-operations-trust-and-scale.md
- Goal impact: ../22_goal_impact/GOAL-IMPACT-TASK-008.md

## Goal Impact

Plan account-aware rate-limit controls, OAuth health, SLA dashboards, MinIO media contract discovery, deployment smoke, and rollback playbooks. This supports the revenue roadmap by improving publish reliability, conversion readiness, operational visibility, and production recoverability for Allegro sales.

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

Plan account-aware rate-limit controls, OAuth health, SLA dashboards, MinIO media contract discovery, deployment smoke, and rollback playbooks.

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

- docs/12_validation/VAL-TASK-008-validation-report.md
- reports/validation/TASK-008-validation-evidence.md

## Files to Modify

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

TASK-008 executed as four independent planning handoff lanes plus one integration lane. TASK-008-A through TASK-008-D produced isolated handoff artifacts, and TASK-008-E integrated the shared validation evidence and repo-state updates without runtime code changes.

- Integration owner: TASK-008-E orchestrator lane.
- Validation owner: TASK-008-E orchestrator lane.
- Merge order completed: 1. TASK-008-A rate-limit and queue controls handoff; 2. TASK-008-B OAuth health handoff; 3. TASK-008-C MinIO media contract handoff; 4. TASK-008-D smoke and rollback handoff; 5. TASK-008-E integrated validation report, evidence summary, and status files.
- Shared files/contracts: deployment scripts, k8s manifests, `docs/16_operations/INTEGRATIONS.md`, validation reports, `TASKS.md`, and `STATE.json`. TASK-008-E preserved blocked facts and resolved duplicate planning output by selecting `reports/validation/TASK-008-C-minio-media-handoff.md` as the canonical media-contract artifact.

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-008-A | Completed | Rate-limit and queue controls lane | Inspect account-aware Allegro throttling, queue/backpressure controls, and measurable failure modes. Produce control and metric plan only. | Allegro client/rate-limit modules; queue worker references; project invariants. | Do not change runtime throttling behavior without an approved follow-up coding prompt. | Control map, metric list, synthetic failure-path cases. | Completed as planning handoff only. |
| TASK-008-B | Completed | OAuth health lane | Inspect OAuth token lifecycle, expiry handling, and alertable health signals. Produce secret-safe monitoring plan. | OAuth services; environment variable references; operational docs. | No raw tokens, secrets, refresh values, or production auth logs. | OAuth risk map, alert candidates, redaction-safe evidence plan. | Completed as planning handoff only. |
| TASK-008-C | Completed | MinIO media contract lane | Inspect media dependency references and define MinIO/media contract discovery requirements with blocked facts explicit. | `docs/16_operations/INTEGRATIONS.md`; media references; MinIO docs/contracts if present in repo. | No media storage implementation until contract is approved. | Media contract matrix and `[MISSING: ...]` markers for unavailable endpoints or ownership. | Completed as planning handoff only; runtime work remains blocked on external contract facts. |
| TASK-008-D | Completed | Deployment smoke and rollback lane | Inspect deploy scripts, Kubernetes manifests, health checks, and rollback docs. Produce smoke checklist and deterministic validation steps. | scripts/deploy.sh; k8s manifests; health endpoints; existing readiness reports. | Do not deploy or mutate production during planning-only closure. | Smoke checklist, rollback evidence requirements, failure-path tests. | Completed as planning handoff only. |
| TASK-008-E | Completed | Operations readiness integration lane | Merge A-D outputs into a single operations trust plan and validation report, resolving shared operational gates. | `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`; `docs/12_validation/VAL-TASK-008-validation-report.md`; `TASKS.md`; `STATE.json`. | Do not claim runtime implementation or deployment closure without separate evidence. | Integrated operations plan, validation evidence, deviations, and gate results. | Completed after A-D handoffs existed. |

### Agent-Ready Handoff Notes

TASK-008-A through TASK-008-D completed as isolated remote handoffs under `reports/validation/`, and TASK-008-E integrated them into the repo validation/state artifacts. Runtime work remains deferred because queue SLOs, media contracts, and some operational ownership facts are still explicit `[MISSING: ...]` or `[UNKNOWN: ...]` blockers for later tasks.

## Test Plan

- Run npm run ips:audit.
- Run npm run ips:pre-coding.
- Run `python3 scripts/deployment_readiness_gate.py --root . --target TASK-008`.

## Validation Plan

Validation succeeds when IPS gates pass, handoff evidence is integrated into the matching validation report, and sensitive-data constraints remain intact. TASK-008 closes at planning level only; no runtime deploy is part of this task closure.

## Gate Commands

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-008
```

## Documentation Updates

Update the source task, execution plan, validation report, TASKS.md, and STATE.json when planning status changes. Update `docs/16_operations/INTEGRATIONS.md` only when new contracts become approved.

## Rollback Plan

Revert task-scoped documentation and validation changes if needed. Do not claim rollout rollback coverage beyond the documented smoke and evidence requirements.

## Agent Handoff Prompt

You are a TASK-008 worker for allegro-service. Preserve the chain Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation. Work only against approved TASK-008 planning scope, use synthetic examples, and keep raw customer/order data, secrets, production logs, and OAuth material out of notes, tests, prompts, and reports.

Read the roadmap Stage 6, FEAT-008, TASK-008, this execution plan, project invariants, integrations map, and sensitive-data policy before producing output. TASK-008-A through TASK-008-D may write only isolated handoff artifacts under `reports/validation/`. Do not edit shared validation reports, `TASKS.md`, `STATE.json`, or integration wording unless TASK-008-E owns that merge. Return blocked facts explicitly instead of inventing them.

## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
