# CP-TASK-010: Allegro Primary Channel Foundation Context Package

## Target task

- TASK-010
- Task document: `docs/11_tasks/TASK-010-allegro-primary-channel-foundation.md`
- Feature: `docs/10_features/FEAT-010-allegro-primary-channel-foundation.md`
- Execution plan: `docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md`
- Validation report: `docs/12_validation/VAL-TASK-010-allegro-primary-channel-foundation.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
- `docs/10_features/FEAT-010-allegro-primary-channel-foundation.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-010.md`
- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Included documents

- `AGENTS.md`
- `AGENT_OPERATIONS.md`
- `TASKS.md`
- `STATE.json`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `docs/11_tasks/TASK-010-allegro-primary-channel-foundation.md`
- `docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md`
- `docs/14_prompts/PROMPT-TASK-010-allegro-primary-channel-foundation.md`
- `docs/12_validation/VAL-TASK-010-allegro-primary-channel-foundation.md`
- `services/allegro-service/package.json`
- `services/allegro-service/src/scripts/audit-current-stock-source.ts`
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts`
- `services/allegro-service/src/scripts/import-order-offer-products.ts`
- `services/allegro-service/src/scripts/import-allegro-offers-to-catalog.ts`
- `services/allegro-service/src/scripts/import-current-allegro-stock-to-warehouse.ts`
- `prisma/schema.prisma`

## Excluded documents

- Real secret files, Vault-managed values, environment files, token values,
  production exports, raw customer records, raw order payloads, raw payment
  payloads, and unmasked screenshots.
- Sibling service implementation files unless a later approved lane explicitly
  owns a public contract check.
- Runtime apply output from Warehouse, BizBox, Allegro, Orders, Payments, or
  Catalog mutation endpoints.

## Constraints

These constraints are active for every TASK-010 worker and are not optional
guidance.

- Work in the remote repository only.
- Do not use Chrome/browser-control.
- Do not run live import and export/stock mutations.
- Do not run the current-stock Warehouse import apply path.
- Do not mutate Warehouse stock or BizBox/current supplier data.
- Do not forward central orders at scale.
- Do not perform Allegro publish, update, activation, stock command, refund,
  invoice, issue, return, claim, fulfillment, or shipment write-back.
- Keep unavailable facts explicit and do not invent missing contracts,
  approvals, source evidence, or validation results.
- Treat pre-existing TASK-009 documentation audit failures as validation debt
  unless TASK-010 changes introduce or touch the failing artifact.

## Agent prompt

Implement the smallest TASK-010 slice allowed by the execution plan. Preserve
Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding
Prompt -> Code -> Validation. Start with guarded script framework and additive
projection groundwork only. Do not execute live mutation paths. Return files
changed, validation evidence, deviations, and blockers.

## Validation instructions

- Run `git status --short --branch` before and after.
- Run `git diff --check` before commit.
- Run `npm run ips:audit` and classify pre-existing TASK-009 audit debt
  separately from TASK-010 findings.
- For code changes under `services/allegro-service`, run
  `cd services/allegro-service && npm run build`.
- Do not claim deploy readiness until
  `python3 scripts/deployment_readiness_gate.py --root . --target TASK-010`
  passes or its blocker is documented.
