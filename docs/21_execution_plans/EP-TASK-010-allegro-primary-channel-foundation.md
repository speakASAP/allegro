# EP-TASK-010: Allegro Primary Channel Foundation Execution Plan

```yaml
id: EP-TASK-010
status: approved
source_task: ../11_tasks/TASK-010-allegro-primary-channel-foundation.md
owner: Allegro Integration Owner
created: 2026-06-29
last_updated: 2026-06-29
completeness_level: complete
constitution: ../00_constitution/CONSTITUTION.md
vision: ../01_vision/VISION.md
system: ../04_systems/SYS-001-allegro-marketplace-integration.md
feature: ../10_features/FEAT-010-allegro-primary-channel-foundation.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-010.md
```

## Metadata

- Source task: `../11_tasks/TASK-010-allegro-primary-channel-foundation.md`
- Status: approved for bounded foundation implementation.
- Lifecycle state: open for safe script/framework and additive projection
  groundwork; live mutation lanes remain blocked.
- Integration owner: Allegro Integration Owner.
- Validation owner: Allegro Integration Owner until a separate validation lane
  is created.

## Upstream Traceability

- Vision: `../01_vision/VISION.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Feature: `../10_features/FEAT-010-allegro-primary-channel-foundation.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-010.md`
- Mapping: `../docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- Master plan: `../docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- Operations map: `../16_operations/INTEGRATIONS.md`
- Invariants: `../17_governance/PROJECT_INVARIANTS.md`

## Goal Impact

TASK-010 starts the transition from one-off Allegro scripts and partial
projections to a governed primary-channel platform. The work makes future import
and export flows safer by standardizing mutation flags, preview/apply guards,
redacted summaries, owner boundaries, and validation evidence before broad data
movement is allowed.

## Project Invariants

- ALG-INV-001: Catalog validation stays required before offer mutation.
- ALG-INV-002: Allegro API work remains account-aware and rate-limit sensitive.
- ALG-INV-003: orders-microservice remains central order owner.
- ALG-INV-004: secrets, OAuth tokens, customer identifiers, raw production
  records, and Authorization headers stay out of artifacts.
- ALG-INV-005: service boundaries stay unchanged; no ADR is added in this task.
- ALG-INV-006: IPS traceability exists before coding.
- ALG-INV-007: validation evidence is required before closure.

## Sensitive-Data Handling

Classification: synthetic. TASK-010 code and docs may use synthetic names,
synthetic IDs, aggregate counts, redacted path references, and hashes. Do not
print, store, or commit raw Allegro buyer data, order payloads, payment payloads,
delivery addresses, OAuth material, service credentials, session cookies, or
raw production logs.

## Contract Validation Plan

TASK-010 affects internal script contracts and planned projection contracts.
Validate contract impact by:

- keeping script summary fields stable and explicit;
- documenting mutation flags for every script;
- keeping schema changes additive if W2 is implemented;
- avoiding direct sibling DB writes;
- validating with build/tests for changed code;
- keeping Warehouse and Allegro stock apply blocked unless an owner-approved
  prompt explicitly opens that lane.

## Replay/Determinism Plan

Dry-run output must be deterministic enough to compare across runs. Future apply
paths must bind actor, account, scope, input hash, preview token, and
idempotency key. Order forwarding, stock commands, publish attempts, billing,
payments, returns, claims, invoices, issues, shipments, and fulfillment syncs
must be replay-safe before production write-back.

## Scope

TASK-010 is split into small lanes:

- W0: IPS spine and repo-state integration.
- W1: shared script guard framework and read-only/local-only script conversion.
- W2: additive sync/projection schema foundation.
- W3: validation/runbook evidence.

This first implementation pass may complete W0 and start W1. W2 can be planned
or implemented only if it does not race another schema owner.

## Non-Goals

- No production deploy.
- No live import and export apply.
- No Warehouse stock mutation.
- No BizBox/current supplier apply.
- No live Allegro stock quantity apply.
- No central order replay apply at scale.
- No payments/refunds/captures/payouts/settlement writes.
- No return/claim/invoice/issue/shipment/fulfillment write-back.
- No browser or Chrome control.
- No unapproved service boundary changes.

## Files to Inspect

- `AGENTS.md`
- `AGENT_OPERATIONS.md`
- `TASKS.md`
- `STATE.json`
- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `services/allegro-service/package.json`
- `services/allegro-service/src/scripts/*`
- `prisma/schema.prisma`
- `graph/project_graph.example.yaml`

## Files to Create

- `docs/10_features/FEAT-010-allegro-primary-channel-foundation.md`
- `docs/11_tasks/TASK-010-allegro-primary-channel-foundation.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-010.md`
- `docs/13_context_packages/CP-TASK-010-allegro-primary-channel-foundation.md`
- `docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md`
- `docs/14_prompts/PROMPT-TASK-010-allegro-primary-channel-foundation.md`
- `docs/12_validation/VAL-TASK-010-allegro-primary-channel-foundation.md`
- For W1 code: `services/allegro-service/src/scripts/lib/*`

## Files to Modify

- `TASKS.md`
- `STATE.json`
- `graph/project_graph.example.yaml`
- W1 only:
  - `services/allegro-service/src/scripts/import-checkout-forms-local.ts`
  - `services/allegro-service/src/scripts/audit-current-stock-source.ts`
  - `services/allegro-service/package.json` if build/script metadata is needed.

## Files That Must Not Be Modified

- `docs/00_constitution/CONSTITUTION.md`
- `docs/01_vision/VISION.md`
- real secret files or environment files
- sibling service databases or runtime data
- `services/allegro-service/src/scripts/import-current-allegro-stock-to-warehouse.ts`
  unless a stock owner-approved prompt explicitly opens that lane
- Warehouse, BizBox, Payments, Orders, Catalog, Auth, deployment, and Kubernetes
  write paths outside this task scope.

## Implementation Steps

1. Re-read repository instructions, master plan, mapping doc, invariants, and
   sensitive-data policy.
2. Create the TASK-010 IPS spine and graph traceability.
3. Update `TASKS.md` and `STATE.json` to show TASK-010 as the active foundation
   task.
4. Run diff hygiene and documentation audit, separating pre-existing TASK-009
   validation debt.
5. For W1, add shared script guard utilities that can describe mutation scope,
   require confirmation, summarize counts, and redact output without calling
   live mutation endpoints.
6. Convert only safe scripts first: local order projection and current stock
   audit. Do not alter or execute Warehouse apply scripts in this slice.
7. Run service build and any targeted no-mutation validation.
8. Record validation evidence in `VAL-TASK-010`.
9. Commit and push only after remote status is clean except TASK-010 changes.

## Parallel Execution

| Workstream | Status | Objective | Scope | Allowed files | Forbidden files | Expected output | Dependencies/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-010-W0 | Ready now | IPS spine and repo-state integration | Create feature/task/goal-impact/context/execution-plan/prompt/validation/graph/TASKS/STATE artifacts. | IPS docs, graph, `TASKS.md`, `STATE.json` | Runtime code, deploy files, live data paths | Complete traceability spine | None |
| TASK-010-W1 | Ready after W0 | Shared script guard framework | Create `src/scripts/lib/*`; convert safe read-only/local-only scripts. | script lib, safe scripts, service package metadata | Warehouse apply script, live mutation execution | Guard framework, stable summaries, build evidence | W0 |
| TASK-010-W2 | Dependency-gated | Additive sync/projection schema foundation | Add `AllegroSyncRun`, cursor, raw payload, audit, stock snapshot planning or schema. | `prisma/schema.prisma`, migrations, schema docs | destructive migration, data backfill apply | Additive schema and migration review | Integration owner must prevent schema races |
| TASK-010-W3 | Ready now | Validation and operations evidence | Maintain validation report and no-mutation evidence. | validation docs, reports | implementation code unless separately assigned | Gate evidence and debt classification | W0 |
| TASK-010-W4 | Blocked | Warehouse-backed stock apply | Durable quantity command attempts and owner-approved stock apply. | none in this task | Warehouse mutation, Allegro stock apply | blocked handoff only | Warehouse and stock orchestration approval is not granted for this task. |

Integration owner: current Allegro integration owner.
Validation owner: current Allegro integration owner until W3 is assigned.
Merge order: W0, W3, W1, W2, then any owner-approved write lanes.

## Test Plan

- `git diff --check`
- `npm run ips:audit`
- `npm run ips:pre-coding` when report generation is intended.
- `cd services/allegro-service && npm run build` if code changes.
- No-mutation dry-run commands only if they do not call live apply paths.

## Validation Plan

Validation succeeds when TASK-010 artifacts are traceable, diff hygiene passes,
documentation audit findings are classified correctly, code changes build, and
the validation report records that no live import and export/stock/Warehouse/BizBox
mutation was executed.

## Gate Commands

```bash
git diff --check
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
python3 scripts/deployment_readiness_gate.py --root . --target TASK-010
```

`npm run ips:audit` is expected to report pre-existing TASK-009 documentation
debt until that separate task is repaired. That debt does not block W0 unless a
TASK-010 artifact introduces a new finding.

## Documentation Updates

- Add TASK-010 IPS spine.
- Update `TASKS.md`.
- Update `STATE.json`.
- Update `graph/project_graph.example.yaml`.
- Update `docs/12_validation/VAL-TASK-010-allegro-primary-channel-foundation.md`
  with actual gate evidence before closure.

## Rollback Plan

For W0, revert the TASK-010 documentation, graph, `TASKS.md`, and `STATE.json`
changes. For W1, revert script framework files and safe script conversions. Do
not run data rollback because this task must not mutate live data.

## Agent Handoff Prompt

Worker role: implement one bounded TASK-010 slice for `allegro-service`.

Required chain: Vision -> Goal Impact -> System -> Feature -> Task -> Execution
Plan -> Coding Prompt -> Code -> Validation.

Required setup:

1. Work only in `/home/ssf/Documents/Github/allegro` on `alfares`.
2. Read the TASK-010 context package, execution plan, mapping document,
   primary-channel master plan, invariants, sensitive-data policy, and
   validation debt ledger before editing.
3. Confirm `git status --short --branch` before changes.

Allowed first slice:

- create or refine shared script guard utilities;
- convert only read-only or local-only safe scripts;
- update TASK-010 validation evidence.

Forbidden in this task:

- Chrome/browser-control;
- deploy;
- live import, export, stock, Warehouse, BizBox, Orders, Payments, Catalog, or
  Allegro mutations;
- editing the current-stock Warehouse apply script unless a separate stock-owner
  prompt approves that exact lane.

Return files changed, validation commands and results, deviations, known
validation debt, and any blocked facts without inventing missing approvals or
contracts.

## Completion Checklist

- [ ] Implementation complete
- [ ] Tests complete
- [ ] Validation evidence collected
- [ ] Documentation updated
- [ ] Deviations documented
