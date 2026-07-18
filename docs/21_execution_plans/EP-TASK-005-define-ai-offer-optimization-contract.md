# EP-TASK-005: AI Offer Optimization Contract Execution Plan

```yaml
id: EP-TASK-005
status: validated
source_task: ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-20
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-005-ai-assisted-offer-optimization.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-005.md
```

## Metadata

- Source task: ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
- Status: approved for contract-first implementation by owner instruction on 2026-06-20.
- Lifecycle state: implemented and validated for TASK-005 closure on 2026-06-20.

## Upstream Traceability

- Constitution: ../00_constitution/CONSTITUTION.md
- Vision: ../01_vision/VISION.md
- Business case: ../02_business_case/BUSINESS_CASE.md
- Roadmap: ../08_roadmap/ROADMAP.md
- Feature: ../10_features/FEAT-005-ai-assisted-offer-optimization.md
- Goal impact: ../22_goal_impact/GOAL-IMPACT-TASK-005.md

## Goal Impact

Define a redacted ai-microservice contract for draft-only listing recommendations and review states. This supports the revenue roadmap by improving conversion readiness, operator speed, rollback safety, and measurable listing-quality experiments without bypassing publish controls.

## Project Invariants

- ALG-INV-001: Preserve catalog validation before offer mutation where offer data is affected.
- ALG-INV-002: Preserve Allegro account-aware rate limits for API work.
- ALG-INV-003: Preserve orders-microservice as order owner where orders are affected.
- ALG-INV-004: Keep secrets, OAuth tokens, customer data, and raw production logs out of code, docs, tests, prompts, and reports.
- ALG-INV-005: Create ADR before changing runtime ownership boundaries.
- ALG-INV-006: Maintain traceability before coding.
- ALG-INV-007: Collect validation evidence before closure.

## Sensitive-Data Handling

Classification: synthetic. Use synthetic products, offers, accounts, quality metrics, and suggestion examples in documentation and validation artifacts. Redact authorization headers, OAuth tokens, client secrets, customer identifiers, payment details, raw order data, and production logs.

## Contract Validation Plan

Document the advisory request/response payload, local suggestion record, review states, policy/lifecycle handoff, and redaction profile before any runtime DTO, queue, Prisma, or client implementation is approved. Validate the contract with synthetic fixtures in repo-controlled artifacts and record evidence under 12_validation and reports/validation.

## Replay/Determinism Plan

The AI response itself may vary, but every stored suggestion must preserve a deterministic input snapshot hash, contract version, correlation id, account id, and review status. Future apply flows must route approved changes through the existing publish lifecycle with idempotency keys instead of allowing direct mutation from AI output.

## Scope

Approve and document the advisory ai-microservice contract, local suggestion record design, redaction rules, review states, approval path, metrics, and rollback notes.

## Non-Goals

- Do not modify protected vision or constitution files.
- Do not add production secrets, raw customer data, raw order data, or OAuth tokens.
- Do not change service ownership boundaries without ADR.
- Do not add runtime ai-microservice clients, DTOs, workers, queues, Prisma models, or publish execution behavior in TASK-005.

## Files to Inspect

- docs/08_roadmap/ROADMAP.md
- docs/09_milestones/MS-004-intelligent-offer-optimization.md
- docs/10_features/FEAT-005-ai-assisted-offer-optimization.md
- docs/16_operations/INTEGRATIONS.md
- docs/17_governance/PROJECT_INVARIANTS.md
- docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md
- services/allegro-service/src/allegro/publish-lifecycle/
- services/allegro-service/src/allegro/policy/

## Files to Create

- docs/16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md
- docs/12_validation/VAL-TASK-005-validation-report.md
- reports/validation/TASK-005-validation-evidence.md

## Files to Modify

- docs/11_tasks/TASK-005-define-ai-offer-optimization-contract.md
- docs/13_context_packages/CP-TASK-005-ai-offer-optimization-contract.md
- docs/14_prompts/PROMPT-TASK-005-ai-offer-optimization-contract.md
- docs/16_operations/INTEGRATIONS.md
- docs/21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md
- docs/22_goal_impact/GOAL-IMPACT-TASK-005.md
- TASKS.md
- STATE.json
- graph/project_graph.example.yaml

## Files That Must Not Be Modified

- docs/00_constitution/CONSTITUTION.md
- docs/01_vision/VISION.md
- Real production secret files or Vault-managed values
- Runtime ai-microservice client code, Prisma schema, or queue workers in this task
- Unrelated service modules outside the task scope

## Implementation Steps

1. Re-read roadmap Stage 3, FEAT-005, TASK-005, invariants, and integrations.
2. Define the smallest advisory request/response contract that keeps suggestions draft-only and policy-confirmed.
3. Define the local suggestion review-state and record design without committing to runtime schema changes.
4. Add synthetic fixtures and redaction examples for request, response, and future apply payloads.
5. Update the blocked prompt/context artifacts so the IPS chain reflects approved contract-first completion.
6. Run the IPS gates and record validation evidence.

## Parallel Execution

TASK-005 stayed single-owned in this run because the contract wording, validation report, prompt/context package, graph edges, TASKS.md, and STATE.json all converge on the same shared semantics. Splitting those files across concurrent workers would create avoidable merge risk without meaningful throughput gain.

- Integration owner: TASK-005 orchestrator lane.
- Validation owner: TASK-005 orchestrator lane.
- Merge order: single lane only.
- Shared files/contracts: AI contract wording, review-state names, validation report, prompt/context package, TASKS.md, STATE.json, and graph/project_graph.example.yaml.

## Test Plan

- Run npm run ips:audit.
- Run npm run ips:pre-coding.
- Run python3 scripts/deployment_readiness_gate.py --root . --target TASK-005.

## Validation Plan

Validation succeeds when the approved contract, synthetic fixtures, prompt/context package, and redaction guidance are present; IPS gates pass; and the validation report records why no runtime code was needed for TASK-005 closure.

## Gate Commands

```bash
npm run ips:audit
npm run ips:pre-coding
python3 scripts/deployment_readiness_gate.py --root . --target TASK-005
```

## Documentation Updates

Update the source task, goal-impact record, validation report, context package, coding prompt, TASKS.md, STATE.json, and graph when implementation status changes. Update docs/16_operations/INTEGRATIONS.md when the approved advisory AI contract becomes part of the operating map.

## Rollback Plan

Revert the TASK-005 documentation-only artifacts and state updates. No runtime rollback is required because TASK-005 does not introduce runtime clients, schema, workers, or deployable behavior.

## Agent Handoff Prompt

Implement TASK-005 as a contract-first documentation task only. Define the advisory ai-microservice request/response contract, local review-state model, and synthetic fixtures. Keep AI suggestions draft-only, preserve policy/lifecycle ownership, and do not add runtime clients or deployment changes.

## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
