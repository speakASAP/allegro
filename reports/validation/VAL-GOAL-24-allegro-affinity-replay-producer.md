# Goal 24 Allegro Affinity Replay Producer Validation

Date: 2026-07-03

Intent Preservation Chain: Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation -> State Update.

- Vision: Allegro marketplace purchase history can improve related-product surfaces without leaking buyer, address, payment provider, or raw marketplace payload data.
- Goal Impact: the temporary `/tmp` Allegro affinity export can be replaced by an Allegro-owned protected replay producer.
- System: Allegro owns local order projections and replay production; Marketing owns aggregation; Catalog owns relation persistence.
- Feature: protected internal `GET /internal/allegro/order-affinity/replay-candidates`.
- Task: return bounded marketplace replay envelopes for paid `READY_FOR_PROCESSING` orders with at least two distinct mapped Catalog products.
- Execution Plan: source/test/docs only; no deployment, runtime data mutation, marketplace publication, central Orders write, Warehouse write, or Payments write.
- Coding Prompt: hash local marketplace order refs and emit only Catalog product item snapshots.
- Code: `services/allegro-service/src/allegro/orders/orders.service.ts`, `orders.controller.ts`, `orders.service.spec.ts`, `allegro.module.ts`, and status docs.
- Validation: commands below.
- State Update: W1 Allegro replay producer is source-complete and ready for Marketing dry-run integration after branch merge/deploy decisions.

## Validation Evidence

```bash
LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts
```

Result: passed, `orders.service.spec: PASS`.

```bash
cd services/allegro-service && LOGGING_SERVICE_URL=http://logging-microservice:3367 npm run build
```

Result: passed, `tsc && tsc-alias`.

```bash
git diff --check
```

Result: passed for the Allegro worktree.

## Boundaries

- No deployment was run.
- No live DB query or mutation was run.
- No central Orders, Warehouse, Payments, Catalog, marketplace listing, or publication mutation was run.
- No customer, buyer, address, payment provider, token, credential, raw payload, or secret value was printed.

## Remaining Blockers

- `[MISSING: runtime Marketing-to-Allegro internal replay token mapping confirmation]`
- `[MISSING: owner-approved deploy/runtime smoke window for Allegro replay endpoint]`
- `[MISSING: durable Marketing backfill run ledger and idempotency key registry]`
