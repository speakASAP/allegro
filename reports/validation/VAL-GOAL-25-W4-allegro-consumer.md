# VAL-GOAL-25-W4 Allegro Consumer Validation

date: 2026-07-03
worker: Catalog Goal 25 W4C Allegro consumer validation
repository: `/home/ssf/Documents/Github/allegro`
branch: `codex/goal25-w4c-allegro-consumer-validation`
catalog_baseline: `/home/ssf/Documents/Github/catalog-microservice` `origin/main` contains `877bf98` as an ancestor
source_goal: Catalog Goal 25 product-quality review admin
policy_contract: `catalog.product_quality.v1`

## Intent Preservation Chain

Vision: Catalog remains the product truth service for identity, sellable content, pricing, media references, lifecycle, and publication readiness.

Goal Impact: Allegro listing preparation and publish confirmation must fail closed when Catalog mandatory product-quality blockers remain, before publication can proceed.

System: Catalog owns product quality/readiness; Allegro owns Allegro account readiness, local draft state, duplicate checks, rate-limit queueing, marketplace policy/compliance, and publication behavior.

Feature: Allegro catalog sell-action and governed publish lifecycle consume Catalog product-quality readiness through the existing shared Catalog client.

Task: Validate Allegro consumption of the stable Catalog product-quality blocker contract and bounded-implement only if the consumer contract is missing.

Execution Plan: Start read-only, inspect Allegro catalog client/service/preflight/publish paths, verify Catalog baseline, run focused tests, and record W4C evidence.

Coding Prompt: Do not edit Catalog or Warehouse. Do not invent Catalog fields. Use Catalog readiness/review data already available or record `[MISSING: ...]`.

Code: No Allegro runtime code changes were required. This report is the only file added in this worker branch.

Validation: Focused Allegro tests and `git diff --check` evidence are recorded below.

State Update: Allegro W4C is validated as already consuming the stable Catalog quality blocker contract through `CatalogClientService.getProductQualityPreflight`, which derives from `GET /api/products/:id/readiness`.

## Contract Evidence

- `shared/clients/catalog-client.service.ts:354` exposes `getProductReadiness(productId)` against `GET /api/products/:id/readiness`.
- `shared/clients/catalog-client.service.ts:418` exposes `getProductQualityPreflight(productId)`, derived from readiness `issues`.
- `shared/clients/catalog-client.service.ts:428` filters Catalog mandatory blocking issue codes and maps them into `blockingIssues`, `blockingMissingFields`, `canPublish`, `nextAction`, `sourceEndpoint`, and `reviewContractEndpoint`.
- The preflight contract uses `policyId: catalog.product_quality.v1`, `sourceEndpoint: GET /api/products/:id/readiness`, and `reviewContractEndpoint: GET /api/products/review/quality`.

## Allegro Consumer Evidence

- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts:62` loads the Catalog product and calls `assertCatalogQualityAllowsAllegro(...)` before creating or reusing a local Allegro draft.
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts:171` returns product status with `catalogQualityPreflight`, `nextAction: resolve_catalog_quality_blockers`, `canEditDraft: false`, and `canConfirmPublish: false` when Catalog quality blocks remain.
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts:312` throws `CATALOG_QUALITY_BLOCKED` before draft/publish actions when `canPublish !== true` or `blockingIssues` exist.
- `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts:152` rechecks quality during publish confirmation before queueing.
- `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts:412` blocks already prepared attempts if Catalog quality becomes blocked before confirmation/execution.
- `services/allegro-service/src/allegro/policy/policy-engine.service.ts:127` includes a `catalog-product-quality` policy gate while leaving Allegro-specific account, duplicate, stock, rate-limit, and local-offer gates in Allegro.

## Boundary Review

- Catalog source edits: none.
- Warehouse source edits: none.
- Deployment scripts or Kubernetes manifests: none.
- Secrets or production data mutation: none.
- Allegro-specific ownership preserved: account readiness, duplicate checks, local offer quality, stock gate, rate-limit queueing, preview token confirmation, and Allegro publication stay in Allegro.
- Catalog fields invented: none. The consumer uses the existing readiness-derived preflight contract.

## Validation Commands

```bash
ssh alfares 'cd /home/ssf/Documents/Github/catalog-microservice && git merge-base --is-ancestor 877bf98 origin/main; echo CATALOG_877BF98_ANCESTOR_OF_ORIGIN_MAIN=$?'
# CATALOG_877BF98_ANCESTOR_OF_ORIGIN_MAIN=0

ssh alfares 'cd /home/ssf/Documents/Github/allegro && LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts'
# catalog-sell-action.spec: PASS

ssh alfares 'cd /home/ssf/Documents/Github/allegro && LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/policy/policy-engine.spec.ts'
# policy-engine.spec: PASS

ssh alfares 'cd /home/ssf/Documents/Github/allegro && LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts'
# publish-lifecycle.update-terminal.spec: PASS

ssh alfares 'cd /home/ssf/Documents/Github/allegro/services/allegro-service && LOGGING_SERVICE_URL=http://logging-microservice:3367 npm run build'
# > allegro-service@1.0.0 build
# > tsc && tsc-alias

ssh alfares 'cd /home/ssf/Documents/Github/allegro && git diff --check'
# PASS: no output
```

## Blockers

None for the bounded W4C Allegro consumer validation.

## Conclusion

Allegro already blocks or surfaces Catalog mandatory product-quality blockers before draft preparation and publish confirmation. The existing implementation fails closed when Catalog quality readiness is unavailable and keeps Allegro marketplace policy/compliance ownership inside Allegro. No bounded runtime code implementation was necessary for W4C.
