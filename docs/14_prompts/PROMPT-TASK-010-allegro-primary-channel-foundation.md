# PROMPT-TASK-010: Allegro Primary Channel Foundation Coding Prompt

```yaml
id: PROMPT-TASK-010-allegro-primary-channel-foundation
source_task: ../11_tasks/TASK-010-allegro-primary-channel-foundation.md
execution_plan: ../21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md
status: approved
created: 2026-06-29
last_updated: 2026-06-29
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: foundation_only_no_live_mutations
```

## Role

You are a TASK-010 worker for `allegro-service`. Preserve the chain Vision ->
Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt ->
Code -> Validation, and keep all work in the remote repository on `alfares`.

## Task

Implement the first safe Allegro primary-channel foundation slice. Start with
TASK-010 IPS traceability and then work only on guarded script framework or
additive projection groundwork. Do not run or enable live mutation flows.

## Context

- `docs/13_context_packages/CP-TASK-010-allegro-primary-channel-foundation.md`
- `docs/21_execution_plans/EP-TASK-010-allegro-primary-channel-foundation.md`
- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/orchestrator/ALLEGRO_PRIMARY_CHANNEL_IMPLEMENTATION_PLAN.md`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`
- `services/allegro-service/package.json`
- `services/allegro-service/src/scripts/*`
- `prisma/schema.prisma`

## Constraints

- Work only in `/home/ssf/Documents/Github/allegro` on `alfares`.
- Do not use Chrome/browser-control.
- Do not deploy.
- Do not run live import and export apply, Warehouse stock mutation, BizBox apply,
  Allegro stock quantity apply, central order replay apply, payment/refund
  writes, after-sale write-back, or shipment/label write-back.
- Do not commit secrets, tokens, raw production payloads, raw customer records,
  or private identifiers.
- Treat existing TASK-009 strict-audit findings as validation debt unless a
  TASK-010 change directly touches those files.

## Allowed Changes

- TASK-010 IPS docs and graph traceability.
- `TASKS.md` and `STATE.json` for TASK-010 status.
- `services/allegro-service/src/scripts/lib/*` for shared guard utilities.
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts` for
  guard-framework integration.
- `services/allegro-service/src/scripts/audit-current-stock-source.ts` for
  read-only guard-framework integration.
- Additive schema planning or schema changes only when the integration owner
  confirms no schema race exists.

## Forbidden Changes

- No Chrome/browser-control.
- No deploy.
- No live import and export apply.
- No Warehouse stock mutation.
- No BizBox/current supplier apply.
- No live Allegro stock quantity apply.
- No central order replay apply at scale.
- No payment, refund, capture, payout, settlement, return, claim, invoice,
  issue, shipment, label, or fulfillment write-back.
- Do not edit `services/allegro-service/src/scripts/import-current-allegro-stock-to-warehouse.ts`
  unless a stock-owner-approved prompt explicitly opens that lane.
- Do not commit secrets, tokens, raw production payloads, or private customer
  identifiers.

## Implementation Instructions

1. Confirm remote `git status --short --branch`.
2. Re-read TASK-010 context and execution plan.
3. Keep the first code slice small:
   - create reusable guard/run-summary/redaction utilities; or
   - convert the local order projection importer; or
   - convert the current stock audit script in read-only mode only.
4. Preserve existing CLI behavior unless the execution plan authorizes a
   stricter safety gate.
5. Emit stable no-mutation summaries from safe scripts.
6. Keep Warehouse stock apply and Allegro remote write flows blocked.
7. Update validation report with exact command evidence.
8. Commit only after validation evidence is recorded.

## Acceptance Criteria

- TASK-010 artifacts remain traceable and complete.
- Code changes, if any, build.
- Safe scripts state mutation scope explicitly.
- No live mutation path is run.
- Known TASK-009 documentation debt is not misclassified as TASK-010 failure.
- No secrets or raw production data are introduced.

## Validation Commands

```bash
git status --short --branch
git diff --check
npm run ips:audit
npm run ips:pre-coding
cd services/allegro-service && npm run build
python3 scripts/deployment_readiness_gate.py --root . --target TASK-010
```

Run only the commands relevant to files changed. If a command fails because of
pre-existing TASK-009 documentation debt, record the exact failure in
`VAL-TASK-010` and continue only if TASK-010 artifacts are not implicated.

## Validation

Validation for this prompt requires `git diff --check` and the Allegro service
build for code changes. Strict documentation audit and task readiness must be
run or explicitly classified when they fail due to known TASK-009 validation
debt. No live mutation command is part of validation for this prompt.

## Expected Output

The coding agent must return:

- Files changed.
- Tests and gates run.
- Validation evidence.
- Deviations from scope.
- Known validation debt used or created.
- Remaining blockers and unavailable facts.
