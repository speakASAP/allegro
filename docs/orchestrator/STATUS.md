## 2026-07-03 - Service-Native Redacted Shipment Scan Deployed And Smoked

Result: Allegro `c979768` is deployed for `allegro-service`, API gateway, settings, imports, and frontend. The new service-native endpoint `GET /internal/allegro/shipment-status/redacted-scan` was smoke-tested from the running `allegro-service:c979768` pod with the internal service token kept in-process and not printed. The endpoint returned HTTP 200 and aggregate-only contract `allegro.shipment_status_redacted_scan.v1`: `candidatesChecked=1`, `candidatesWithCentralOrderId=1`, `scanned=1`, `failed=0`, `snapshotCount=1`, `sourceReadStatusCounts.AVAILABLE=1`, `latestStatusCounts.UNKNOWN=1`, `nonUnknownStatusCount=0`, `packageCountTotal=1`, `hasAnyWaybillHash=true`, and blocker `[MISSING: Allegro provider sample with carrier tracking status other than UNKNOWN]`. Safety flags returned `mutates=false`, `mutatesAllegro=false`, `mutatesWarehouse=false`, `mutatesOrders=false`, `refreshesOAuthToken=false`, `returnsRawIds=false`, `returnsRawWaybills=false`, and `returnsProviderPayload=false`. No token values, raw account/order ids, raw waybills, raw provider payloads, snapshots, customer PII, screenshots, raw DOM, Warehouse mutation, Orders mutation, provider write, DB migration, or runtime consumer was created or printed.

IPS chain: Vision -> real provider shipment scans run through a service-native redacted Allegro boundary; Goal Impact -> future production-data proof no longer needs temporary OAuth/DB helper extraction; System -> Allegro owns OAuth access, provider reads, redaction, aggregate output, and internal auth; Warehouse/Orders stay downstream evidence owners; Feature -> deployed internal redacted shipment scan endpoint; Task -> deploy and smoke service-native scan; Execution Plan -> deploy committed `c979768`, call endpoint in-pod with internal service auth, record only aggregates; Coding Prompt -> no raw tokens/ids/waybills/provider payloads/snapshots and no Warehouse/Orders mutation; Code -> `c979768`; Validation -> deployment rollout plus endpoint HTTP 200 aggregate smoke.

State update:

- [PROVEN: service-native redacted shipment scan endpoint is deployed and callable in-cluster.]
- [PROVEN: endpoint uses internal service auth and returns aggregate-only redacted evidence.]
- [PROVEN: live scan does not refresh OAuth tokens and does not mutate Allegro/Warehouse/Orders/provider state.]
- [BLOCKED: current scanned real Allegro carrier tracking data still has only UNKNOWN status.]
- [MISSING: future real Allegro.cz customer-provider sample with carrier tracking status other than UNKNOWN if product requires production-data proof beyond approved fixture.]

Что потребуется дальше: если нужен именно production-data proof, нужен реальный Allegro shipment, у которого carrier tracking endpoint уже вернёт событие движения (`SENT`, `IN_TRANSIT`, `DELIVERED`, `RETURNED`, `ISSUE` и т.п.). Теперь повторять проверку можно безопасно через этот endpoint; ручная выгрузка OAuth material из БД больше не нужна и не должна использоваться.

## 2026-07-03 - Service-Native Redacted Shipment Scan Endpoint Implemented

Result: `allegro-service` now has a service-native internal redacted shipment scan endpoint at `GET /internal/allegro/shipment-status/redacted-scan`. The endpoint is protected by the internal service-token boundary, selects forwarded Allegro orders through Prisma, uses the existing Allegro auth/source/projection services in-process, and returns only aggregate scan evidence: candidate counts, source-read status counts, latest status class counts, package totals, non-UNKNOWN count, redacted blockers, and safety flags. It does not return OAuth tokens, raw account ids, raw checkout-form ids, raw local/central order ids, raw waybills, raw provider payloads, shipment snapshots, DOM, screenshots, Warehouse internals, or customer PII. The scan is read-only by contract and uses a non-refreshing token accessor; if an OAuth token is missing or expiring soon, it returns a `[MISSING: ...]` blocker instead of mutating encrypted credential fields.

IPS chain: Vision -> provider/courier shipment status can be observed safely without credential extraction or raw tracking disclosure; Goal Impact -> future real-provider proof can be run through a service-native boundary instead of temporary DB/token helpers; System -> Allegro owns OAuth access, provider reads, redaction, and aggregate scan output; Warehouse/Orders remain downstream evidence owners; Feature -> internal redacted shipment scan; Task -> implement endpoint/job path for service-native scan; Execution Plan -> source-only service/controller/token-accessor/spec wiring, no DB migration, no provider write, no Warehouse/Orders mutation, no runtime consumer; Coding Prompt -> never return tokens/raw ids/waybills/provider payloads/snapshots; Code -> `shipment-status-redacted-scan.service.ts`, focused spec, module wiring, package verifier, and non-refreshing `AllegroAuthService` accessor; Validation -> `verify:shipment-status-redacted-scan`, full shipment verifier suite, service build, and diff check.

State update:

- [PROVEN: source has service-native redacted scan endpoint protected by internal service auth.]
- [PROVEN: endpoint output is aggregate-only and focused tests assert raw token/order/account markers do not leak.]
- [PROVEN: scan does not refresh OAuth tokens or mutate Warehouse/Orders/Allegro provider state.]
- [MISSING: deployment and live endpoint smoke on `allegro-service` runtime.]
- [MISSING: real Allegro customer-provider tracking event if product requires production-data proof beyond approved fixture.]

Что потребуется дальше: после deploy нужно вызвать endpoint изнутри кластера с `x-service-name: allegro-service` и internal token, проверить только агрегаты (`latestStatusCounts`, `nonUnknownStatusCount`, `blockers`) и записать результат. Если агрегаты снова только `UNKNOWN`, понадобится реальное Allegro отправление с carrier tracking event или переавторизация аккаунта, но не ручная выгрузка OAuth material из БД.

## 2026-07-03 - Synthetic RETURNED Provider Fixture Proved Return Lifecycle

Result: the approved synthetic provider fixture chain continued after `DELIVERED`. With the existing sanitized Allegro shipment correlation now in Warehouse status `delivered`, a second synthetic `allegro.shipment_status_snapshot.v1` with `latestStatus=RETURNED` was posted from the live Allegro pod using `WAREHOUSE_INTERNAL_SERVICE_TOKEN`. Warehouse returned HTTP 201 with `observationDecision=accepted`, `normalizedWarehouseStatus=returned`, `statusMutationApplied=true`, and fulfillment status `returned`. Orders accepted the Warehouse callback and moved lifecycle from `received` to `returned`.

IPS chain: Vision -> provider return events update customer/admin order lifecycle before real marketplace traffic exists; Goal Impact -> pre-customer readiness for returned provider status is proven synthetically; System -> Allegro owns sanitized provider fixture handoff, Warehouse owns status intake/mutation, Orders owns lifecycle projection; Feature -> synthetic provider return fixture; Task -> prove `RETURNED -> returned -> returned lifecycle`; Execution Plan -> temporary pod helpers only, no deploy/provider write/raw tracking reveal; Coding Prompt -> no token values, raw provider payloads, raw tracking numbers, raw waybills, raw account/order ids, customer PII, screenshots, raw DOM, or runtime secret changes; Validation -> Warehouse HTTP 201 accepted/returned, Orders audit resulting lifecycle `returned`, Orders verifier evidence.

Remaining gates:

- [PROVEN: synthetic provider status `RETURNED` updates Warehouse to `returned` and Orders lifecycle to `returned`.]
- [BLOCKED: synthetic `ISSUE/not_delivered` runtime proof needs a fresh `in_delivery` fixture because the current fulfillment is now terminal `returned`.]
- [FUTURE: real Allegro.cz customer/provider shipment evidence when marketplace traffic exists.]
- [MISSING: optional future audited full-tracking reveal contract if product/security approves raw tracking visibility.]

## 2026-07-03 - Delivered Shipment Evidence Reconciled From Orders/Warehouse

Result: Orders/Warehouse evidence now closes the pre-customer non-UNKNOWN shipment movement gate through an approved sanitized `DELIVERED` fixture and aggregate live readback. Orders commit `bfccd54` records that the existing sanitized Allegro shipment correlation was used to build a redacted `DELIVERED` snapshot with hashed provider identity fields only; the live Allegro pod posted it to Warehouse with the dedicated `WAREHOUSE_INTERNAL_SERVICE_TOKEN`; Warehouse accepted it with HTTP 201, `statusMutationApplied=true`, `observationDecision=accepted`, `normalizedWarehouseStatus=delivered`, and fulfillment status `delivered`; Orders received the Warehouse callback and moved the central lifecycle to `received`. Follow-up aggregate readback showed Warehouse provider observations by class as `DELIVERED -> delivered -> accepted: 1`, `IN_TRANSIT -> in_delivery -> accepted: 1`, and `UNKNOWN -> noop -> accepted: 1`, with Orders showing one `delivered` order and zero shipment-table rows. No token values, raw provider payloads, raw tracking numbers, raw waybills, raw account/order ids, customer PII, screenshots, raw DOM, provider write, deployment, runtime secret change, or credential material movement was used or printed in this reconciliation.

IPS chain: Vision -> provider/courier shipment status owns reliable lifecycle movement without exposing provider secrets; Goal Impact -> the previous pre-customer non-UNKNOWN gate is closed by approved sanitized fixture evidence while real customer-provider proof remains optional future evidence; System -> Allegro owns redacted provider snapshot production and Warehouse token projection, Warehouse owns correlation/status ledger and fulfillment transitions, Orders owns lifecycle projection; Feature -> provider/courier shipment-status ownership gate; Task -> reconcile Allegro status with Orders/Warehouse delivered evidence; Execution Plan -> docs-only update after source/runtime/readback verification, no code or live credential handling; Coding Prompt -> do not create simulators, credentials, webhook contracts, DB migrations, runtime consumers, or raw tracking output; Code -> this status update only; Validation -> Allegro shipment verifier suite passed, runtime deployments were ready, and aggregate Warehouse/Orders readback showed the delivered observation/status.

State update:

- [PROVEN: dedicated Allegro Warehouse shipment token path is live on `allegro-service:b6cd31a` with Warehouse `d9ebb47`.]
- [PROVEN: approved sanitized `DELIVERED` snapshot moved Warehouse to `delivered` and Orders lifecycle to `received`/delivered aggregate state.]
- [PROVEN: real Allegro read-only scan reached checkout-form shipments and carrier tracking but current scanned customer data still returned only `UNKNOWN` statuses.]
- [RESOLVED/NARROWED: pre-customer non-UNKNOWN provider/courier movement gate is closed through approved sanitized fixture evidence.]
- [MISSING: service-native approved live scan path that can use Allegro OAuth without moving encrypted token material through temporary files.]
- [MISSING: future real Allegro.cz customer-provider sample with carrier tracking status other than UNKNOWN if product requires production-data evidence beyond approved fixture.]
- [MISSING: future audited full-tracking reveal contract if product/security approves raw tracking visibility.]

Что потребуется дальше: для следующего реального provider-smoke нужен либо сервисный endpoint/job внутри `allegro-service`, который сам использует существующий OAuth/token service без выгрузки зашифрованных токенов во временные файлы, либо новое реальное Allegro отправление, у которого carrier tracking уже содержит событие движения. До этого нельзя безопасно требовать от агента ручного извлечения OAuth material из БД.

## 2026-07-03 - Synthetic DELIVERED Provider Fixture Proved Delivery Lifecycle

Result: because there are no current real Allegro.cz customer shipments with non-UNKNOWN carrier status, an approved synthetic provider fixture was used to prove the non-UNKNOWN delivery path inside the Alfares Allegro/Warehouse/Orders runtime. Warehouse built a sanitized `allegro.shipment_status_snapshot.v1` from the existing hashed Allegro shipment correlation with `latestStatus=DELIVERED`; the live Allegro pod posted it with the dedicated `WAREHOUSE_INTERNAL_SERVICE_TOKEN`. Warehouse returned HTTP 201, `observationDecision=accepted`, `normalizedWarehouseStatus=delivered`, `statusMutationApplied=true`, and fulfillment status `delivered`. Orders accepted the Warehouse callback and moved lifecycle from `in_delivery` to `received`.

IPS chain: Vision -> provider shipment events update customer/admin order lifecycle before real marketplace traffic exists; Goal Impact -> pre-customer readiness for non-UNKNOWN provider statuses is proven without depending on Allegro.cz buyers; System -> Allegro owns sanitized provider fixture handoff, Warehouse owns status intake/mutation, Orders owns lifecycle projection; Feature -> synthetic provider delivery fixture; Task -> prove `DELIVERED -> delivered -> received` using existing sanitized correlation and dedicated service token; Execution Plan -> temporary pod helpers only, no deploy/provider write/raw tracking reveal; Coding Prompt -> no token values, raw provider payloads, raw tracking numbers, raw waybills, raw account/order ids, customer PII, screenshots, raw DOM, or runtime secret changes; Validation -> Warehouse HTTP 201 accepted/delivered, Orders audit resulting lifecycle `received`, Orders verifier evidence.

Remaining gates:

- [PROVEN: synthetic non-UNKNOWN provider status `DELIVERED` updates Warehouse to `delivered` and Orders lifecycle to `received`.]
- [FUTURE: real Allegro.cz customer/provider shipment evidence when marketplace traffic exists.]
- [MISSING: optional future audited full-tracking reveal contract if product/security approves raw tracking visibility.]

## 2026-07-03 - Approved Non-UNKNOWN Shipment Provider Scan Still Data-Blocked

Result: an approved read-only live provider scan ran from the deployed `allegro-service` pod without provider writes, Warehouse apply, Orders mutation, token output, raw ids, raw waybills, raw payloads, customer PII, raw DB rows, screenshots, or raw DOM. The scan checked up to 50 forwarded candidates and found one token-usable forwarded candidate. Checkout-form shipments returned HTTP 200 with one shipment/package, carrier tracking returned HTTP 200, but tracking history contained zero status events, so `foundNonUnknown=false` and status class counts were `{ UNKNOWN: 1 }`.

IPS chain: Vision -> real provider shipment movement should update Warehouse/Orders when the provider exposes a concrete carrier status; Goal Impact -> the optional real-provider mutation gate is now narrowed to live data availability rather than missing source code; System -> Allegro owns provider reads and redaction, Warehouse owns status intake/mutation, Orders owns lifecycle projection; Feature -> non-UNKNOWN provider shipment evidence; Task -> scan bounded forwarded candidates for concrete carrier status; Execution Plan -> temporary pod helper, read-only provider calls, no persistent helper; Coding Prompt -> no token/raw id/waybill/payload/customer output; Code -> temporary `/tmp` helper only; Validation -> sanitized scan summary plus Orders evidence artifact.

Remaining gate: `[MISSING: Allegro provider sample with carrier tracking status other than UNKNOWN]`. Existing proven evidence remains: real provider UNKNOWN/noop Warehouse intake and bounded fixture `IN_TRANSIT -> in_delivery` mutation.

## 2026-07-03 - Real Shipment Live-Read Refreshed, Non-UNKNOWN Sample Unavailable

Result: the optional real-provider shipment status scan was rerun after the hardened Warehouse token cutover without printing token values, raw Allegro checkout-form ids, raw account ids, waybills, customer fields, addresses, or provider payloads. Current readiness had one forwarded Allegro order with an account, but all stored OAuth access tokens were expired. An owner-approved bounded OAuth refresh updated only encrypted `allegro_accounts` token fields for one active account; the provider refresh returned HTTP 200, new access/refresh token material was stored encrypted, and no token values were printed. The sanitized shipment scan then reached the real Allegro checkout-form shipments endpoint and carrier tracking endpoint successfully (`shipmentEndpoint.http200=1`, `trackingEndpoint.http200=1`) for the single candidate. The only latest carrier status remained `UNKNOWN`, so no real non-UNKNOWN provider sample is currently available to prove a live provider-driven fulfillment mutation beyond the existing bounded `IN_TRANSIT` fixture.

IPS chain: Vision -> real provider shipment status can feed Warehouse without exposing provider/customer/tracking secrets; Goal Impact -> the optional non-UNKNOWN live-provider gate is now explicitly scanned and remains blocked by available provider data, not by code/token/RBAC; System -> Allegro owns OAuth refresh and sanitized provider reads, Warehouse owns status intake and mutation, Orders owns lifecycle projection evidence; Feature -> refreshed real provider shipment status scan; Task -> refresh one active account token, rerun bounded shipment/tracking scan, and preserve the non-UNKNOWN blocker; Execution Plan -> temporary pod helpers only, no repo code/runtime deploy, no Warehouse/Orders/provider write beyond encrypted OAuth token refresh; Coding Prompt -> no token values, raw ids, waybills, provider payloads, customer fields, DB rows, or full tracking reveal; Validation -> readiness `accountsWithFutureToken=1`, provider shipment HTTP 200, tracking HTTP 200, `latestStatusCounts.UNKNOWN=1`, `nonUnknownStatusCount=0`.

Remaining gates:

- [PROVEN: current Allegro OAuth token freshness restored for one active account without printing token values.]
- [PROVEN: real Allegro shipment endpoint and carrier tracking endpoint are reachable from the live pod after refresh.]
- [BLOCKED: no real provider sample with carrier tracking status other than UNKNOWN is currently available; live mutation evidence still depends on a future provider order/shipment status update or approved fixture.]
- [MISSING: future audited full-tracking reveal contract if product/security approves raw tracking visibility.]

## 2026-07-03 - Goal 24 Catalog Bundle External Publication Policy Handoff

Result: Allegro-owned handoff for Catalog `catalog.bundle.v1` external publication policy is recorded as fail-closed. Allegro must not publish, queue, regenerate, confirm, mutate, sync, or create one external Allegro offer/listing from a Catalog bundle until a future owner-approved Allegro implementation contract exists. Current allowed use remains operator suggestion, preview, local review evidence, or draft assistance that does not mutate external marketplace offers/listings and does not bypass product-level publication gates.

IPS chain: Vision -> related-product and bundle evidence can inform operators without unsafe external marketplace mutation; Goal Impact -> Catalog Goal 24 can close the Allegro-owned channel policy handoff while preserving downstream commerce blockers; System -> Catalog owns `catalog.bundle.v1`, Allegro owns Allegro marketplace publication policy and fail-closed guards, Orders/Warehouse/Payments/shipping owners retain commerce contracts; Feature -> Allegro Catalog bundle publication policy gate; Task -> resolve `[MISSING: Allegro-owned catalog.bundle.v1 external publication policy handoff]`; Execution Plan -> Allegro docs/status handoff only because source fail-closed gates and validation already exist on `origin/main`; Coding Prompt -> do not invent one-listing bundle support or mutate provider/queue/runtime state; Code -> `docs/validation/2026-07-03-goal24-allegro-bundle-publication-policy.md` and this status entry; Validation -> targeted policy document review, targeted source gate presence check, `git diff --check`, and focused policy/catalog sell-action specs.

State Update:

- `[RESOLVED/NARROWED: Allegro-owned catalog.bundle.v1 external publication policy handoff recorded as fail-closed in docs/validation/2026-07-03-goal24-allegro-bundle-publication-policy.md]`
- `[MISSING: future owner-approved Allegro one-listing bundle representation contract for catalog.bundle.v1]`
- `[MISSING: Warehouse bundle reservation/stock allocation contract]`
- `[MISSING: Orders bundle create-order and line-item decomposition contract]`
- `[MISSING: Payments/free-shipping/discount total contract]`
- `[MISSING: owner-approved shipping policy semantics for external marketplace bundles]`

## 2026-07-03 - Warehouse Service Token Runtime Projection Wired

Result: Allegro deployment source now projects the Auth-issued Warehouse shipment service token from Kubernetes Secret `allegro-service-secret` key `WAREHOUSE_INTERNAL_SERVICE_TOKEN`. This keeps shipment correlation on the Vault-managed `WAREHOUSE_INTERNAL_SERVICE_TOKEN` runtime path while source still supports `WAREHOUSE_SERVICE_TOKEN` as an optional compatibility fallback and avoids broad `ALLEGRO_INTERNAL_SERVICE_TOKEN` fallback for shipment posts. Runtime secret value was not printed or committed.

Validation: live rollout is on `localhost:5000/allegro-service:d088104`; runtime env contains `WAREHOUSE_INTERNAL_SERVICE_TOKEN`; Orders runtime evidence verified JWT signature, `internal:allegro-service:service`, absence of Warehouse-admin role, and no-central-order replay skipped with `MISSING_CENTRAL_ORDER_ID` without changing Warehouse aggregate counts.

## 2026-07-03 - Warehouse Shipment Token Fallback Hardened In Source

Result: Allegro shipment correlation now requires a Warehouse-specific token from `WAREHOUSE_SERVICE_TOKEN` or `WAREHOUSE_INTERNAL_SERVICE_TOKEN`; broad `ALLEGRO_INTERNAL_SERVICE_TOKEN` and generic `INTERNAL_SERVICE_TOKEN` no longer authorize shipment correlation posts in source. Focused coverage proves the enabled client blocks when only broad fallback tokens are present.

IPS chain: Vision -> recurring shipment provider ingestion must use least-privilege service identity; Goal Impact -> Allegro no longer relies on broad internal tokens for Warehouse shipment correlation; System -> Auth owns service-token issuance, Allegro owns caller token projection, Warehouse owns endpoint RBAC; Feature -> minimal Warehouse shipment token source; Task -> remove broad fallback token resolution and document runtime gate; Execution Plan -> source/tests/docs only, no secret or runtime mutation; Coding Prompt -> no token values, raw provider payload, tracking value, customer field, DB query, deploy, or provider read; Validation -> `npm run verify:warehouse-shipment-correlation`, build, diff check.

Superseded gate: Auth-issued Allegro service token is projected to runtime as `WAREHOUSE_INTERNAL_SERVICE_TOKEN`; remaining gates are optional real provider live-read refresh and future audited full-tracking reveal if product/security approves it.

# Allegro Service Orchestrator Status

## 2026-07-03 - Dedicated Warehouse Shipment Token Cutover Proven

Result: hardened Warehouse shipment RBAC cutover is live-proven. Auth DB already had a dedicated `allegro-service` service principal (`b490...`) and `internal:allegro-service:service` role assignment; a dedicated JWT was projected into the Vault-managed `allegro-service-secret/WAREHOUSE_INTERNAL_SERVICE_TOKEN` without printing token values. Live `allegro-service` deployment now has `WAREHOUSE_INTERNAL_SERVICE_TOKEN=true`, no required temporary `WAREHOUSE_SERVICE_TOKEN`, and `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true`, and Auth validates the dedicated token as `serviceName=allegro-service` with roles `[internal:allegro-service:service]`. Warehouse `d9ebb47` is deployed with shipment endpoints requiring the dedicated role. Runtime smoke from the Allegro pod proved the old broad `ALLEGRO_INTERNAL_SERVICE_TOKEN` is rejected by Warehouse shipment correlation with HTTP 403, while the dedicated `WAREHOUSE_INTERNAL_SERVICE_TOKEN` passes auth and reaches the expected synthetic business lookup HTTP 404.

IPS chain: Vision -> provider shipment ingestion uses least-privilege service identity; Goal Impact -> the broad-token runtime blocker is closed for Allegro shipment correlation/status ingestion; System -> Auth owns service-principal role validation, Allegro owns token projection, Warehouse owns endpoint RBAC; Feature -> dedicated Warehouse shipment service token cutover; Task -> project dedicated token, deploy Warehouse hardening, smoke old-token rejection/new-token acceptance; Execution Plan -> no token output, no provider write, no real order mutation; Coding Prompt -> token values and raw payloads remain hidden; Code -> Warehouse `d9ebb47`, Allegro runtime env projection; Validation -> Auth validate 201, Warehouse old-token 403, dedicated-token 404 auth-pass smoke, Allegro health 200.

Remaining gates:

- [PROVEN: dedicated Allegro shipment service token projected and accepted by hardened Warehouse runtime.]
- [PROVEN: broad `ALLEGRO_INTERNAL_SERVICE_TOKEN` rejected by hardened shipment endpoint.]
- [MISSING: product-approved tracking visibility policy for customer/admin UI display beyond bounded lifecycle stage.]
- [MISSING: provider sample with carrier tracking status other than UNKNOWN if product requires live status mutation evidence beyond bounded fixture.]


## 2026-07-03 - Real Allegro Shipment Live-Read Snapshot Proven Against Warehouse Runtime

Result: optional real-provider live-read proof completed on the currently deployed runtime without printing token values, raw Allegro checkout-form ids, raw account ids, waybills, customer fields, addresses, or provider payloads. The live `allegro-service` pod had no `ALLEGRO_SHIPMENT_STATUS_ACCESS_TOKEN`/`ALLEGRO_ACCESS_TOKEN` env, so the proof selected one already-forwarded Allegro order from the local projection using a pod-local read-only helper, decrypted the existing account OAuth token in memory, and wrote only temporary pod files under `/tmp`. The selected candidate had an active account, future token expiry, local order id, and central Orders id. `export-shipment-status-snapshots.js --live-read --confirm-live-read ALLEGRO_SHIPMENT_STATUS_LIVE_READ` called the real Allegro shipment endpoints and produced one sanitized `allegro.shipment_status_snapshot.v1` file. Sanitized result: `snapshotCount=1`, `sourceRead.status=AVAILABLE`, `latestStatus=UNKNOWN`, `sourceRead.reason=[UNKNOWN: carrier tracking details absent or older than provider retention]`, `packageCount=1`, waybill present only as hash, central/local order ids present in the file but not printed. Posting that snapshot to Warehouse provider-status intake returned HTTP 201; Warehouse DB readback showed `fulfillment_provider_status_observations=2`, latest real-provider observation `decision=accepted`, `source_status_class=UNKNOWN`, `normalized_warehouse_status=noop`, and the existing fulfillment order remained `in_delivery`.

Runtime caveat: this proof used the currently deployed Warehouse/Allegro runtime that still accepted the existing internal token path. Source commits `edb3a88` and Warehouse `ab7ac6e` harden shipment ingestion to a dedicated Warehouse/Allegro service token path, but that hardened cutover is not deployed in this evidence. A runtime config drift was also observed: live Allegro pods expose `DATABASE_URL_OVERRIDE` from `allegro-database-url-secret`, but that credential/host path failed for direct Prisma helper access; `allegro-service-secret:DATABASE_URL` with the actual Postgres listen address worked for read-only validation. Main `allegro-service` source uses shared `PrismaService` and DB_* config, so no runtime secret was changed during this proof.

IPS chain: Vision -> real marketplace shipment reads can feed Warehouse without raw provider/customer/tracking data exposure; Goal Impact -> the optional real-provider evidence gate moved from missing to proven for a bounded no-op provider status; System -> Allegro owns OAuth/source reads and sanitized projection, Warehouse owns correlation/ledger/status transition, Orders owns lifecycle callback projection; Feature -> real Allegro live-read snapshot proof; Task -> select one existing forwarded order, live-read shipments/tracking, post sanitized snapshot, and read back Warehouse ledger; Execution Plan -> temporary pod helpers only, no repo code change, no raw output, no provider write, no Orders mutation; Coding Prompt -> no tokens/raw ids/provider payload/customer fields; Code -> existing deployed runtime plus temporary `/tmp` helpers only; Validation -> sanitized exporter output, Warehouse intake HTTP 201, Warehouse DB readback `accepted/noop/UNKNOWN`.

Remaining gates:

- [PROVEN: real Allegro provider shipment endpoint live-read produced a sanitized snapshot and Warehouse accepted it as a no-op observation.]
- [MISSING: deploy/cutover of hardened dedicated Warehouse service token projection, replacing broad runtime token fallback.]
- [MISSING: product-approved tracking visibility policy for customer/admin UI display beyond bounded lifecycle stage.]
- [MISSING: provider sample with carrier tracking status other than UNKNOWN if product requires live status mutation evidence beyond the earlier sanitized IN_TRANSIT fixture.]


## 2026-07-03 - Warehouse Shipment Correlation Enabled And Intake Proven

Result: Allegro shipment correlation is now enabled in source manifests and live runtime. `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true` is declared in `.env.example`, `k8s/configmap.yaml`, and `k8s/deployment.yaml`; the live deployment also reports the flag as `true`. Existing `ALLEGRO_INTERNAL_SERVICE_TOKEN` passed Warehouse auth without printing token values. A pod-local sanitized replay posted one existing active Allegro shipment correlation to Warehouse with `posted=1`, `disabled=0`, `blocked=0`, `failed=0`; Warehouse correlation count stayed idempotent at `1`. After Warehouse `2553452` deployed the shipment snapshot intake endpoint, a sanitized `IN_TRANSIT` snapshot posted from the Allegro pod returned HTTP 201 with `statusMutationApplied=true`, `observationDecision=accepted`, `normalizedWarehouseStatus=in_delivery`, and fulfillment status `in_delivery`. No live Allegro provider read, raw provider payload, raw tracking value, customer field, credential value, or token value was printed.

Remaining gates:

- [MISSING: optional real provider live-read selection using raw Allegro account/order ids if product requires provider API evidence beyond sanitized existing-correlation smoke.]
- [MISSING: product-approved tracking visibility policy for customer/admin UI display beyond bounded lifecycle stage.]


## 2026-07-03 - Dead-Letter Runtime Deployed With Correlation Still Disabled

Result: Allegro `c00013b` is deployed for `allegro-service`, `allegro-api-gateway`, `allegro-frontend`, `allegro-settings`, and `allegro-imports`; all rolled out ready `1/1`. Runtime health returned HTTP 200 from `https://allegro.alfares.cz/api/health`. The deployed `allegro-service` manifest now has `ALLEGRO_SHIPMENT_DEAD_LETTER_DIR=/var/lib/allegro-service/shipment-correlation-dead-letter`, volume mount `shipment-correlation-dead-letter -> /var/lib/allegro-service/shipment-correlation-dead-letter`, and volume `shipment-correlation-dead-letter`. `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED` remains absent, so Warehouse correlation remains fail-closed. A synthetic redacted apply-mode replay with exact confirmation returned `posted=0`, `disabled=1`, reason `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED_NOT_TRUE`, `blocked=0`, `failed=0`; no dead-letter file was emitted because the dead-letter report had zero items. Warehouse readback stayed unchanged before/after at `fulfillment_provider_shipment_correlations=1` and `fulfillment_provider_status_observations=0`. No live Allegro provider read, Warehouse post, Orders call, fulfillment status mutation, raw provider payload, tracking value, customer field, or credential value was used.

IPS chain: Vision -> failed shipment correlation attempts have durable runtime storage while live correlation still requires explicit owner enablement; Goal Impact -> the dead-letter PVC/env deploy gate is closed and fail-closed behavior is reproven on the deployed image; System -> Allegro owns sanitized shipment replay and dead-letter artifact location, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> deployed dead-letter runtime path with disabled correlation gate; Task -> deploy `c00013b`, verify manifest/health, run disabled-gate replay, and prove Warehouse counts did not change; Execution Plan -> keep correlation flag absent, use synthetic redacted snapshot input, exact confirmation, and count readback only; Coding Prompt -> no provider live read, no raw output, no status mutation; Code -> Allegro `c00013b`; Validation -> shipment verifier suite, build, rollout, health, manifest check, disabled-gate smoke, Warehouse count readback.

Remaining gates:

- [MISSING: owner approval to set `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true` for one bounded live smoke.]
- [MISSING: approved safe order selection file and real token-source smoke boundaries.]
- [MISSING: end-to-end readback proving Warehouse correlation registration and no raw snapshot fields enter Orders events.]


## 2026-07-03 - Shipment Projection Runtime Deployed With Correlation Disabled

Result: Allegro guarded shipment projection/correlation source deployed after owner approval. Images `localhost:5000/allegro-service:ae9d381`, `allegro-api-gateway:ae9d381`, `allegro-frontend:ae9d381`, `allegro-settings:ae9d381`, and `allegro-imports:ae9d381` rolled out ready. Runtime health returned HTTP 200. `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED` is absent/null, so the Warehouse correlation path remains disabled by default. A synthetic redacted apply-mode replay with exact confirmation returned `posted=0`, `disabled=1`, reason `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED_NOT_TRUE`, and Warehouse row counts remained zero. No live Allegro provider read, Warehouse post, Orders call, fulfillment mutation, raw provider payload, tracking value, customer field, or credential value was used.

IPS chain: Vision -> shipment observations can be replayed safely only when the owner explicitly enables Warehouse correlation; Goal Impact -> deployed runtime now contains the guarded source path while proving fail-closed disabled behavior; System -> Allegro owns snapshot replay, Warehouse owns correlation/ledger, Orders owns lifecycle callbacks; Feature -> disabled shipment correlation runtime gate; Task -> deploy source and smoke disabled gate; Execution Plan -> deploy `ae9d381`, keep flag absent, run synthetic redacted replay, verify no Warehouse rows; Coding Prompt -> no provider live read, no raw output, no status mutation; Code -> existing Allegro `ae9d381`; Validation -> shipment verifier suite, build, rollout, health, disabled-gate smoke, Warehouse count readback.

Remaining gates:

- [MISSING: owner approval to set `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true` for one bounded live smoke.]
- [MISSING: approved safe order selection file and real token-source smoke boundaries.]
- [MISSING: end-to-end readback proving Warehouse correlation registration and no raw snapshot fields enter Orders events.]


## 2026-07-03 - Shipment Source Client And Projection Service

Result: source-only read-only shipment source client and sanitized projection service landed for Allegro-owned shipment status reads. `ShipmentStatusSourceClient` wraps `/order/checkout-forms/{id}/shipments` plus `/order/carriers/{carrierId}/tracking?waybill=...` as a Nest provider, keeps raw provider identifiers in memory only, never calls label/document/write endpoints, and does not attach provider payloads to thrown read errors. `ShipmentStatusProjectionService` converts the read bundle into `allegro.shipment_status_projection.v1` containing redacted `allegro.shipment_status_snapshot.v1` records and idempotency keys for downstream replay/handoff. No live Allegro provider call, Warehouse call, Orders call, DB write, deploy, migration, raw provider payload persistence, tracking output, customer field output, or fulfillment status mutation was performed.

IPS chain: Vision -> Allegro-origin shipment progress can be read and projected without leaking provider payloads; Goal Impact -> the durable read-only client/service implementation gate moved from missing to source-ready while runtime apply gates stay closed; System -> Allegro owns source reads and redacted projection, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> reusable shipment source client and projection service; Task -> add Nest providers, synthetic verifier coverage, and status handoff notes; Execution Plan -> source/test/docs only, no deploy/migration/live calls; Coding Prompt -> only read `/order/checkout-forms/{id}/shipments` and carrier tracking, keep shipment-management optional/fail-soft, no labels/documents/provider writes; Code -> `shipment-status-source.client.ts`, `shipment-status-projection.service.ts`, verifier scripts, module wiring, docs; Validation -> source client verifier, projection verifier, export verifier, replay verifier, handoff verifier, correlation verifier, snapshot verifier, service build, diff check.

Remaining gates:

- `[LANDED: source-only Nest read client for checkout-form shipments and carrier tracking]`
- `[LANDED: source-only sanitized projection service for allegro.shipment_status_snapshot.v1 records]`
- `[MISSING: owner-approved live runtime smoke using safe order selection file and real token source through the Nest client/projection service]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: deploy approval before the runtime pod receives shipment source/projection code and dead-letter PVC mount/env]`

## 2026-07-03 - Dead-Letter Runtime Path Manifest Readiness

Result: source-only manifest readiness landed for the shipment correlation dead-letter path. Kubernetes source now declares `ALLEGRO_SHIPMENT_DEAD_LETTER_DIR=/var/lib/allegro-service/shipment-correlation-dead-letter`, mounts that path from PVC `allegro-shipment-dead-letter-data`, and the service Docker image creates the same directory for non-Kubernetes/local runs. No deploy, `kubectl apply`, migration, provider call, Warehouse call, Orders call, DB write, secret read, production data read, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> failed shipment correlation attempts have durable operational review storage without raw provider payloads; Goal Impact -> the runtime volume/permission gate moved from missing to source-declared PVC-backed readiness; System -> Allegro owns dead-letter artifact storage, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> dead-letter runtime path manifest readiness; Task -> declare the writer-compatible env path and writable PVC mount; Execution Plan -> `.env.example`, configmap, deployment, Dockerfile, and docs only; Coding Prompt -> no deploy, no live calls, no secret output, no production data reads, no status mutation; Code -> `ALLEGRO_SHIPMENT_DEAD_LETTER_DIR`, `allegro-shipment-dead-letter-data` PVC, service volume mount, Dockerfile directory creation; Validation -> JSON/YAML manifest parse, replay verifier, snapshot verifier, service build, diff check.

Remaining gates:

- `[LANDED: source-declared PVC-backed runtime path for /var/lib/allegro-service/shipment-correlation-dead-letter]`
- `[MISSING: deploy approval before the runtime pod receives the PVC mount/env]`
- `[MISSING: owner-approved live runtime smoke with a safe order selection file and real token source]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`

## 2026-07-03 - Dead-Letter Retention Location

Result: source-only operational retention location support landed for shipment correlation dead-letter reports. `replay-shipment-status-handoff.ts` now resolves generated reports to `--dead-letter-file`, `--dead-letter-dir`, `ALLEGRO_SHIPMENT_DEAD_LETTER_DIR`, or the default `/var/lib/allegro-service/shipment-correlation-dead-letter` directory. Reports are written only when apply-mode handoff produces blocked, failed, or skipped items, and remain bounded to idempotency/retry metadata with no raw provider/customer/tracking fields. No live Warehouse call, live Allegro read, Orders call, DB write, deploy, migration, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> failed shipment correlation attempts have a durable operational review location without raw provider payloads; Goal Impact -> the dead-letter retention-location gate moved from missing to source-supported default plus overrides; System -> Allegro owns retry artifact creation, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> dead-letter report retention location; Task -> resolve default and override report paths; Execution Plan -> replay script/spec/docs only; Coding Prompt -> no DB writes, no deploy, no Warehouse or Orders mutation, no raw output; Code -> `resolveShipmentStatusDeadLetterPath`; Validation -> replay verifier, export verifier, handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: owner-approved live runtime smoke with a safe order selection file and real token source]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[LANDED: source-declared PVC-backed runtime path for /var/lib/allegro-service/shipment-correlation-dead-letter]`

## 2026-07-03 - Shipment Correlation Dead-Letter Report

Result: source-only dead-letter report support landed for Warehouse shipment correlation replay. `replay-shipment-status-handoff.ts` now accepts `--dead-letter-file` in apply mode and can write bounded `allegro.shipment_status_dead_letter.v1` reports for blocked, failed, and terminal skipped correlation attempts. Reports contain idempotency key, bounded reason, retry class, optional central order id and source reference hash only. No live Warehouse call, live Allegro read, Orders call, DB write, deploy, migration, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> failed shipment correlation attempts must be reviewable and retryable without raw provider payloads; Goal Impact -> the retry/DLQ policy gate now has source-level bounded artifact support; System -> Allegro owns handoff retry evidence, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> shipment correlation dead-letter report; Task -> emit bounded retry/terminal failure report from handoff outcomes; Execution Plan -> replay script/spec/docs only; Coding Prompt -> no DB writes, no deploy, no Warehouse or Orders mutation, no raw output; Code -> `replay-shipment-status-handoff.ts` dead-letter report support; Validation -> replay verifier, export verifier, handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: owner-approved live runtime smoke with a safe order selection file and real token source]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: owner-approved operational retention location for generated dead-letter report artifacts]`

## 2026-07-03 - Live Shipment Read Bundle Producer

Result: source-only live shipment read bundle producer landed behind exact confirmation. `export-shipment-status-snapshots.ts --live-read` now accepts an explicit order selection file, requires `--confirm-live-read ALLEGRO_SHIPMENT_STATUS_LIVE_READ`, reads only `/order/checkout-forms/{id}/shipments` plus `/order/carriers/{carrierId}/tracking?waybill=...`, keeps raw provider identifiers in memory only, and writes the same sanitized replay snapshot file. Tests use an injected read function; no live Allegro provider call, Warehouse call, Orders call, DB write, deploy, migration, raw provider payload persistence, tracking output, customer field output, or fulfillment status mutation was performed.

IPS chain: Vision -> live shipment observations can become sanitized Warehouse correlation input without raw provider payloads; Goal Impact -> the live-read implementation gate now has a confirmed, explicit-selection source path; System -> Allegro owns live shipment reads and snapshot-file production, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> confirmed live shipment read bundle producer; Task -> read selected shipments/tracking and emit sanitized snapshots; Execution Plan -> script/spec/package/docs only; Coding Prompt -> no DB writes, no deploy, no Warehouse or Orders mutation, no raw output; Code -> `export-shipment-status-snapshots.ts` live-read path and verifier; Validation -> export verifier, replay verifier, handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: owner-approved live runtime smoke with a safe order selection file and real token source]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`

## 2026-07-03 - Shipment Status Snapshot File Producer

Result: source-only snapshot-file producer landed for approved Allegro shipment read bundles. `export-shipment-status-snapshots.ts` accepts `allegro.shipment_status_read_bundle.v1` order inputs, maps them through the redacting `allegro.shipment_status_snapshot.v1` mapper, rejects forbidden raw marker keys in final snapshots, and writes a replay-compatible `allegro.shipment_status_snapshot_file.v1` JSON file for `replay-shipment-status-handoff.ts`. The live provider-read path is intentionally fail-closed behind `--live-read --confirm-live-read ALLEGRO_SHIPMENT_STATUS_LIVE_READ` until account/order selection, token handling, rate limits, and sanitized smoke are approved. No live Allegro read, Warehouse call, Orders call, DB write, deploy, migration, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> approved shipment observations can become replayable Warehouse correlation input without raw provider payloads; Goal Impact -> the missing snapshot-file producer gate now has a source-ready redacting file producer; System -> Allegro owns read-bundle-to-snapshot-file production, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> sanitized shipment status snapshot-file producer; Task -> write replay-compatible snapshot files and keep live reads fail-closed; Execution Plan -> script/spec/package/docs only; Coding Prompt -> no provider reads, no DB writes, no deploy, no Warehouse or Orders mutation; Code -> `export-shipment-status-snapshots.ts`, verifier, package scripts; Validation -> export verifier, replay verifier, handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: approved live shipment read implementation with account/order selection, token handling, rate limits, and sanitized smoke]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`

## 2026-07-03 - Shipment Status Replay Caller

Result: source-only Allegro replay caller landed for sanitized shipment status handoff artifacts. `replay-shipment-status-handoff.ts` accepts a JSON file containing either sanitized `allegro.shipment_status_snapshot.v1` snapshots or order-input fixtures that are first mapped through the redacting snapshot mapper. Dry-run validates and summarizes without network or DB access. Apply mode requires `--confirm-warehouse-handoff ALLEGRO_SHIPMENT_STATUS_WAREHOUSE_CORRELATION`, then feeds snapshots into `ShipmentStatusHandoffService`; the existing `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true` and Warehouse token gate still control actual posting. No live Allegro read, local DB write, Orders call, deploy, migration, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> approved shipment observations can be replayed to Warehouse without raw provider payloads; Goal Impact -> the missing durable replay-caller gate now has a source-ready CLI boundary for future projection artifacts; System -> Allegro owns sanitized replay input and handoff invocation, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> guarded shipment status replay caller; Task -> validate sanitized snapshot files and invoke handoff only under exact confirmation; Execution Plan -> script/spec/package/docs only; Coding Prompt -> no provider reads, no DB writes, no deploy, no Orders mutation; Code -> `replay-shipment-status-handoff.ts`, verifier, package scripts; Validation -> replay verifier, handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: approved producer that creates sanitized replay snapshot files from live Allegro shipment projection reads]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`

## 2026-07-03 - Shipment Status Handoff Hook

Result: source-only Allegro handoff hook landed for future shipment projection/replay jobs. `ShipmentStatusHandoffService.publishWarehouseCorrelations()` accepts sanitized `allegro.shipment_status_snapshot.v1` snapshots, invokes the disabled-by-default Warehouse correlation producer for each snapshot, aggregates posted/disabled/skipped/blocked/failed counts, and returns bounded per-snapshot idempotency-key summaries. No live Allegro read, Warehouse call, Orders call, DB write, deploy, migration, raw provider payload, tracking value, customer field, or fulfillment status mutation was performed.

IPS chain: Vision -> Allegro shipment observations can be handed to Warehouse without raw provider payloads; Goal Impact -> future projection/replay code now has a narrow source-ready runtime hook instead of duplicating Warehouse call logic; System -> Allegro owns sanitized snapshots and handoff invocation, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle callbacks; Feature -> source-only shipment status handoff hook; Task -> orchestrate batch snapshot correlation publication with bounded summary; Execution Plan -> service/spec/docs only; Coding Prompt -> no provider reads, no DB, no live Warehouse calls, no status mutation; Code -> `shipment-status-handoff.service.ts`, verifier, package script, module provider; Validation -> handoff verifier, correlation verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: approved durable Allegro shipment projection/replay runtime caller that feeds sanitized snapshots into ShipmentStatusHandoffService]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: owner approval to enable ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`

## 2026-07-03 - Warehouse Shipment Correlation Producer Client

Result: source-only Allegro producer client landed for Warehouse shipment correlation registration. The client maps sanitized `allegro.shipment_status_snapshot.v1` snapshots to `POST /api/fulfillment-orders/order/:orderId/provider-shipment-correlations`, computes the same `sourceReferenceHash` as Warehouse, posts only hashed identity fields, and is disabled unless `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true`. No live Warehouse call, deploy, migration, provider call, DB write, or fulfillment status mutation was performed.

IPS chain: Vision -> Allegro shipment observations can drive fulfillment visibility without raw provider payloads; Goal Impact -> Warehouse can correlate sanitized snapshots to central Orders fulfillment rows; System -> Allegro owns provider reads and hash producer, Warehouse owns correlation/ledger/fulfillment transitions, Orders owns lifecycle; Feature -> disabled-by-default Warehouse correlation producer; Task -> implement safe source-only client and verifier; Execution Plan -> mapper/client/spec/docs only; Coding Prompt -> no raw ids, no buyer/address/tracking URL fields, no live mutation; Code -> `warehouse-shipment-correlation.client.ts`, verifier, package script, module provider; Validation -> producer verifier, snapshot verifier, build, diff check.

Remaining gates:

- `[MISSING: owner approval to deploy Allegro source with ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: approved Allegro shipment projection/replay runtime caller]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`

## 2026-07-03 - Goal 24 Allegro Affinity Replay Producer Hardening

Result: source-only hardening completed for the protected Allegro order-affinity replay producer. The endpoint now returns deterministic window metadata, a bounded effective `windowEnd`, opaque cursor pagination, explicit `completeSnapshot` semantics, and repeatability rules for consumers. Focused tests cover paid/processable filtering, mapped two-product minimum, forbidden-field exclusion, protected access, cursor pagination, and repeatable window metadata. No deploy, Catalog edit, Marketing edit, Orders edit, Kubernetes change, secret read, or live data mutation was performed in this worker.

IPS chain: Vision -> marketplace purchase history can improve related-product evidence without leaking sensitive data; Goal Impact -> Allegro no longer depends on temporary `/tmp` SQL export for recurring affinity replay; System -> Allegro owns local replay producer while Marketing/Catalog remain downstream owners; Feature -> protected replay candidates endpoint; Task -> enforce deterministic complete/repeatable window semantics; Execution Plan -> Allegro-only source/test/docs; Coding Prompt -> bounded non-sensitive product snapshots only; Code -> `orders.service.ts` and `orders.service.spec.ts`; Validation -> focused orders spec and service build passed, final `git diff --check` recorded in validation doc; State Update -> Allegro producer blocker resolved, downstream Marketing ledger/parser/token blockers remain.

Remaining gates:

- `[MISSING: Marketing parser support for marketplace-owned replay source envelopes]`
- `[MISSING: Marketing runtime token mapping for ORDER_AFFINITY_MARKETPLACE_REPLAY_TOKEN or ALLEGRO_INTERNAL_SERVICE_TOKEN]`
- `[MISSING: durable Marketing backfill run ledger and idempotency key registry]`
- `[MISSING: owner-approved retention/decay policy for stale affinity rows]`

## 2026-07-03 - Checkout-Form Fulfillment Enum Fixtures

Result: sanitized runtime aggregate fixture evidence landed for local Allegro checkout-form status, payment status, fulfillment status, timestamp shapes, and missing source-reference joins. No raw order ids, buyer fields, addresses, raw payloads, tracking values, tokens, provider writes, DB mutations, Orders edits, Warehouse edits, deploys, or migrations were performed.

IPS chain: Vision -> checkout-form status evidence can inform Warehouse/Orders lifecycle work without leaking raw marketplace payloads; Goal Impact -> Warehouse now has sanitized enum fixture evidence for the checkout-form mapping gate; System -> Allegro owns source observation, Warehouse owns fulfillment transitions, Orders owns central lifecycle and paid handoff; Feature -> sanitized checkout-form fulfillment enum fixtures; Task -> record aggregate runtime fixture counts; Execution Plan -> read-only local projection probe; Coding Prompt -> counts/hashes only, no sensitive output; Code -> `docs/orchestrator/2026-07-03-allegro-checkout-form-fulfillment-fixtures.md`; Validation -> sanitized probe output plus `git diff --check`.

Evidence:

- Probe `allegro.checkout_form_enum_fixture_probe.v1` sampled 117 local projected checkout-form rows.
- `status`: `READY_FOR_PROCESSING=103`, `CANCELLED=14`.
- `paymentStatus`: `PAID=112`, `[NULL]=5`.
- `fulfillmentStatus`: `PICKED_UP=61`, `SENT=32`, `CANCELLED=22`, `RETURNED=2`.
- `trackingNumberPresent=0`, `rawShipmentFieldsPresent=0`, and `ordersWithForwardedCentralId=0`.
- Timestamp shapes are ISO-like for local `orderDate`/`updatedAt` and raw `updatedAt`; raw `createdAt` is absent in all sampled rows.

Remaining gates:

- `[MISSING: Orders source-reference preservation evidence; sampled local projection has zero forwarded central Orders ids.]`
- `[MISSING: approved Warehouse durable adapter ledger for checkout-form status observations.]`
- `[MISSING: approved timestamp ordering/replay semantics across Allegro updatedAt, local observation time, and Warehouse transition occurredAt.]`
- `[MISSING: owner approval before Warehouse runtime adapter, Allegro projection migration, deployment, or production fulfillment-row mutation.]`

Next action: verify Orders source-reference preservation for Allegro-origin Warehouse handoff joins without exposing raw provider payloads.


## 2026-07-03 - Real Buyer Synthetic Fixture Harness Source Prepared

Result: source-only, approval-gated synthetic buyer fixture lifecycle script added. Default execution performs no DB connection or mutation and exits with `approval_required_no_db_mutation`; approved create/cleanup modes require explicit confirmation, DB URL source, and Auth subject source. Created rows are prefixed `codex-real-buyer-smoke-` and cleanup is restricted to that prefix.

IPS chain: Vision -> real buyer cabinet smoke must prove Auth-subject ownership without email-only authorization; Goal Impact -> when no natural bound row exists, an approved synthetic subject-bound row can support the real buyer smoke and then be cleaned up; System -> Auth owns subject, Allegro owns buyer-safe projection, Orders lifecycle remains separate, provider/courier lane remains contract-gated; Feature -> guarded synthetic buyer fixture lifecycle; Task -> add default no-mutation create/cleanup script; Execution Plan -> insert one synthetic order and line item only after explicit confirmation; Coding Prompt -> no token/subject/raw id/customer/provider output; Code -> `scripts/manage-allegro-real-buyer-fixture.js`, package script `fixture:real-buyer-cabinet`, and fixture harness doc; Validation -> `node --check`, default `npm run fixture:real-buyer-cabinet`, default `npm run smoke:real-buyer-cabinet`, approved-mode missing-DB gate check, `git diff --check`. Runtime create/cleanup uses host `psql`, not an uninstalled Node `pg` module.

Remaining gates:

- `[MISSING: owner approval to create a synthetic subject-bound Allegro fixture row.]`
- `[MISSING: safe runtime DB URL source and Auth subject file/env path for approved execution.]`
- `[MISSING: approved Auth-valid buyer bearer for paired buyer smoke harness.]`
- `[MISSING: cleanup execution evidence after any approved fixture smoke.]`

Next action: approve fixture create plus guarded buyer smoke execution, then cleanup and record sanitized evidence.

## 2026-07-03 - Real Buyer Cabinet Smoke Harness Source Prepared

Result: source-only, approval-gated real buyer cabinet smoke harness added. Default execution performs no live calls and exits with `approval_required_no_live_call`; approved live mode requires explicit confirmation plus a caller-supplied buyer bearer and prints only sanitized statuses, counts, booleans, and short hashes.

IPS chain: Vision -> Allegro buyer cabinets must show only orders explicitly bound to the authenticated Auth subject; Goal Impact -> once a subject-bound row exists, real buyer list/detail smoke can run without ad hoc token or response logging; System -> Auth owns user identity, Allegro owns buyer-safe projection/UI, Orders owns canonical lifecycle, Warehouse owns fulfillment state; Feature -> guarded real buyer cabinet smoke harness; Task -> add reusable non-mutating smoke script; Execution Plan -> default source-only mode, explicit live env gate; Coding Prompt -> no token/order/customer/provider/tracking output; Code -> `scripts/smoke-allegro-real-buyer-cabinet.js`, package script `smoke:real-buyer-cabinet`, and harness doc; Validation -> `node --check`, default `npm run smoke:real-buyer-cabinet`, `git diff --check`.

Remaining gates:

- `[MISSING: approved subject-bound Allegro order row for the real buyer smoke.]`
- `[MISSING: approved Auth-valid buyer bearer acquisition path that does not print token values.]`
- `[MISSING: real forwarded Orders lifecycle display smoke if the approved row has no central Orders forwarding.]`
- `[BLOCKED: provider/courier runtime remains contract-gated by missing owner/contract/credentials/mapping/tracking visibility policy.]`

Next action: approve a subject-bound row option, then run `npm run smoke:real-buyer-cabinet` in approved live mode and record sanitized evidence.

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

Result: product/Auth/security owner approved Option 2 for the Allegro buyer personal cabinet ownership model via orchestrator instruction `Approved. Option2`. Source implementation is now deployed in live tag `ae9d381`: backend commit `78e0f5f` adds subject-bound buyer order reads, `buyerAuthSubject`, migration, buyer-safe DTOs, and isolation specs; frontend commit `735ad1f` adds `/cabinet/orders` against `GET /api/allegro/buyer/orders`. Runtime deploy is complete and the live DB contains the additive `buyerAuthSubject` column.

IPS chain: Vision -> customer-facing Allegro order cabinet shows only orders proven to belong to the authenticated buyer; Goal Impact -> buyer API/UI work can proceed without exposing imported marketplace rows by email/login; System -> Auth owns human identity and JWT `sub`, Allegro owns marketplace order projection, Orders owns canonical lifecycle snapshots; Feature -> buyer-scoped order cabinet contract; Task -> implement subject-bound read-only list/detail and UI; Execution Plan -> persist or derive an Auth subject binding, add buyer-only APIs and DTOs, keep seller/operator dashboard unchanged, validate isolation before deploy; Coding Prompt -> fail closed for unbound marketplace rows and never authorize by `buyerEmail`; Code -> backend `78e0f5f` plus frontend `/cabinet/orders` slice; Validation -> `orders.service.spec: PASS`, `order-client.service.spec: PASS`, `services/allegro-service npm run build`, `services/frontend npm run build`, `git diff --check`, rollouts for `allegro-service`, `allegro-api-gateway`, `allegro-frontend`, `allegro-settings`, and `allegro-imports`, live `/` 200, live `/cabinet/orders` 200, live unauthenticated buyer API 401, live invalid-token buyer API 401, DB column probe `buyerAuthSubjectColumn=1`, and authenticated synthetic buyer smoke with temporary order `e7e94b30-bfdd-49c2-acd2-decdfc7eb19f` returning list 200, detail 200, cross-buyer detail 404, no buyer email leak, no rawData leak, and cleanup delete confirmed.

Approved defaults:

- Ownership proof: `AllegroOrder.authUserId`/`buyerAuthSubject` or equivalent Orders `customer.authSubject`/`customer.authUserId` snapshot equals Auth bearer `sub`.
- Buyer route/API: `/cabinet/orders`, `GET /api/allegro/buyer/orders`, `GET /api/allegro/buyer/orders/:id`.
- Cross-buyer detail response: 404.
- Unbound imported marketplace rows: hidden from buyer APIs.
- Seller/operator `/dashboard/orders`: unchanged.

Remaining implementation gates:

- Historical marketplace rows remain hidden unless a future approved process writes explicit `buyerAuthSubject`; no email-only backfill is approved.
- `[MISSING: approved historical binding/backfill source, if product wants old imported rows visible in buyer cabinet.]`
- `[MISSING: product decision whether to create a durable non-production buyer smoke fixture or keep using ephemeral synthetic fixtures.]`

Next action: no buyer-cabinet runtime action is needed unless product wants historical imported rows backfilled into buyer visibility.

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
