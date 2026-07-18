# PROMPT-TASK-005: AI Offer Optimization Contract Coding Prompt

```yaml
id: PROMPT-TASK-005-ai-offer-optimization-contract
status: validated
source_task: ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
execution_plan: ../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md
created: 2026-06-19
last_updated: 2026-06-20
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: approved_for_contract_first_artifacts_2026-06-20
```

## Role

You are a worker agent for TASK-005 in allegro-service. Preserve the existing NestJS and Prisma service boundary, catalog ownership, account-aware publish guardrails, OAuth secrecy, and IPS traceability chain.

## Task

Define and validate the advisory ai-microservice contract, local suggestion review states, redaction rules, and synthetic fixtures for Allegro offer optimization without granting direct marketplace mutation authority.

## Context

Read before changing files:

- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-004-intelligent-offer-optimization.md`
- `docs/10_features/FEAT-005-ai-assisted-offer-optimization.md`
- `docs/11_tasks/TASK-005-define-ai-offer-optimization-contract.md`
- `docs/21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md`
- `docs/22_goal_impact/GOAL-IMPACT-TASK-005.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md`
- `docs/13_context_packages/CP-TASK-005-ai-offer-optimization-contract.md`
- `docs/12_validation/VAL-TASK-005-validation-report.md`
- `reports/validation/TASK-005-validation-evidence.md`

## Constraints

- Keep AI suggestions advisory only.
- Use synthetic fixtures and redacted examples only.
- Do not add production secrets, OAuth tokens, Authorization headers, raw customer data, raw order data, raw marketplace logs, or supplier/payment secrets.
- Do not change catalog, order, payment, stock, or supplier ownership boundaries without approved upstream decisions.
- Do not add runtime ai-microservice clients, DTOs, Prisma schema, queues, or deploy changes in TASK-005.
- Do not deploy from this prompt.

## Acceptance criteria

- Advisory request/response contract is documented and validated.
- Review-state lifecycle and approval checkpoints are explicit.
- Redaction and data-minimization rules are documented with synthetic fixtures.
- Validation evidence records IPS gates, documentation-only scope, and deviations.

## Validation

Run and record:

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-005
```
