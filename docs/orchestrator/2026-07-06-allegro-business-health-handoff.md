# Allegro Business Health Channel Readback Handoff

Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation

## Vision

Business health for the stock-order-marketplace process must prove that marketplace listings do not remain sellable when Catalog or Warehouse authority says they are unavailable.

## Goal Impact

Allegro contributes a service-owned read-only evidence envelope to the shared business-health chain. The envelope proves source ownership and contract boundaries, while keeping live Allegro readback, stock sync, order import, provider calls, and reconciliation mutations blocked until an owner-approved runtime packet exists.

## System

- Repository: `/home/ssf/Documents/Github/allegro`
- Service: `services/allegro-service`
- Endpoint: `GET /allegro/business-health/channel-readback`
- Contract id: `allegro.channel_readback_business_health.v1`
- Business process contract: `stock-order-marketplace-business-health.v1`

## Feature

Expose a source-only channel readback and availability convergence envelope that BPCP can aggregate with Warehouse, Catalog, Orders, Suppliers, Aukro, and Heureka evidence.

## Task

Add a Nest read-only `business-health` module, document the handoff, and add a verifier that prevents accidental live Allegro/provider, DB, Warehouse, Catalog, Orders, stock sync, offer import, order import, or mutation calls in this envelope.

## Execution Plan

1. Add `services/allegro-service/src/business-health/**`.
2. Wire `BusinessHealthModule` into `services/allegro-service/src/app.module.ts`.
3. Add `scripts/verify-business-health-allegro-channel-contract.js`.
4. Add `verify:business-health-allegro-channel-contract` to root `package.json`.
5. Validate source-only contract and service build.

## Coding Prompt

Implement Allegro service-owned read-only business-health evidence envelope for marketplace/channel readback and availability convergence. Do not run live Allegro/provider calls, offer import, stock sync, order import, marketplace mutation, DB query/mutation, deploy, or secret/env changes.

## Code

- `services/allegro-service/src/business-health/business-health.controller.ts`
- `services/allegro-service/src/business-health/business-health.module.ts`
- `services/allegro-service/src/business-health/business-health.service.ts`
- `services/allegro-service/src/business-health/business-health.types.ts`
- `services/allegro-service/src/app.module.ts`
- `scripts/verify-business-health-allegro-channel-contract.js`

## Validation

- `npm run verify:business-health-allegro-channel-contract`
- `npm --prefix services/allegro-service run build`
- `git diff --check`

## Runtime Boundary

No live Allegro/provider calls were added or authorized. No offer/listing/import create/update/delete, stock sync, order import, marketplace mutation, Warehouse/Catalog/Orders calls, DB query/mutation, deploy, or secrets/env changes are part of this lane.

## Blockers

- `[MISSING: approved live Allegro readback packet]`
- `[MISSING: target product/offer/account for Allegro channel readback proof]`
- `[MISSING: Allegro provider/rate-limit/reconciliation policy for live readback cadence and account scope]`
- `[MISSING: approved reconciliation rule that maps Warehouse/Catalog availability to Allegro sellable quantity without provider mutation side effects]`
