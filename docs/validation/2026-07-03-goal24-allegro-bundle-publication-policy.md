# Goal 24 Allegro Bundle Publication Policy Validation

Date: 2026-07-03
Repository: `/home/ssf/Documents/Github/allegro`
Branch: `goal24-allegro-bundle-publication-policy`

## Intent Preservation Chain

Vision -> Related-product evidence can prepare future bundle surfaces without unsafe external marketplace publication.
Goal Impact -> Allegro now has a channel-specific answer for Catalog `catalog.bundle.v1`: keep it blocked for external offer/listing publication until a real one-listing bundle contract exists.
System -> Catalog owns `catalog.bundle.v1` bundle definitions; Allegro owns local marketplace draft/publish policy; Orders, Warehouse, Payments, and shipping policy owners must approve real bundle commerce before external sale.
Feature -> Allegro Catalog bundle publication policy gate.
Task -> Resolve the Allegro-owned part of `[MISSING: Allegro-owned catalog.bundle.v1 external publication policy handoff]`.
Execution Plan -> Allegro docs/source-policy/verifier only; no live Allegro publish/confirm/update, no provider mutation, no Catalog/Orders/Warehouse/Payments/Kubernetes edits.
Coding Prompt -> Fail closed when Catalog readiness/preflight identifies `catalog.bundle.v1` or bundle target metadata; preserve ordinary product publication behavior.
Code -> `CatalogSellActionService` blocks bundle draft creation, draft edit, product confirm, and status actions; `MarketplacePolicyEngineService` adds `catalog-bundle-publication-policy` for direct lifecycle attempts; this handoff status update changes documentation only.
Validation -> focused catalog sell-action spec, focused policy-engine spec, service build, and `git diff --check`.
State Update -> Allegro-owned policy is explicit: `catalog.bundle.v1` is not publishable as one external Allegro offer/listing under current contracts.

## Policy Decision

Allegro must not publish a Catalog `catalog.bundle.v1` bundle as a single external Allegro offer/listing unless an owner-approved channel contract exists for all of the following:

- Allegro one-listing bundle representation for `catalog.bundle.v1`.
- Warehouse bundle reservation and stock allocation.
- Orders bundle create-order and line-item decomposition.
- Payments, discount, free-shipping, and final total handling.
- Shipping policy semantics for a multi-item external marketplace bundle.

Until those contracts exist, Allegro may treat Catalog bundles only as operator suggestions or local review evidence. Runtime publication remains blocked.

## Catalog Goal 24 Handoff Mapping

This Allegro-owned policy resolves/narrows Catalog's channel matrix blocker:

- `[RESOLVED/NARROWED: Allegro-owned catalog.bundle.v1 external publication policy handoff recorded as fail-closed in Allegro docs/status]`

It does not approve external publication. The current Allegro answer is fail-closed: `catalog.bundle.v1` bundles may not be published, queued, regenerated, confirmed, mutated, synced, or converted into one external Allegro offer/listing. Any future relaxation requires an owner-approved Allegro implementation contract plus the downstream commerce contracts listed below.

Allowed current use is limited to operator suggestion, preview, local review evidence, or draft assistance that keeps publication at component-product level and does not mutate external marketplace state for the bundle aggregate.

## Source Gates

| Surface | Result |
| --- | --- |
| Catalog sell-action prepare | Blocks before local Allegro draft creation when Catalog preflight/target metadata identifies `catalog.bundle.v1` or `bundle`. |
| Product status | Surfaces `resolve_allegro_bundle_publication_policy`, disables edit and confirm actions for blocked bundle targets. |
| Product draft edit | Rechecks the bundle policy and blocks local draft edits that would support external publication. |
| Product confirm | Rechecks the bundle policy before queueing publication. |
| Direct publish lifecycle policy | Adds `catalog-bundle-publication-policy` and blocks direct governed lifecycle attempts for `catalog.bundle.v1`. |

## Remaining Blockers

- `[MISSING: Allegro one-listing bundle representation contract for catalog.bundle.v1]`
- `[MISSING: Warehouse bundle reservation/stock allocation contract]`
- `[MISSING: Orders bundle create-order and line-item decomposition contract]`
- `[MISSING: Payments/free-shipping/discount total contract]`
- `[MISSING: owner-approved shipping policy semantics for external marketplace bundles]`

## Validation Evidence

Final validation commands in this branch:

- `NODE_PATH=/home/ssf/Documents/Github/allegro/services/allegro-service/node_modules:/home/ssf/Documents/Github/allegro/node_modules TS_NODE_TRANSPILE_ONLY=1 LOGGING_SERVICE_URL=http://logging-microservice:3367 /home/ssf/Documents/Github/allegro/services/allegro-service/node_modules/.bin/ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`: PASS (`catalog-sell-action.spec: PASS`).
- `NODE_PATH=/home/ssf/Documents/Github/allegro/services/allegro-service/node_modules:/home/ssf/Documents/Github/allegro/node_modules TS_NODE_TRANSPILE_ONLY=1 LOGGING_SERVICE_URL=http://logging-microservice:3367 /home/ssf/Documents/Github/allegro/services/allegro-service/node_modules/.bin/ts-node services/allegro-service/src/allegro/policy/policy-engine.spec.ts`: PASS (`policy-engine.spec: PASS`).
- `cd services/allegro-service && LOGGING_SERVICE_URL=http://logging-microservice:3367 npm run build`: PASS (`tsc && tsc-alias`).
- `git diff --check`: PASS.

## Handoff Refresh Validation

Current branch validation for the docs/status handoff refresh:

- `git diff --check`: PASS.
- Targeted source-gate presence check for `CATALOG_BUNDLE_CONTRACT`, `catalog-bundle-publication-policy`, `catalog_bundle_external_publication_not_approved`, and `resolve_allegro_bundle_publication_policy`: PASS.
- `NODE_PATH=/home/ssf/Documents/Github/allegro/services/allegro-service/node_modules:/home/ssf/Documents/Github/allegro/node_modules TS_NODE_TRANSPILE_ONLY=1 LOGGING_SERVICE_URL=http://logging-microservice:3367 /home/ssf/Documents/Github/allegro/services/allegro-service/node_modules/.bin/ts-node services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.spec.ts`: PASS (`catalog-sell-action.spec: PASS`).
- `NODE_PATH=/home/ssf/Documents/Github/allegro/services/allegro-service/node_modules:/home/ssf/Documents/Github/allegro/node_modules TS_NODE_TRANSPILE_ONLY=1 LOGGING_SERVICE_URL=http://logging-microservice:3367 /home/ssf/Documents/Github/allegro/services/allegro-service/node_modules/.bin/ts-node services/allegro-service/src/allegro/policy/policy-engine.spec.ts`: PASS (`policy-engine.spec: PASS`).

No build was rerun in this docs/status handoff branch because runtime source was unchanged and the isolated worktree does not carry its own dependency install; prior source branch build evidence remains listed above.

## Integration Handoff

- No live Allegro publish, confirm, update, provider call, deploy, migration, queue write, or marketplace mutation was performed.
- Catalog/Orders/Warehouse/Payments owners must approve the missing contracts before this Allegro policy can be relaxed.
- This resolves/narrows only `[MISSING: Allegro-owned catalog.bundle.v1 external publication policy handoff]`; other channel policies remain owned by their repos.
