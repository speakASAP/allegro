# PROMPT-TASK-011: Catalog Canonical Content Preview Connector Coding Prompt

```yaml
id: PROMPT-TASK-011-catalog-canonical-content-preview-connector
source_task: ../11_tasks/TASK-011-catalog-canonical-content-preview-connector.md
execution_plan: ../21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md
status: approved
created: 2026-06-30
last_updated: 2026-06-30
completeness_level: complete
sensitive_data_classification: synthetic
approval_status: bounded_no_deploy
```

## Role

You are a TASK-011 worker for `allegro-service`. Preserve Vision -> Goal Impact
-> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code ->
Validation, and work only in `/home/ssf/Documents/Github/allegro` on
`alfares`.

## Task

Integrate Catalog canonical content previews into Allegro draft preparation UI
and backend without changing Allegro publish ownership.

## Context

- `docs/13_context_packages/CP-TASK-011-catalog-canonical-content-preview-connector.md`
- `docs/21_execution_plans/EP-TASK-011-catalog-canonical-content-preview-connector.md`
- `shared/clients/catalog-client.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/*`
- `services/frontend/src/pages/ProductsPage.tsx`
- `services/frontend/src/services/api.ts`

## Constraints

- Use ssh `alfares` and the remote repo only.
- Do not deploy.
- Do not edit Kubernetes secrets, Prisma migrations, or unrelated services.
- Do not move Allegro final publish ownership out of the publish lifecycle.
- Do not render or store raw preview tokens in UI text; store them only long
  enough to submit confirmation.
- Do not print secrets, tokens, service credentials, customer identifiers, or
  raw private production data.

## Allowed Changes

- Add Catalog content preview client method.
- Extend catalog-sell-action prepare/status/update/confirm product responses
  with preview evidence.
- Use generated Catalog Allegro description when the caller omits description.
- Add targeted synthetic spec coverage.
- Fix ProductsPage/API preview-token confirmation body.
- Render Catalog connector preview evidence in the draft flow.
- Update TASK-011 IPS artifacts and validation report.

## Forbidden Changes

- No deploy.
- No migration/schema edits.
- No deployment/k8s/secrets edits.
- No live Allegro publish/update/stock execution.
- No broad OffersService final payload refactor.
- No sibling service repository edits.

## Implementation Instructions

1. Confirm remote status before editing.
2. Preserve existing dirty files made by others.
3. Add the Catalog client method as an optional protected GET call.
4. Keep preview fetch failure non-fatal; fallback to existing Catalog
   description behavior.
5. Explicit request description wins over generated preview description.
6. Include source hash/version/generatedAt/fallback/warnings evidence in
   responses without exposing secrets.
7. Capture the prepare preview token in ProductsPage and send it in the confirm
   request body.
8. Run validation commands and update `VAL-TASK-011` with actual evidence.

## Acceptance Criteria

- Catalog preview method exists.
- Backend draft creation uses generated preview description only when no
  explicit description is provided.
- Backend prepare/status responses expose preview evidence.
- ProductsPage renders preview evidence and can send preview-token confirmation.
- Targeted spec and backend/frontend builds pass.
- No deploy is run.

## Validation

Validation must record command results in
`docs/12_validation/VAL-TASK-011-catalog-canonical-content-preview-connector.md`, keep
preview-token and secret material out of logs, and leave deployment for a later
owner-approved release step.

## Validation Commands

```bash
git status --short --branch
git diff --check
npm run ips:audit
npm run ips:pre-coding
npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts
cd services/allegro-service && npm run build
cd services/frontend && npm run build
```

## Expected Output

Return files changed, validation commands/results, known blockers or unavailable
facts, deployment status, and next step.

