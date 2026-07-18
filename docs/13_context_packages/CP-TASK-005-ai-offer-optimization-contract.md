# CP-TASK-005: AI Offer Optimization Contract Context Package

```yaml
id: CP-TASK-005
status: validated
source_task: ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
execution_plan: ../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md
coding_prompt: ../14_prompts/PROMPT-TASK-005-ai-offer-optimization-contract.md
created: 2026-06-19
last_updated: 2026-06-20
completeness_level: complete
sensitive_data_classification: synthetic
```

## Target task

TASK-005: `../11_tasks/TASK-005-define-ai-offer-optimization-contract.md` - define the ai-microservice contract, redaction rules, review states, approval path, and synthetic fixtures for advisory Allegro offer suggestions.

## Upstream traceability

- Roadmap: `../08_roadmap/ROADMAP.md`
- Feature: `../10_features/FEAT-005-ai-assisted-offer-optimization.md`
- Task: `../11_tasks/TASK-005-define-ai-offer-optimization-contract.md`
- Execution plan: `../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-005.md`
- Validation report: `../12_validation/VAL-TASK-005-validation-report.md`
- Contract document: `../16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md`
- Coding prompt: `../14_prompts/PROMPT-TASK-005-ai-offer-optimization-contract.md`

## Included documents

- `../08_roadmap/ROADMAP.md`
- `../09_milestones/MS-004-intelligent-offer-optimization.md`
- `../10_features/FEAT-005-ai-assisted-offer-optimization.md`
- `../11_tasks/TASK-005-define-ai-offer-optimization-contract.md`
- `../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md`
- `../22_goal_impact/GOAL-IMPACT-TASK-005.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `../16_operations/INTEGRATIONS.md`
- `../16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md`
- `../12_validation/VAL-TASK-005-validation-report.md`
- `../reports/validation/TASK-005-validation-evidence.md`
- `../14_prompts/PROMPT-TASK-005-ai-offer-optimization-contract.md`

## Excluded documents

- Protected constitution and vision source text beyond traceability references.
- Raw production marketplace payloads, OAuth tokens, secrets, customer data, order data, and production logs.
- Runtime DTO, Prisma, queue-worker, and publish-execution implementation files because TASK-005 closes as a contract-first documentation task.

## Constraints

- AI suggestions remain advisory only.
- No autonomous publish, no direct Allegro mutation, and no unreviewed price changes.
- Synthetic fixtures only.
- Preserve catalog ownership, orders ownership, and current service boundaries.
- Do not add runtime ai-microservice client code or deployment changes in TASK-005.

## Agent prompt

Use `../14_prompts/PROMPT-TASK-005-ai-offer-optimization-contract.md` to implement or revise the contract-first artifacts only. Do not use it to add runtime client, queue, Prisma, or deploy changes.

## Validation instructions

Run IPS audit, pre-coding gate, and deployment-readiness gate for the documentation artifacts. Record evidence in `../12_validation/VAL-TASK-005-validation-report.md`.
