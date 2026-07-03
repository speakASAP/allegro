# Allegro Service Orchestrator Status

## 2026-07-03 - Buyer Auth Runtime Migration Deploy And Smoke

Result: approved buyer ownership Option 2 is now runtime-deployed on Allegro tag `aa612fa`. The live database has additive `AllegroOrder.buyerAuthSubject` support, buyer list/detail APIs are protected by Auth subject binding, `/cabinet/orders` is live, and the API gateway now preserves upstream non-2xx HTTP statuses instead of returning 404-shaped JSON as HTTP 200.

IPS chain: Vision -> customer-facing Allegro cabinets show only orders explicitly bound to the authenticated Auth subject; Goal Impact -> source, migration, deploy, and synthetic runtime isolation proof are complete for empty/unbound buyer state; System -> Auth owns identity, Allegro owns buyer-safe read projection and UI, Orders remains canonical lifecycle source; Feature -> subject-bound buyer order cabinet runtime; Task -> apply migration, deploy backend/frontend/gateway, and smoke buyer access; Execution Plan -> fail closed for unauthenticated/unbound rows, no email-only authorization, no historical backfill; Coding Prompt -> no token/customer/provider payload output; Code -> backend `78e0f5f`, hardening `9f07efc`, frontend `735ad1f`, gateway fix `aa612fa`; Validation -> DB column/index probe, `orders.service.spec: PASS`, `services/allegro-service npm run build`, `services/frontend npm run build`, `services/api-gateway npm run build`, `npm run verify:shipment-status-snapshot`, `git diff --check`, deploy rollouts, and live smokes.

Runtime evidence:

- Migration DDL was applied idempotently in the live Postgres pod; verification confirmed `buyerAuthSubject` as `character varying` plus `allegro_orders_buyerAuthSubject_idx`.
- Deploy completed with images `localhost:5000/allegro-service:aa612fa`, `allegro-api-gateway:aa612fa`, `allegro-frontend:aa612fa`, `allegro-settings:aa612fa`, and `allegro-imports:aa612fa`; all deployments are `1/1` ready.
- Public smokes: `/` 200, `/cabinet/orders` 200, `/api/health` 200.
- Buyer API smokes: unauthenticated `GET /api/allegro/buyer/orders` returned 401; synthetic Auth-subject buyer list returned `success=true`, `items=0`, `total=0`; synthetic non-owned/missing detail returned HTTP 404 after the gateway status propagation fix.

Remaining gates:

- `[MISSING: live authenticated buyer smoke with a real buyer Auth bearer and an approved subject-bound order row.]`
- `[MISSING: approved historical binding/backfill source, if product wants old imported marketplace rows visible in buyer cabinet.]`
- `[MISSING: central Orders lifecycle display smoke with a real forwarded Allegro order visible to the bound buyer.]`

Next action: create or identify one safe real subject-bound Allegro buyer order row, then run real-user buyer list/detail and lifecycle-display smoke without relying on synthetic JWTs.

Updated: 2026-07-03

## 2026-07-03 - Allegro Shipment Live Read Probe

Result: active Allegro OAuth token was non-expired at verification time. A live-listed checkout form validated the read path: list=200, detail=200, shipments=200 with one shipment, and carrier tracking=200 for extracted carrier+waybill. Shipment-management detail returned 404 for the extracted shipment id and remains optional/fail-soft. No raw order id, waybill, shipment id, buyer data, address, token, or provider payload was printed or persisted.

IPS chain: Vision -> runtime shipment reads must be proven before projection/adapter work; Goal Impact -> Allegro can now proceed toward a read-only shipment projection using proven order-level shipments plus carrier tracking; System -> Allegro owns provider read evidence, Warehouse/Orders remain downstream consumers; Feature -> sanitized live capability proof; Task -> rerun live-listed read probe after the expired-token blocker cleared; Execution Plan -> in-pod read-only provider calls, no deploy; Coding Prompt -> no raw identifiers or provider payload output; Code -> docs-only evidence update; Validation -> sanitized pod output plus `git diff --check`.

Remaining gates:

- `[MISSING: durable Allegro shipment projection schema/client implementation before runtime handoff]`
- `[MISSING: Warehouse consumer contract/runtime adapter for read-only shipment snapshots]`
- `[UNKNOWN: shipment-management detail read for sampled shipment returned 404]`
- `[UNKNOWN: carrier tracking returned 200 with zero tracking events for sampled waybill]`
- `[UNKNOWN: whether Warehouse wants per-waybill status, per-order rolled-up status, or both]`

Next action: design and implement the durable read-only projection/client for `/order/checkout-forms/{id}/shipments` plus `/order/carriers/{carrierId}/tracking`, treating shipment-management detail as optional/fail-soft.

## 2026-07-03 - Allegro Shipment Projection Design Landed

Result: docs-only durable shipment projection design added for `allegro.shipment_status_snapshot.v1`. No migration, runtime code, live Allegro read, OAuth token access, Warehouse handoff, or deploy was performed.

IPS chain: Vision -> Allegro-origin shipment progress can be replayed and handed off without raw provider payloads; Goal Impact -> durable projection gate now has an owner-reviewable schema/client design; System -> Allegro owns Ship with Allegro/OAuth reads and projection, Warehouse owns intake, Orders owns lifecycle; Feature -> shipment projection schema/client design; Task -> document tables, idempotency, cursors, redaction, client boundaries, and implementation order; Execution Plan -> reuse existing `AllegroSyncRun`, `AllegroSyncCursor`, `AllegroRawPayload`, and `AllegroProjectionAuditLog` foundation; Coding Prompt -> no DB migration, no live read, no tracking number/URL exposure; Code -> `docs/orchestrator/2026-07-03-allegro-shipment-projection-design.md`; Validation -> `git diff --check`.

Design decisions:

- Keep `AllegroOrder.trackingNumber` as legacy display data and do not use it for Warehouse/Orders handoff.
- Proposed tables: `AllegroShipmentProjection`, `AllegroShipmentPackageProjection`, `AllegroShipmentTrackingEventProjection`, and `AllegroShipmentSnapshotLedger`.
- Store only hashed external order/shipment/waybill identities, carrier id, package count, bounded statuses, timestamps, payload hashes, and ledger state.
- Raw shipment payload persistence remains blocked pending security/owner approval; default is no raw provider payload storage.
- Future runtime source client remains read-only and must not use label/protocol/pickup/cancel/fulfillment write endpoints.

Remaining gates:

- `[PROVEN: live-listed checkout-form shipment read and carrier-tracking read capability in image 8b1eb49; local projection correlation still needs care]`
- `[MISSING: owner approval for Prisma migration adding shipment projection tables]`
- `[MISSING: Warehouse consumer contract/runtime adapter for read-only shipment snapshots]`
- `[MISSING: deploy approval and sanitized runtime smoke]`

Next action: run the sanitized OAuth capability proof, then implement the projection migration/service behind an explicit disabled-by-default runtime gate.

## 2026-07-03 - Allegro Shipment Status Snapshot Fixtures And Verifier

Result: source-only shipment status snapshot contract verifier implemented for Allegro-origin shipments. The implementation adds `allegro.shipment_status_snapshot.v1` mapper fixtures and a self-running verifier under `services/allegro-service/src/allegro/shipments/`, plus `npm run verify:shipment-status-snapshot` in `services/allegro-service`. No live Allegro API calls, OAuth reads, DB writes, Kubernetes changes, provider simulator, or deploy were performed.

IPS chain: Vision -> Allegro-origin shipment progress can be passed to Warehouse/Orders without raw provider payloads; Goal Impact -> downstream integration now has executable redaction/idempotency/status-mapping proof before runtime reads; System -> `allegro-service` owns the Allegro source boundary and emits sanitized snapshots only; Feature -> source-only shipment status snapshot mapper and synthetic validation fixtures; Task -> cover the approved eight fixtures from the shipment source contract; Execution Plan -> pure mapper/spec only, no provider calls or persistence; Coding Prompt -> hash external ids/waybills, ignore non-Allegro channels, keep OAuth/permission failures as explicit blockers; Code -> `shipment-status-snapshot.mapper.ts`, `shipment-status-snapshot.fixtures.ts`, `shipment-status-snapshot.mapper.spec.ts`, and package script; Validation -> `npm run verify:shipment-status-snapshot`, `npm run build`, `git diff --check`.

Covered fixtures:

- `order-with-no-shipments` emits `UNKNOWN` without shipment write fallback.
- `single-waybill-delivered` hashes account/order/shipment/waybill identifiers and derives latest `DELIVERED`.
- `multi-package-single-carrier` batches tracking waybills at 20 per carrier.
- `mixed-carrier` groups by `carrierId`.
- `tracking-null` emits `UNKNOWN` with provider-retention reason.
- `oauth-403` emits `UNAVAILABLE` with `[MISSING: OAuth scope or account permission for shipment tracking read]` and no secret output.
- `shipment-management-detail-redaction` keeps only approved contract fields.
- `allegro-origin-filter` ignores non-Allegro rows.

Sanitized live OAuth capability probe:

- Runtime target: live `allegro-service` pod in `statex-apps`, image `localhost:5000/allegro-service:2c72f6b`.
- Active account found: true; access token present: true; token scopes configured: true; seller identity verified: true; token expired: true.
- Local Allegro-order sample found: true; local count: 117; sampled external id was printed only as a hash.
- `GET /order/checkout-forms/{id}/shipments`: attempted, returned 401, no payload persisted or printed.
- `GET /order/carriers/{carrierId}/tracking`: not attempted because shipment read failed closed.
- `GET /shipment-management/shipments/{shipmentId}`: not attempted because shipment read failed closed.

Remaining gates:

- `[PROVEN: live-listed checkout-form shipment read returned 200 after token refresh; local projection-only sample returned 404]`
- `[PROVEN: /order/carriers/{carrierId}/tracking returned 200 for a live-listed shipment waybill; sampled history was empty]`
- `[UNKNOWN: /shipment-management/shipments/{shipmentId} returned 404 for sampled shipment id; keep optional/fail-soft]`
- `[LANDED: durable Allegro shipment projection schema/client design in commit 9834f09; migration/service implementation remains gated]`
- `[MISSING: Warehouse consumer contract/runtime adapter for read-only shipment snapshots]`
- `[UNKNOWN: whether Warehouse wants per-waybill status, per-order rolled-up status, or both]`

Next action: design and implement the durable read-only projection/client for order-level shipments plus carrier tracking; keep shipment-management detail optional/fail-soft.

## 2026-07-03 - Buyer Auth Ownership Option 2 Approved

Result: product/Auth/security owner approved Option 2 for the Allegro buyer personal cabinet ownership model via orchestrator instruction `Approved. Option2`. Source implementation is now deployed in live tag `8b1eb49`: backend commit `78e0f5f` adds subject-bound buyer order reads, `buyerAuthSubject`, migration, buyer-safe DTOs, and isolation specs; frontend commit `735ad1f` adds `/cabinet/orders` against `GET /api/allegro/buyer/orders`. Runtime deploy is complete and the live DB contains the additive `buyerAuthSubject` column.

IPS chain: Vision -> customer-facing Allegro order cabinet shows only orders proven to belong to the authenticated buyer; Goal Impact -> buyer API/UI work can proceed without exposing imported marketplace rows by email/login; System -> Auth owns human identity and JWT `sub`, Allegro owns marketplace order projection, Orders owns canonical lifecycle snapshots; Feature -> buyer-scoped order cabinet contract; Task -> implement subject-bound read-only list/detail and UI; Execution Plan -> persist or derive an Auth subject binding, add buyer-only APIs and DTOs, keep seller/operator dashboard unchanged, validate isolation before deploy; Coding Prompt -> fail closed for unbound marketplace rows and never authorize by `buyerEmail`; Code -> backend `78e0f5f` plus frontend `/cabinet/orders` slice; Validation -> `orders.service.spec: PASS`, `order-client.service.spec: PASS`, `services/allegro-service npm run build`, `services/frontend npm run build`, `git diff --check`, rollouts for `allegro-service`, `allegro-api-gateway`, `allegro-frontend`, `allegro-settings`, and `allegro-imports`, live `/` 200, live `/cabinet/orders` 200, live unauthenticated buyer API 401, live invalid-token buyer API 401, and DB column probe `buyerAuthSubjectColumn=1`.

Approved defaults:

- Ownership proof: `AllegroOrder.authUserId`/`buyerAuthSubject` or equivalent Orders `customer.authSubject`/`customer.authUserId` snapshot equals Auth bearer `sub`.
- Buyer route/API: `/cabinet/orders`, `GET /api/allegro/buyer/orders`, `GET /api/allegro/buyer/orders/:id`.
- Cross-buyer detail response: 404.
- Unbound imported marketplace rows: hidden from buyer APIs.
- Seller/operator `/dashboard/orders`: unchanged.

Remaining implementation gates:

- Historical marketplace rows remain hidden unless a future approved process writes explicit `buyerAuthSubject`; no email-only backfill is approved.
- `[MISSING: live authenticated buyer smoke with a real buyer Auth bearer and a subject-bound test/order row.]`
- `[MISSING: approved historical binding/backfill source, if product wants old imported rows visible in buyer cabinet.]`

Next action: create or identify one safe subject-bound buyer order fixture, then run authenticated buyer-list/detail isolation smoke against live `8b1eb49`.

## 2026-07-03 - Goal 24 Allegro Affinity Replay Runtime Deploy

Result: deployed on live tag `2c72f6b`, which contains Goal 24 replay merge `40e7f0e`, and validated the protected replay endpoint with aggregate-only output. The endpoint returned HTTP 200, contract `marketplace.order_affinity_candidate.v1`, channel `allegro`, `count=8`, `skippedRecords=92`, and `eventSampleCount=8` from a bounded dry-run sample. No customer, address, payment, provider, token, raw marketplace order id, or raw event payload was printed.

IPS chain: Vision -> marketplace purchase history can improve related-product evidence without leaking sensitive data; Goal Impact -> Allegro has a live protected source for multi-product affinity candidates; System -> Allegro producer is live while Marketing/Catalog remain downstream owners; Feature -> protected replay endpoint; Task -> deploy and smoke aggregate-only; Execution Plan -> producer-first deployment and no live data mutation; Coding Prompt -> pod-local token use without printing secrets; Code -> deployed image `2c72f6b`; Validation -> rollout plus protected endpoint smoke; State Update -> producer ready, Marketing replay blocked by token mapping.

Blocker remains: `[MISSING: Marketing runtime token mapping for ORDER_AFFINITY_MARKETPLACE_REPLAY_TOKEN or ALLEGRO_INTERNAL_SERVICE_TOKEN]`.

## 2026-07-03 - Goal 24 W1 Allegro Protected Affinity Replay Producer

Result: source-only protected order-affinity replay producer implemented. IPS chain: Vision -> Allegro marketplace purchase history can feed related-product evidence without leaking buyer/address/payment/provider data; Goal Impact -> the temporary `/tmp` affinity export has a durable Allegro-owned source path; System -> Allegro owns local order projection and replay producer while Marketing/Catalog own aggregation/persistence; Feature -> `GET /internal/allegro/order-affinity/replay-candidates`; Task -> emit bounded marketplace replay envelopes for paid `READY_FOR_PROCESSING` multi-Catalog-product orders; Execution Plan -> source/test/docs only, no deploy or data mutation; Coding Prompt -> hash local marketplace order refs and emit only Catalog product item snapshots; Code -> orders controller/service/spec; Validation -> focused orders service spec, service build, and diff check.

## 2026-07-03 - Buyer Auth Ownership Contract Audit

Result: documentation-only audit completed after the buyer-cabinet gap plan. Auth provides canonical user identity (`sub`, `email`, profile, checkout wallet), but current Allegro source does not define an approved ownership rule from Auth identity to `AllegroOrder.buyerId`, `buyerEmail`, or `buyerLogin`.

Decision: Option 2 is now approved for source implementation only when ownership is proven by Auth subject binding. Do not use `Auth.email == AllegroOrder.buyerEmail` as an authorization rule. Keep `/dashboard/orders` as a seller/workspace surface with central Orders lifecycle polling.

Evidence:

- Auth contract: `docs/UNIFIED_AUTH_CONTRACT.md` owns JWT `sub`, primary `email`, profile, checkout-data, delivery-address, and invoice-profile endpoints scoped to the bearer subject.
- Allegro source: `AllegroAccount.userId` and `UserSettings.userId` are workspace/seller identity links; `AllegroOrder.buyerId`, `buyerEmail`, and `buyerLogin` are marketplace buyer snapshots without Auth ownership relation.
- Current Orders API controller/service path for Allegro order reads does not pass `req.user` into a buyer ownership filter.

Blockers remain:

- Source implementation present for `buyerAuthSubject`; runtime application is `[MISSING: approved DB migration/deploy]`.
- `[MISSING: migration/backfill decision for historical Allegro rows; default is no backfill and no buyer visibility without Auth subject binding.]`
- Buyer-safe DTO and source isolation tests are present; `[MISSING: live authenticated buyer smoke after deploy]`.
- `[MISSING: deploy approval after source validation.]`

Next action: review and deploy the source-only buyer API/UI after approving the `buyerAuthSubject` migration; then run authenticated buyer-list/detail isolation smoke.

## 2026-07-02 - A2 Cabinet Order Stats And Delivery Admin Summary

Result: implemented on branch `codex/orders-lifecycle-cabinet-allegro` without deploy. The protected Orders dashboard now loads aggregate order, central forwarding, and delivery or fulfillment statistics from a new read-only `GET /api/allegro/orders/statistics` endpoint before the central lifecycle order table.

IPS chain: Vision -> central Orders lifecycle and delivery progress are visible in the Allegro cabinet; Goal Impact -> admin users can see order and delivery health without querying customer rows; System -> `allegro-service` orders read API and frontend dashboard; Feature -> aggregate order and delivery stats; Task -> add non-PII aggregate stats endpoint and dashboard cards; Execution Plan -> reuse local Allegro order projection plus central forwarding attempts, keep shipment-management gaps explicit, and do not deploy; Coding Prompt -> edit only Allegro files and preserve auth and privacy boundaries; Code -> `services/allegro-service/src/allegro/orders/orders.controller.ts`, `services/allegro-service/src/allegro/orders/orders.service.ts`, `services/allegro-service/src/allegro/orders/orders.service.spec.ts`, `services/frontend/src/pages/OrdersPage.tsx`; Validation -> `git diff --check`, `LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node shared/clients/order-client.service.spec.ts`, `LOGGING_SERVICE_URL=http://logging-microservice:3367 npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`, `cd shared && npm run build`, `cd services/allegro-service && LOGGING_SERVICE_URL=http://logging-microservice:3367 npm run build`, and `cd services/frontend && npm run build` passed on 2026-07-02.

Blockers/unknowns:

- `[MISSING: shipment-management implementation]`; the dashboard exposes local delivery/tracking and fulfillment aggregates only, not Allegro shipment labels/packages/protocols.
- `[UNKNOWN: deployed Orders lifecycle field naming]` remains covered by the fail-soft central lifecycle read model from A1.

## 2026-07-02 - A1 Central Orders Status Read Model

Result: implemented and locally validated for the Allegro order read model. The read path now joins each local `AllegroOrder` with the latest `AllegroOrderForwardingAttempt`, extracts the central Orders id from `responseSummary.id`, and exposes a `centralOrderReadModel` on order list/detail responses.

IPS chain: Vision -> central Orders lifecycle is visible in Allegro order views; Goal Impact -> marketplace-local status is no longer the primary operator lifecycle indicator; System -> `allegro-service` orders read API and shared Orders client; Feature -> fail-soft central status read model; Task -> join latest forwarding attempt, extract central id, read lifecycle when available, and flag missing/stale state; Execution Plan -> add bounded list/detail relation select and batched central reads without changing forwarding writes; Coding Prompt -> avoid related-products and product publish/status flows, preserve dirty work, do not deploy or push; Code -> `shared/clients/order-client.service.ts`, `shared/clients/order-client.service.spec.ts`, `services/allegro-service/src/allegro/orders/orders.service.ts`, `services/allegro-service/src/allegro/orders/orders.service.spec.ts`, and `services/frontend/src/pages/OrdersPage.tsx`; Validation -> `git diff --check`, shared client spec, orders service spec, shared build, allegro-service build, and frontend build passed on 2026-07-02.

Implemented:

- `OrderClientService.getOrderLifecycle(orderId)` reads `GET /api/orders/:id` with existing machine-auth headers when configured and returns a fail-soft result instead of breaking the Allegro list.
- `OrdersService.getOrders()` and `getOrder()` attach `centralOrderReadModel` and strip internal `forwardingAttempts` relation details from the public response.
- `centralOrderReadModel.state` is:
  - `available` when a forwarded attempt has `responseSummary.id` and Orders read returns a lifecycle payload;
  - `unknown` when the latest attempt is missing, not forwarded, or lacks central id;
  - `stale` when central id exists but the Orders lifecycle read is unavailable.
- Frontend Orders dashboard now renders central order id and central lifecycle before Allegro-local status, with Allegro status shown as a snapshot column.

Blockers/unknowns:

- `[MISSING: Orders lifecycle read contract/client method]` remains the explicit stale fallback until runtime Orders read contract validation confirms `GET /api/orders/:id` returns lifecycle fields in the deployed Orders service.
- `[UNKNOWN: deployed Orders lifecycle field naming]`; the read model accepts `lifecycleStage`, `lifecycleStatus`, `stage`, `state`, or `status`, plus known payment/fulfillment/warehouse handoff fields.

Validation evidence:

- `git diff --check`
- `npx ts-node shared/clients/order-client.service.spec.ts`
- `npx ts-node services/allegro-service/src/allegro/orders/orders.service.spec.ts`
- `cd shared && npm run build`
- `cd services/allegro-service && npm run build`
- `cd services/frontend && npm run build`

## 2026-07-01 - Goal 7.2B Orders Canonical Create Readiness

Result: source-ready and runtime-wired. Allegro central order forwarding remains disabled
by default and still requires `forwardToOrdersMicroservice=true` plus exact
confirmation `ALLEGRO_ORDER_FORWARDING_TO_ORDERS_MICROSERVICE` before any
orders-microservice create call is attempted.

IPS chain: Vision -> canonical Orders lifecycle for sellable channels; Goal
Impact -> Allegro can forward only complete, Warehouse-reservable orders; System
-> allegro-service order projection and shared Orders client; Feature ->
`orders.create.v1` forwarding readiness; Task -> add accepted machine-auth
headers and Warehouse-owned `warehouseId` requirement; Execution Plan -> keep
forwarding gated, fail closed on missing runtime prerequisites, validate with
focused client/mapper/service specs and builds; Coding Prompt -> preserve
Catalog product truth, Warehouse stock authority, Orders idempotency, and secret
redaction; Code -> `shared/clients/order-client.service.ts`,
`shared/clients/order-client.service.spec.ts`, and
`services/allegro-service/src/allegro/orders/*`; Validation -> focused specs,
`git diff --check`, shared build, allegro-service build, Kubernetes dry-run,
deploy, env-name presence checks, health/reachability checks, owner-approved
fail-closed create smoke, and owner-approved successful create/idempotency/
Warehouse-reservation smoke passed after the Orders runtime credential/header
trim gate was fixed and deployed.

Implemented:

- Orders create now sends `x-internal-service-token` and
  `x-service-name: allegro-service` when `ALLEGRO_INTERNAL_SERVICE_TOKEN` or a
  compatible fallback env is configured, and fails closed with
  `[MISSING: Orders runtime credential]` before HTTP create when no internal
  token is present.
- Forwarded `orders.create.v1` items now include a runtime Warehouse-owned
  `warehouseId` from `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID` or
  `DEFAULT_WAREHOUSE_ID`, with `STOCK_PRIMARY_WAREHOUSE` accepted as the
  current Allegro runtime config fallback.
- If no Warehouse-owned `warehouseId` is configured, forwarding blocks before
  calling Orders with `[MISSING: warehouseId]:line_<n>_missing_warehouse_id`.
- Product IDs remain `AllegroOffer.catalogProductId`, preserving Catalog
  canonical product truth instead of using Allegro offer/listing IDs.
- Existing idempotency fields are preserved:
  `orders.create.v1:allegro:<channelAccountId>:<externalOrderId>`, with stable
  `channelAccountId`, stable `externalOrderId`, payload hash, and conflict
  handling retained.

Deployment/runtime evidence:

- Runtime credential and Warehouse UUID wiring is deployed on image tag
  `ec6f97a`.
- `allegro-service`, `allegro-api-gateway`, `allegro-settings`,
  `allegro-imports`, and `allegro-frontend` are `1/1` Available on
  `ec6f97a`.
- Public checks returned HTTP 200 for `/`, `/health`, and `/api/health`.
- `allegro-service-secret` ExternalSecret is `SecretSynced`; the running pod
  references `orders-microservice-secret/ALLEGRO_INTERNAL_SERVICE_TOKEN` and
  exposes `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID` as a Warehouse UUID without
  printing token values.
- Env-name presence was verified without printing values:
  `JWT_TOKEN=present`, `ALLEGRO_INTERNAL_SERVICE_TOKEN=present`,
  `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID=present`,
  `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID` passed UUID shape validation, and
  `STOCK_PRIMARY_WAREHOUSE=present` for legacy stock/import flows.
- `ORDER_SERVICE_URL` and `WAREHOUSE_SERVICE_URL` are not set in the pod; the
  shared clients use their default service DNS URLs,
  `http://orders-microservice:3203` and `http://warehouse-microservice:3201`.
- Runtime reachability checks from the Allegro pod returned Allegro local
  `/health` HTTP 200, Orders `/health` HTTP 200, Warehouse `/api/health` HTTP
  200, and Warehouse `/api/stock/nonexistent/total` HTTP 401 without token.

Live create smoke:

- Owner-approved synthetic `POST /api/orders` was run from the deployed Allegro
  pod with `orders.create.v1`, `x-internal-service-token`,
  `x-service-name: allegro-service`, stable
  `channelAccountId=codex-allegro-smoke-account`, synthetic
  `externalOrderId=codex-allegro-smoke-1782895044726`, canonical Catalog
  `productId=c0de0000-0000-4000-8000-000000000011`, quantity `1`, and
  Warehouse-owned `warehouseId=c0de0000-0000-4000-8000-000000000013`. No token
  values, customer data, provider payloads, or raw Warehouse response bodies
  were printed.
- Orders accepted the Allegro machine-auth path and reached the service-layer
  Warehouse handoff. The earlier fail-closed HTTP 400 blocker was traced to
  Orders' Axios header construction using an untrimmed runtime Warehouse token;
  Orders commit `43f9774` trims the token, was deployed as
  `localhost:5000/orders-microservice:43f9774`, and post-deploy Axios
  reserve/cancel passed from the Orders pod.
- Successful create returned HTTP 201 with order
  `6898c3fa-e3e8-4eed-a723-11b58fc2ea3b`,
  `warehouseHandoff.status=reserved`, `reservedCount=1`, `failedCount=0`, and
  `reasonCode=ORDER_CREATE_RESERVATION`.
- Exact idempotent replay returned HTTP 201, `sameOrder=true`, the same order
  id, and `warehouseHandoff.status=reserved`, proving replay did not create a
  duplicate order or rerun Warehouse reservation side effects.
- Owner-approved cleanup cancellation returned HTTP 200 with order status
  `cancelled`, `warehouseHandoff.status=cancelled`, `reservedCount=1`,
  `failedCount=0`, and `reasonCode=ORDER_CANCELLED`.
- Warehouse readback for the synthetic order returned HTTP 200,
  `totalReservations=1`, `active=0`, `cancelled=1`.
- A fresh post-deploy smoke found the old runtime mapping still forwarded
  `warehouseId=sklad-internet`, which Warehouse rejected as a non-UUID. Commit
  `ec6f97a` changed `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID` to the
  Warehouse-owned UUID while leaving `STOCK_PRIMARY_WAREHOUSE=sklad-internet`
  untouched for legacy stock/import flows, then redeployed Allegro.
- Fresh verification after `ec6f97a` used synthetic
  `externalOrderId=codex-allegro-smoke-1782910694`. Create returned HTTP 201
  with order `2fddfdc5-3ac6-4c2d-88e9-094eaa7e9d26`,
  `warehouseHandoff.status=reserved`, `reservedCount=1`, `failedCount=0`,
  and `reasonCode=ORDER_CREATE_RESERVATION`; exact replay returned HTTP 201
  with `sameOrder=true`; mismatched replay returned HTTP 409; cleanup
  cancellation returned status `cancelled`, `warehouseHandoff.status=cancelled`,
  `reservedCount=1`, `failedCount=0`, and Warehouse readback returned HTTP 200
  with `totalReservations=1`, `cancelled=1`.
- Decision: Allegro-side create-order auth, stable idempotency identity,
  canonical Catalog `productId`, and Warehouse-owned `warehouseId` forwarding
  are runtime-ready for Goal 7.2B.

Follow-up runtime wiring:

- `k8s/deployment.yaml` exposes `ALLEGRO_INTERNAL_SERVICE_TOKEN` from
  the existing synced `orders-microservice-secret` key and sets
  `ALLEGRO_ORDER_FORWARDING_WAREHOUSE_ID` to the Warehouse UUID used by
  Orders reservation handoff. `STOCK_PRIMARY_WAREHOUSE` remains
  `sklad-internet` for legacy stock/import flows and is no longer reused as
  the Orders item `warehouseId`.
- No token values were printed or committed.

## 2026-06-29 - TASK-STOCK-004 Allegro Complete Physical Stock Source Recheck

Result: owner authorized getting the missing complete physical stock source from Allegro. Live read-only probes against the deployed Allegro pod confirmed the current configured Allegro seller surface exposes `9` unique current-stock-authoritative offers, not ~500 distinct offers/products. Their `/sale/product-offers/{offerId}.stock.available` total is `496` units, which matches the expected "about 500" as physical stock quantity.

Evidence: `node dist/scripts/import-current-allegro-stock-to-warehouse.js --all-accounts --dry-run --verify-warehouse --detail-limit 1000 --list-limit 100` returned `stockAuthoritativeAppearances=27`, `uniqueStockAuthoritativeOffers=9`, `duplicateStockAuthoritativeAppearances=18`, `stockAuthoritativeTotal=496`, `wouldSet=9`, `warehouseMatches=9`, `warehouseMismatches=0`, and no errors. `node dist/scripts/audit-current-stock-source.js --all-accounts --detail-limit 1000 --list-limit 100` returned 3 configured accounts; each saw the same 9 ACTIVE offer IDs, INACTIVE/ENDED/ACTIVATING counts were 0, and each account stock total was 496. A separate no-status `/sale/offers` read also returned exactly 9 unique offers and 496 listed stock for each configured account. `/sale/product-offers` list-style probing is not a usable listing source in this runtime; it returns HTTP 405, so `/sale/offers` discovery plus `/sale/product-offers/{offerId}` detail remains the current Allegro source contract.

Decision: there is no additional hidden 500-offer Allegro source in the configured accounts. Warehouse already matches all 9 Allegro current-stock-authoritative offers. Historical order-only rows remain non-authoritative for current stock. Also patched `audit-current-stock-source.ts` so future larger accounts compute unique current-stock totals from all detailed offer stock rows instead of the display sample cap, and so the audit reports unfiltered `/sale/offers` counts alongside publication-status filtered counts.

Deployment/validation: committed and deployed `de214fb` (`fix: report full allegro stock audit counts`). Deployment completed successfully for Allegro service, API gateway, settings, imports, and frontend. Deployed patched audit returned `mutates=false`, `unfilteredListedOffers=27`, `unfilteredListedStockTotal=1488`, `stockAuthoritativeOffers=27`, `stockAuthoritativeTotal=1488`, `uniqueStockAuthoritativeOffers=9`, `uniqueStockAuthoritativeTotal=496`, `duplicateStockAuthoritativeAppearances=18`, `detailErrors=0`, and no account errors. Deployed Warehouse dry-run verifier still returned `mutatesWarehouse=false`, `stockAuthoritativeAppearances=27`, `uniqueStockAuthoritativeOffers=9`, `stockAuthoritativeTotal=496`, `wouldSet=9`, `warehouseMatches=9`, `warehouseMismatches=0`, and no errors.

Boundary: read-only Allegro/API probes and audit script deployment only; no Warehouse apply, local Allegro projection mutation, Allegro write API, account activation/token refresh, Catalog write, or order forwarding was run.

## Current State

- TASK-010 Allegro primary-channel foundation is implemented and validated for the Allegro adapter.
- W2 sync/projection migration is applied live and deployed.
- Owner-approved one-time current-stock Warehouse apply completed on 2026-06-29.
- P1 order sync now defaults to local projection only; central forwarding is exact-confirmation gated.
- Durable central order forwarding attempt/status storage is migrated and deployed; pushed `main` and live Kubernetes image tags agree on `268e845`.
- Preview-token governed import approvals and governed Allegro quantity-command write-back are migrated, deployed, live-image verified on tag `268e845`, and authenticated-smoke verified. The smoke ran `prepare` then `confirm` with target quantity equal to current quantity, reached `QUEUED`, did not call `execute`, did not create a command id, and did not change Allegro quantity.
- Recurring Warehouse stock orchestration policy is implemented for Allegro: Warehouse is the only source of sellable quantity; `stock.updated` and `stock.out` events automatically create and execute durable Allegro quantity command attempts; `stock.out` forces target quantity `0`; no approval is required; and the default account pacing is one request per second via `ALLEGRO_STOCK_SYNC_RATE_LIMIT_MS=1000`.
- Catalog availability propagation foundation is implemented for Allegro: `catalog.product.archived.v1`, `catalog.product.deleted.v1`, and `catalog.product.sellability_changed.v1` with `afterSellable=false` mark matching local Allegro offers `INACTIVE`, set local quantity to `0`, write `WebhookEvent` dedupe ledger rows, create projection audit logs when an offer has an account, and create blocked `END` publish attempts. Live Allegro deactivation remains blocked by `[MISSING: Allegro live offer deactivate endpoint/policy confirmation]`.
- P2 script import paths now separate dry-run, local projection, and Catalog apply confirmations.
- P7 operations read API and the dashboard Operations route are implemented.

## Safe Read Surfaces

- `GET /api/allegro/orders`
- `GET /api/allegro/offers`
- `GET /api/allegro/products`
- `GET /api/allegro/operations`
- `GET /api/allegro/operations/sync-runs`
- `GET /api/allegro/operations/cursors`
- `GET /api/allegro/operations/raw-payloads`
- `GET /api/allegro/operations/projection-audit`
- `GET /api/allegro/operations/stock-snapshots`
- `GET /api/allegro/operations/order-forwarding-attempts`

The operations raw-payload endpoint returns metadata only and does not select raw payload JSON.

## Guarded Apply Surfaces

- Checkout-form local projection: `--apply --confirm-local-only`.
- Order-derived offer local projection: `--apply-local-projection --confirm-local-only`.
- Order-derived Catalog apply: `--apply --confirm-catalog-apply ALLEGRO_ORDER_OFFER_CATALOG_IMPORT`.
- Active-offer Catalog import: `--apply --confirm-catalog-apply ALLEGRO_ACTIVE_OFFER_CATALOG_IMPORT`.
- Active account mutation for active-offer import: `--activate-account --confirm-activate-account ALLEGRO_IMPORT_ACTIVATE_ACCOUNT`.
- HTTP offer import approval routes: body `confirmCatalogApply=ALLEGRO_HTTP_OFFER_IMPORT_CATALOG_APPLY`.
- Central order forwarding: `forwardToOrdersMicroservice=true` plus `ALLEGRO_ORDER_FORWARDING_TO_ORDERS_MICROSERVICE`.

## Blockers

- `orders.create.v1` duplicate/equality behavior confirmed from orders-microservice source and verification scripts: exact replay returns existing order without duplicate side effects; mismatched same-key replay returns HTTP 409.
- Preview-token governed service/controller import approval routes are implemented and live guarded.
- Governed Allegro quantity command prepare/confirm/execute/poll routes are implemented, migrated, deployed, and smoke-verified without execute.
- Recurring stock orchestration policy for automatic Allegro quantity commands is implemented in `shared/rabbitmq/stock-events.subscriber.ts`: Warehouse-only source, `stock.updated`/`stock.out` triggers, automatic execute, durable attempts, polling, terminal-state recording, and one-request-per-second default pacing. `stock.out` and `stock.updated` with zero available also mark the local Allegro projection `INACTIVE` while preserving the existing quantity-command path.
- `[MISSING: Catalog event exchange/routing configuration confirmation]`: runtime defaults are `CATALOG_EVENTS_EXCHANGE=catalog.events`, `CATALOG_EVENTS_QUEUE=catalog.allegro-service`, and `CATALOG_EVENTS_ROUTING_KEYS=catalog.product.archived.v1,catalog.product.deleted.v1,catalog.product.sellability_changed.v1` until producer configuration is confirmed.
- `[MISSING: Allegro live offer deactivate endpoint/policy confirmation]`: Catalog-side non-sellable events create blocked local `END` intents only; no live Allegro deactivate/end call is made by the Catalog event consumer.
- `[MISSING: Allegro safe catalog-event refresh policy]`: upsert/update/category-changed events are not bound by default and are ignored if configured until a safe read-model refresh policy is approved.
- TASK-009 IPS audit/pre-coding debt repaired and validated on 2026-06-29; strict audit, pre-coding, and TASK-009 readiness gates passed.
