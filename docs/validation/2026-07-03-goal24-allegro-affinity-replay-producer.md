# Goal 24 Allegro Affinity Replay Producer Validation

Date: 2026-07-03
Repository: `/home/ssf/Documents/Github/codex-worktrees/allegro-goal24-affinity-replay`
Branch: `goal24-allegro-affinity-replay`

## Intent Preservation Chain

Vision -> Marketplace purchase history can improve related-product evidence without leaking buyer, address, payment, provider, raw marketplace, or secret data.
Goal Impact -> Allegro no longer needs a temporary `/tmp` SQL export for recurring marketplace affinity replay candidates.
System -> Allegro owns its local marketplace order projection and replay producer; Marketing owns aggregation, scheduling, run ledger, and Catalog publishing; Catalog owns relation persistence.
Feature -> Protected read-only `GET /internal/allegro/order-affinity/replay-candidates` producer.
Task -> Harden the producer with deterministic replay-window metadata, cursor pagination, paid/processable filtering, mapped two-product minimum, forbidden-field exclusion, and protected access coverage.
Execution Plan -> Allegro-only source/docs/tests; no Catalog, Marketing, Orders, Warehouse, Payments, Kubernetes, deploy, secret, or live data mutation.
Coding Prompt -> Emit only non-sensitive product/currency/channel item snapshots with `sourceOwner=allegro-service` and `channel=allegro`; mark downstream gaps with `[MISSING: ...]`.
Code -> `services/allegro-service/src/allegro/orders/orders.service.ts`, `services/allegro-service/src/allegro/orders/orders.service.spec.ts`.
Validation -> focused orders spec, shared/service build, and `git diff --check`.
State Update -> Allegro source-side producer endpoint and repeatable-window guarantee are complete; downstream Marketing scheduling/publish gates remain explicit.

## Producer Contract

Endpoint:

```text
GET /internal/allegro/order-affinity/replay-candidates
```

Access rules:

- Requires `x-internal-service-token` matching `ALLEGRO_INTERNAL_SERVICE_TOKEN` or `INTERNAL_SERVICE_TOKEN`.
- Requires `x-service-name: marketing-microservice`.
- Anonymous, browser/operator, and other-service calls fail with `401 internal_service_auth_required`.

Response guarantees:

- `sourceOwner=allegro-service`.
- `consumerOwner=marketing-microservice`.
- `contract=marketplace.order_affinity_candidate.v1`.
- `channel=allegro`.
- Effective `window.windowEnd` is always bounded: caller `to` when supplied, otherwise request `generatedAt`.
- Ordering is deterministic: `orderDate:asc`, then `id:asc`.
- `cursorAfter` is an opaque base64url cursor over `{ orderDate, id }`.
- `window.completeSnapshot=true` only when the requested window fits in one response with no `cursorBefore` and no `cursorAfter`.
- For larger windows, the consumer must start with `cursor=null`, reuse the returned `windowEnd`, and follow `cursorAfter` until it is null.

Eligibility rules:

- Include only `status=READY_FOR_PROCESSING` orders that are paid by `paymentStatus=PAID` or non-null `paidAt`.
- Emit an event only when at least two distinct line items have mapped `catalogProductId` values.
- Exclude unmapped line items from emitted evidence; if fewer than two mapped Catalog products remain, skip the order and increment page skip diagnostics.
- Do not emit customer names, emails, logins, buyer ids, delivery/address fields, payment/provider ids, raw marketplace payloads, tokens, credentials, or raw marketplace order ids.
- Replay refs are hashed synthetic ids derived from local order identity.

## Validation Evidence

- `NODE_PATH=/home/ssf/Documents/Github/allegro/services/allegro-service/node_modules:/home/ssf/Documents/Github/allegro/node_modules TS_NODE_TRANSPILE_ONLY=1 LOGGING_SERVICE_URL=http://logging-microservice:3367 /home/ssf/Documents/Github/allegro/services/allegro-service/node_modules/.bin/ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`: passed, `orders.service.spec: PASS`.
- Temporary dependency symlink build: `shared` TypeScript compile plus `cd services/allegro-service && npm run build`: passed.
- `git diff --check`: passed.

## Resolved Blockers

- `[MISSING: Allegro-owned protected replay endpoint so future runs do not require a temporary SQL export]` resolved for Allegro source.
- Allegro-owned part of `[MISSING: marketplace producer guarantee that replay window is complete and repeatable]` resolved through bounded `windowEnd`, deterministic ordering, cursor pagination, and explicit `completeSnapshot` semantics.

## Remaining Blockers

- `[MISSING: Marketing parser support for marketplace-owned replay source envelopes]`.
- `[MISSING: Marketing runtime token mapping for ORDER_AFFINITY_MARKETPLACE_REPLAY_TOKEN or ALLEGRO_INTERNAL_SERVICE_TOKEN]`.
- `[MISSING: durable Marketing backfill run ledger and idempotency key registry]`.
- `[MISSING: owner-approved retention/decay policy for stale affinity rows]`.
- `[MISSING: scheduled dry-run matrix across Allegro, Aukro, Bazos, FlipFlop, and central Orders]`.
- `[UNKNOWN: whether marketplace services other than Allegro currently have paid multi-product orders mapped to Catalog product ids]`.
