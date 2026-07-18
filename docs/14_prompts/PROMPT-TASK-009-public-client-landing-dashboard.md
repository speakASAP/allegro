# PROMPT-TASK-009: Public Client Landing And Dashboard Coding Prompt

```yaml
id: PROMPT-TASK-009-public-client-landing-dashboard
status: validated
source_task: ../11_tasks/TASK-009-public-client-landing-dashboard.md
execution_plan: ../21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md
context_package: ../13_context_packages/CP-TASK-009-public-client-landing-dashboard.md
created: 2026-06-29
last_updated: 2026-06-29
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: implementation_live_validated
```

## Role

You are a worker agent for TASK-009 in allegro-service. Preserve the customer-visible Allegro landing and registered-client dashboard while keeping Catalog validation, Auth, OAuth readiness, account readiness, rate-limit ownership, explicit publish confirmation, and sensitive-data boundaries intact.

## Task

Use this prompt as the preserved traceability artifact for the already implemented TASK-009 public client UI and runtime serving work. Do not start new runtime changes from this prompt. Any follow-up to product behavior, Auth, Catalog integration, publish lifecycle, deployment, or smoke coverage must start from a new bounded task and execution plan.

## Context

Read before changing TASK-009 artifacts:

- `docs/01_vision/VISION.md`
- `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-003-catalog-to-allegro-conversion-engine.md`
- `docs/10_features/FEAT-004-catalog-sell-on-allegro-action.md`
- `docs/10_features/FEAT-009-public-client-ui.md`
- `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`
- `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-009.md`
- `docs/13_context_packages/CP-TASK-009-public-client-landing-dashboard.md`
- `docs/12_validation/VAL-TASK-009-public-client-landing-dashboard.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Constraints

- No autonomous publishing or backend publish bypass.
- No secret, OAuth token, JWT, Authorization header, customer identifier, payment detail, raw order payload, or raw production log disclosure.
- No Warehouse, Catalog, Allegro offer, stock, order, or account mutation from this prompt.
- No rewrite of Auth, Catalog, API gateway, Kubernetes, or deploy contracts without a new approved task.
- External Bazos implementation-goal files are reference material only, not local IPS artifacts.

## Acceptance criteria

- TASK-009 remains traceable from FEAT-009 and GOAL-IMPACT-TASK-009 through EP-TASK-009, this prompt, the implemented frontend/runtime code, and VAL-TASK-009.
- Public landing, login/register SPA routes, dashboard, dashboard products route, backend health, and API gateway health evidence remains documented without secrets.
- Guarded draft prepare/status/edit/confirm semantics remain explicit and separated in the UI record.
- Any unresolved follow-up is documented as a new task rather than hidden inside TASK-009.

## Validation

Run and record if TASK-009 documentation changes again:

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-009
```
