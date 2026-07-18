# CP-TASK-007: Growth Analytics And Demand Loops Context Package

## Target task

- TASK-007
- Task document: `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
- Execution plan: `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
- Validation report: `docs/12_validation/VAL-TASK-007-validation-report.md`

## Upstream traceability

- `docs/01_vision/VISION.md`
- `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-006-growth-analytics-and-remarketing.md`
- `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Included documents

- `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
- `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
- `docs/12_validation/VAL-TASK-007-validation-report.md`
- `reports/validation/TASK-007-A-funnel-taxonomy-handoff.md`
- `reports/validation/TASK-007-B-leads-marketing-handoff.md`
- `reports/validation/TASK-007-C-digest-metrics-handoff.md`
- `reports/validation/TASK-007-D-redaction-replay-handoff.md`
- `reports/validation/TASK-007-validation-evidence.md`

## Excluded documents

- Runtime implementation files outside future approved follow-up tasks
- Real secret files, Vault-managed values, `.env` material, and production exports
- Raw customer, payment, supplier, or production log payloads

## Constraints

- TASK-007 is closed as a contract-first documentation task only.
- No runtime leads, marketing, digest-delivery, clickstream, payment/refund, cancellation, or margin-warning implementation is approved in this package.
- Future runtime work must preserve catalog, warehouse, orders, rate-limit, and sensitive-data invariants.
- Synthetic examples only; no OAuth tokens, customer identifiers, payment details, raw order payloads, or production logs.

## Agent prompt

If a later approved runtime task is opened, implement only the smallest bounded growth-event or digest slice that reuses the validated TASK-007 contract pack and does not invent downstream APIs, owners, consent rules, or economics inputs.

## Validation instructions

- Re-read `VAL-TASK-007-validation-report.md` before changing any TASK-007 artifact.
- Keep downstream runtime gaps explicit as documented in `reports/validation/TASK-007-validation-evidence.md`.
- Re-run `npm run ips:audit`, `npm run ips:pre-coding`, and `python3 scripts/deployment_readiness_gate.py --root . --target TASK-007` if TASK-007 documentation changes again.
