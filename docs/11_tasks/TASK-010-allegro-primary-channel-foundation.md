# TASK-010: Allegro Primary Channel Foundation

```yaml
id: TASK-010
status: approved
owner: Allegro Integration Owner
created: 2026-06-29
last_updated: 2026-06-29
completeness_level: complete
upstream:
  - ../10_features/FEAT-010-allegro-primary-channel-foundation.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-010.md
execution_plan:
  - ../21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md
```

## Objective

Implement the first safe foundation for making Allegro the primary sales channel
by creating the IPS spine for follow-up work and opening the first bounded
implementation lane: guarded script framework and additive sync/projection
groundwork. This task must not run live imports, exports, stock applies,
Warehouse mutations, BizBox applies, or production deploys.

## Upstream Links

- [docs/04_systems/SYS-001-allegro-marketplace-integration.md](../04_systems/SYS-001-allegro-marketplace-integration.md)
- [docs/10_features/FEAT-010-allegro-primary-channel-foundation.md](../10_features/FEAT-010-allegro-primary-channel-foundation.md)
- [docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md](../docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md)
- [docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md](../docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md)
- [docs/16_operations/INTEGRATIONS.md](../16_operations/INTEGRATIONS.md)
- [docs/17_governance/PROJECT_INVARIANTS.md](../17_governance/PROJECT_INVARIANTS.md)

## Goal Impact

This task converts the Allegro mapping and primary-channel plan into actionable
implementation lanes. It lowers operational risk by making import and export scripts
use a common safety contract and by making future schema/projection work
traceable before any new apply path is used.

## Project Invariant Impact

- ALG-INV-001: Offer-changing code remains gated by Catalog validation and the
  publish lifecycle.
- ALG-INV-002: Allegro API calls remain account-aware and rate-limit sensitive.
- ALG-INV-003: Orders remain owned by orders-microservice; local order
  projections are not central order ownership.
- ALG-INV-004: Secrets, OAuth tokens, customer data, and raw production payloads
  must not be added to docs, tests, logs, prompts, or reports.
- ALG-INV-005: Runtime service boundaries remain unchanged unless a separate ADR
  approves a change.
- ALG-INV-006: Implementation work must trace through vision, feature, task,
  execution plan, prompt, code, and validation.
- ALG-INV-007: Validation evidence must exist before task closure or deploy.

## Sensitive-Data Classification

Classification: synthetic.

TASK-010 may inspect source files and synthetic validation output. It must not
store raw Allegro buyer data, raw order payloads, raw production stock exports,
OAuth tokens, Authorization headers, service tokens, database credentials,
customer identifiers, phone numbers, email addresses, or screenshots of
production data.

## Contract/Schema Impact

This task creates a feature/task/prompt/validation contract for Allegro
primary-channel foundation work. The first implementation lane may add a shared
script guard framework. Additive Prisma schema changes for sync runs, cursors,
raw payloads, projection audit logs, stock snapshots, and command attempts are
planned here but should be implemented only when the schema lane is owned by the
integration owner and reviewed against compatibility risks.

## Replay/Determinism Impact

Replay and determinism are central to TASK-010. Script dry-runs must emit stable
mode, mutation, account, input-hash, count, warning, and blocker summaries.
Future apply paths must be preview-token-bound and idempotent. Order forwarding,
stock commands, and remote Allegro writes must be replay-safe before production
use.

## Scope

- Create the TASK-010 IPS spine.
- Define the first code lane for shared script guard utilities.
- Preserve the existing Allegro mapping and primary-channel plan as required
  context.
- Classify current script surfaces as safe, unsafe, or owner-gated.
- Prepare additive sync/projection schema work for a later integration-owned
  lane.
- Keep Warehouse stock apply, BizBox apply, Allegro remote writes, central order
  replay apply, and payments/refunds/shipments write-back blocked unless a
  separate owner-approved prompt authorizes them.

## Non-Goals

- No live Allegro import or export.
- No BizBox/current supplier apply.
- No Warehouse stock mutation.
- No live Allegro stock quantity apply.
- No deploy.
- No browser or Chrome control.
- No direct sibling service database writes.
- No refund, capture, payout, settlement, return, claim, invoice, issue, label,
  or shipment write-back.
- No broad refactor outside the approved files in the execution plan.

## Acceptance Criteria

- [ ] TASK-010 IPS spine exists and links feature, task, goal-impact, context,
  execution plan, prompt, validation report, graph nodes, `TASKS.md`, and
  `STATE.json`.
- [ ] The first implementation slice is limited to guarded script foundation or
  additive schema groundwork.
- [ ] Existing stock/Warehouse import scripts are not executed.
- [ ] Validation separates current-task evidence from pre-existing TASK-009
  documentation debt.
- [ ] `git diff --check` passes for TASK-010 changes.
- [ ] Service build or targeted validation is run when code changes are made.
- [ ] No secrets, raw customer data, raw production payloads, or private
  identifiers are added.

## Required Context

- `AGENTS.md`
- `/home/ssf/.codex/AGENTS.md`
- `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- `AGENT_OPERATIONS.md`
- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `services/allegro-service/package.json`
- `services/allegro-service/src/scripts/*`
- `prisma/schema.prisma`

## Validation Task

Validate that TASK-010 opens a safe implementation path without enabling live
mutations. For docs-only changes, run strict diff hygiene and documentation
audit. For code changes, run the Allegro service build and any targeted
script-framework tests or dry-run commands that do not call live mutation paths.

## Required Gates

- `git diff --check`
- `npm run ips:audit`
- `npm run ips:pre-coding` when the task spine is intended to generate report
  output.
- `cd services/allegro-service && npm run build` for code changes.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`
  before closure or deploy readiness claims.

## Execution Plan Requirement

This task may be converted into a coding prompt only through
`docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md` and
`docs/14_prompts/PROMPT-TASK-010-allegro-primary-channel-foundation.md`. Any worker
must obey the allowed files, forbidden actions, validation commands, and owner
gates in those artifacts.
