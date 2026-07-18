# Allegro Primary Sales Channel Implementation Plan

Status: implementation master plan
Date: 2026-06-29
Owner: Allegro integration owner
Repository: `/home/ssf/Documents/Github/allegro`
Mode: planning and documentation only

This plan turns the current Allegro research and scripts into a governed primary
sales-channel platform for the Alfares ecosystem. Allegro is treated as the
first and most important sales channel, but the design must stay channel-aware
and not Allegro-only. Aukro, Bazos, FlipFlop, and future channels should reuse
the same ownership, projection, command, audit, and validation patterns.

The plan is intentionally explicit about what can be imported, what can be
exported, what cannot be written yet, and which service owns each decision. It
must be used together with:

- `docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/12_validation/VALIDATION_PYRAMID.md`
- `docs/orchestrator/VALIDATION_DEBT.md`
- `docs/11_tasks/*`, `docs/21_execution_plans/*`, `docs/13_context_packages/*`,
  `docs/14_prompts/*`, and `docs/12_validation/*` for task-specific IPS spines.

## 1. Intent Preservation Chain

### Vision

Allegro becomes the primary Alfares sales channel. The ecosystem can import
from Allegro, export to Allegro, reconcile with Allegro, and operate Allegro at
full commercial scale without losing source-of-truth boundaries.

### Goal Impact

The business impact is a reliable two-way channel bridge:

- Import Allegro orders, offers, product snapshots, stock snapshots, payments,
  billing, shipments, returns, claims, invoices, and issues.
- Export Catalog-backed products and Warehouse-backed stock to Allegro through
  guarded preview/apply flows.
- Forward only valid, fully mapped orders to orders-microservice.
- Preserve auditability, replayability, rollback, idempotency, and owner
  approval for every write.
- Keep the same channel framework usable for Aukro, Bazos, FlipFlop, and other
  future channels.

### System

`allegro-service` is the Allegro channel adapter and channel projection service.
It is not the canonical product, stock, order, payment, or identity service.

`allegro-service` owns:

- Allegro OAuth/account state.
- Allegro API clients and rate-limit behavior.
- Raw Allegro payload capture and redaction.
- Allegro channel projections.
- Allegro publish/update/stock command attempts.
- Sync cursors, sync runs, replay evidence, and command audit logs.
- API gateway/frontend channel surfaces for Allegro operations.

Other systems keep their ownership:

- Catalog owns canonical products, descriptions, media, pricing, marketplace
  profile fields, and channel-neutral product identity.
- Warehouse owns physical stock and stock reservations.
- orders-microservice owns central order lifecycle and fulfillment-facing order
  records.
- payments/finance services own payment creation, refund orchestration, payout
  and settlement business logic.
- imports service owns BizBox/current supplier import preview/apply workflows.
- Auth owns user identity and hosted login.

### Feature

Primary sales-channel data platform for Allegro import, export, reconciliation,
and controlled write-back.

### Task

Refactor the existing scripts and update ecosystem contracts so Allegro data
flows through shared ownership policies, durable projection models, guarded
scripts, and explicit validation gates.

### Execution Plan

This document defines the master execution plan. Every implementation lane must
create or update a normal IPS task spine before coding:

- `docs/11_tasks/TASK-0XX-*.md`
- `docs/22_goal_impact/GI-TASK-0XX-*.md`
- `docs/13_context_packages/CP-TASK-0XX-*.md`
- `docs/21_execution_plans/EP-TASK-0XX-*.md`
- `docs/14_prompts/PROMPT-TASK-0XX-*.md`
- `docs/12_validation/VAL-TASK-0XX-*.md`
- graph nodes where the repo already expects them.

### Coding Prompt

Coding prompts must be lane-specific and must include allowed files, forbidden
files, mutation boundaries, validation commands, handoff path, and the rule to
mark unavailable facts as `[MISSING: ...]` or `[UNKNOWN: ...]`.

### Code

The first code changes should be guardrail and framework changes, not new live
import/export writes. Any live apply path must follow preview-token binding,
idempotency, owner approval, and validation evidence.

### Validation

Planning validation is documentation and diff hygiene. Implementation validation
must include IPS gates, targeted unit/integration tests, dry-run output,
before/after counts, and explicit no-mutation evidence where applicable.

## 2. Current Baseline

### Existing documented evidence

The mapping document already captures the current Allegro import/export model:

- Allegro order projection has been applied locally for 117 orders and 125 line
  items, with 0 unmapped orders in the documented run.
- Existing order projection tables are `AllegroOrder` and
  `AllegroOrderLineItem`.
- Existing offer/product projections are `AllegroOffer`, `AllegroProduct`, and
  `AllegroPublishAttempt`.
- Existing mapping states that orders-microservice should receive only the
  central order subset, while billing, payment operations, shipments, returns,
  claims, invoices, issues, offer snapshots, and stock snapshots remain separate
  channel projections unless a specific owner consumes them.
- Existing mapping states that Warehouse owns physical stock and Allegro stock
  is a channel listing quantity snapshot or target, not physical stock truth.

### Existing safe or partly safe paths

Safe/read-only or guarded paths found during the planning pass:

- `services/allegro-service/src/scripts/audit-current-stock-source.ts`
  - declares read-only behavior.
  - emits `mutates: false`.
  - treats `/sale/product-offers/{offerId}.stock.available` as current Allegro
    stock evidence.
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts`
  - imports local Allegro checkout projection only.
  - has dry-run mode.
  - requires `--apply --confirm-local-only` for local projection writes.
  - explicitly forbids central orders, Catalog, Warehouse, Allegro, and BizBox
    writes.
- `services/imports/src/import/import.controller.ts`
  - exposes BizBox preview and apply endpoints.
  - preview is read-only.
- `services/imports/src/import/import.service.ts`
  - preview returns `mutatesWarehouse: false`.

### Existing unsafe or under-governed paths

These paths must be refactored before they are considered part of a primary
channel operating model:

- `services/allegro-service/src/scripts/import-order-offer-products.ts`
  - default dry-run exists.
  - `--apply` writes Catalog products, media, pricing, marketplace profiles, and
    local `AllegroOffer` rows.
  - its stock quantity comes from Allegro product-offer stock, not Warehouse.
- `services/allegro-service/src/scripts/import-allegro-offers-to-catalog.ts`
  - lacks a dry-run-only default gate.
  - activates account/settings and invokes import paths.
- `services/allegro-service/src/allegro/orders/orders.service.ts`
  - `syncOrdersFromAllegro()` upserts local orders/line items.
  - it can forward to orders-microservice.
- `services/allegro-service/src/allegro/offers/offers.service.ts`
  - legacy direct stock update is DB-first and then async remote write.
  - publish/update paths can POST/PATCH Allegro and activate offers.
- `services/imports/src/import/import.service.ts`
  - BizBox apply can create/update Catalog and set Warehouse stock.
- `scripts/migrate-products-to-catalog.ts`
  - live mode writes Catalog and Warehouse stock.
  - planning-safe flags are `--dry-run`, `--export-only`, and `--skip-stock`.
- Destructive or high-risk scripts:
  - `scripts/clean-database.ts`
  - `scripts/clean-catalog-products.ts`
  - any bulk delete/deactivate helpers in offer services.

### Current architectural gaps

- No implemented generic sales-channel abstraction exists yet.
- The only explicit channel value found in runtime mapping is
  `channel: "allegro"` in order forwarding.
- Generic `SyncJob` is too weak for primary-channel operations because it lacks
  account/domain/cursor identity.
- `WebhookEvent` is not linked to durable sync runs or projection audit logs.
- Existing idempotency is concentrated around publish attempts, not all import,
  projection, stock, billing, return, shipment, and command flows.
- PII is present in `AllegroOrder.rawData`, buyer fields, delivery addresses,
  and payment/billing payloads. Logging and raw payload storage need redaction
  rules before broad sync expansion.

## 3. North Star Architecture

### Principle A: channel adapter, not source of truth

`allegro-service` stores channel projections and command attempts. It never
becomes the canonical product, stock, order, payment, or identity database.

### Principle B: raw payload plus normalized projection

Every imported domain needs both:

- Raw payload capture, hashed and redacted.
- Normalized projection tables for query, UI, replay, and owner handoff.

Raw payloads preserve evidence. Projections preserve operability.

### Principle C: preview before apply

Every write-capable path must support:

- read-only discovery;
- dry-run;
- preview artifact;
- preview token bound to input hash, actor, account, mode, and time window;
- explicit confirmation;
- idempotent apply;
- post-apply evidence.

### Principle D: commands before remote writes

Remote Allegro writes must be represented as command attempts before and after
the API call. A command attempt records request payload, response payload,
idempotency key, status polling, terminal state, and failure context.

### Principle E: source-backed stock only

Warehouse owns stock. Allegro stock is a channel target or snapshot. Ordered
quantity is historical demand. BizBox/current supplier quantity is evidence for
import decisions, not automatically current physical stock unless a Warehouse
owner-approved workflow converts it.

### Principle F: channel-agnostic core vocabulary

Allegro should set the reference implementation for:

- channel account;
- channel listing;
- channel listing snapshot;
- channel order projection;
- channel stock snapshot;
- channel stock command;
- channel payment/billing projection;
- channel shipment/return/invoice projection;
- channel sync run;
- channel raw payload;
- channel command audit.

Future channels should implement those concepts with channel-specific clients
and projection details.

## 4. Target Components

### 4.1 Allegro API Client Layer

Purpose:

- Provide typed wrappers by Allegro domain.
- Centralize OAuth/account resolution.
- Centralize rate-limit handling and retries.
- Prevent scripts from calling raw HTTP clients directly.

Required client domains:

- accounts and OAuth status;
- sale offers and product-offers;
- categories and parameters;
- checkout forms;
- billing and billing types;
- payment operations and refunds;
- customer returns and refund claims;
- invoices;
- sale issues;
- shipping rates and shipments;
- One Fulfillment read surfaces where applicable;
- offer quantity change commands;
- publish/update/activation operations.

Acceptance criteria:

- Every client method declares direction: read, write, command-status, or
  mutation.
- Every mutation method accepts an idempotency key or command id where Allegro
  supports it.
- Every method returns sanitized metadata for logs.
- No new script bypasses this layer.

### 4.2 Sync Run Layer

Purpose:

- Track every import/export/audit run.
- Bind dry-run, preview, and apply steps together.
- Store cursor before/after and aggregate counts.
- Provide replay evidence.

Proposed model: `AllegroSyncRun`

Fields:

- `id`
- `accountId`
- `domain`
- `direction`
- `mode`
- `status`
- `idempotencyKey`
- `startedAt`
- `completedAt`
- `scannedCount`
- `createdCount`
- `updatedCount`
- `unchangedCount`
- `skippedCount`
- `failedCount`
- `cursorBefore`
- `cursorAfter`
- `configSnapshot`
- `errorSummary`
- `createdByUserId`

Domain examples:

- `orders`
- `offers`
- `products`
- `stock_snapshots`
- `stock_commands`
- `billing`
- `payment_operations`
- `returns`
- `claims`
- `invoices`
- `issues`
- `shipments`
- `fulfillment`
- `bizbox_import`

### 4.3 Cursor Layer

Purpose:

- Avoid double-sync and missed data.
- Support per-account, per-domain, per-endpoint cursor ownership.

Proposed model: `AllegroSyncCursor`

Fields:

- `id`
- `accountId`
- `domain`
- `endpoint`
- `cursorType`
- `cursorValue`
- `watermarkAt`
- `lastRunId`
- `lockedUntil`
- `updatedAt`

Unique key:

- `(accountId, domain, endpoint, cursorType)`

### 4.4 Raw Payload Layer

Purpose:

- Keep immutable source evidence.
- Support projection replay and debugging.
- Support redaction and PII classification.

Proposed model: `AllegroRawPayload`

Fields:

- `id`
- `syncRunId`
- `accountId`
- `domain`
- `endpoint`
- `externalId`
- `revision`
- `payloadHash`
- `payload`
- `piiClass`
- `redactionVersion`
- `receivedAt`

Unique key:

- `(accountId, domain, externalId, payloadHash)`

Rules:

- Logs must use hashes and aggregate counts, not full payloads.
- Raw payload access must be limited to trusted debugging paths.
- Redaction version changes must be recorded.

### 4.5 Projection Audit Layer

Purpose:

- Record what changed in local projections.
- Make replay and rollback reviewable.

Proposed model: `AllegroProjectionAuditLog`

Fields:

- `id`
- `syncRunId`
- `accountId`
- `entityType`
- `entityId`
- `externalId`
- `action`
- `beforeHash`
- `afterHash`
- `diffSummary`
- `redactedContext`
- `idempotencyKey`
- `createdAt`

Actions:

- `created`
- `updated`
- `unchanged`
- `skipped`
- `blocked`
- `failed`

### 4.6 Command Attempt Layer

Purpose:

- Represent every outbound Allegro write before it happens.
- Support idempotency, retries, status polling, and failure review.

Existing model:

- `AllegroPublishAttempt`

Additional proposed models:

- `AllegroStockCommandAttempt`
- later generic `AllegroCommandAttempt` if publish, stock, shipment, invoice, and
  issue flows need a shared command table.

Proposed `AllegroStockCommandAttempt` fields:

- `id`
- `accountId`
- `offerId`
- `allegroOfferId`
- `commandId`
- `idempotencyKey`
- `requestedAvailable`
- `warehouseAvailableAtDecision`
- `status`
- `requestPayload`
- `responsePayload`
- `queuedAt`
- `polledAt`
- `completedAt`
- `failureContext`

Rules:

- Stock commands must use Warehouse availability as decision input.
- Stock commands must use Allegro quantity command endpoints and status polling.
- Legacy DB-first stock paths are not approved for production apply.

### 4.7 Script Framework Layer

Purpose:

- Refactor ad hoc scripts into consistent guarded tools.
- Stop each script from inventing its own safety model.

Proposed shared modules:

- `services/allegro-service/src/scripts/lib/cli.ts`
- `services/allegro-service/src/scripts/lib/guards.ts`
- `services/allegro-service/src/scripts/lib/run-summary.ts`
- `services/allegro-service/src/scripts/lib/redaction.ts`
- `services/allegro-service/src/scripts/lib/preview-token.ts`
- `services/allegro-service/src/scripts/lib/account-resolver.ts`
- `services/allegro-service/src/scripts/lib/allegro-http.ts`
- `services/allegro-service/src/scripts/lib/mutation-policy.ts`

Required standard flags:

- `--dry-run`
- `--apply`
- `--confirm-<scope>`
- `--preview-token <token>`
- `--account-id <id>`
- `--since <timestamp>`
- `--limit <n>`
- `--output-json`
- `--no-forward`
- `--no-catalog`
- `--no-warehouse`
- `--no-allegro-write`

Required output fields:

- `script`
- `mode`
- `accountId`
- `domain`
- `mutates`
- `mutatesCatalog`
- `mutatesWarehouse`
- `mutatesOrders`
- `mutatesAllegro`
- `scannedCount`
- `createdCount`
- `updatedCount`
- `unchangedCount`
- `skippedCount`
- `failedCount`
- `previewToken`
- `inputHash`
- `runId`
- `warnings`
- `blockedReasons`

## 5. Data Ownership Matrix

| Domain | Allegro source | Local projection | Canonical owner | Export-back owner | Notes |
| --- | --- | --- | --- | --- | --- |
| Account/OAuth | Allegro auth | `AllegroAccount` | allegro-service | allegro-service | Hosted Auth remains human identity owner. |
| Product identity | Allegro product/offers, Catalog | `AllegroProduct`, `AllegroOffer.catalogProductId` | Catalog | Catalog plus Allegro publisher | Allegro stores channel links, not canonical product truth. |
| Offer/listing | Allegro sale offer/product-offer | `AllegroOffer` | allegro-service for channel snapshot; Catalog for product content | Allegro publish lifecycle | Listing is a channel representation of Catalog data. |
| Category/parameters | Allegro category APIs | category/parameter cache or raw payload | allegro-service cache, Catalog mapping policy | Allegro publisher | Needed before valid export-back. |
| Stock snapshot | Allegro product-offer detail | `AllegroOfferStockSnapshot` | Warehouse for physical stock; allegro-service for channel snapshot | Warehouse-backed stock command lane | Ordered quantity is not stock. |
| Stock command | Allegro quantity command API | `AllegroQuantityCommandAttempt` | Warehouse decision, allegro-service command | Warehouse-backed stock sync planner | Current-stock Warehouse import executed once; recurring Allegro quantity-command write-back is implemented for `stock.updated` and `stock.out`. |
| Checkout/order | Allegro checkout forms | `AllegroOrder`, `AllegroOrderLineItem` | orders-microservice for central order | orders-microservice | Forward only fully mapped orders. |
| Buyer/delivery | Allegro checkout forms | order projection fields/raw payload | orders-microservice after accepted forward | none | PII, redaction required. |
| Payment summary | Allegro checkout/payment summary | order projection plus payment operation projection | payments/finance for payment logic | none initially | Start read-only. |
| Billing entries | Allegro billing APIs | `AllegroBillingEntry` | finance/accounting consumer | none initially | Do not mix with order records. |
| Payment operations | Allegro payment operation APIs | `AllegroPaymentOperation` | finance/payments | none initially | No captures/refunds/payout writes initially. |
| Refunds/claims | Allegro refunds/claims APIs | refund/claim projections | customer service/finance owner | blocked until owner approval | Read-only first. |
| Returns | Allegro customer returns APIs | return projections | customer service/orders owner | blocked until owner approval | Read-only first. |
| Invoices | Allegro invoice APIs | invoice projection | finance/customer service | blocked until owner approval | Do not generate/send invoices until approved. |
| Issues/disputes | Allegro sale issue APIs | issue projection | customer service owner | blocked until owner approval | Read-only first. |
| Shipments | Allegro shipment APIs | shipment/package/document projection | fulfillment/shipping owner | blocked until owner approval | Label/document creation is a write. |
| One Fulfillment | Allegro fulfillment APIs | fulfillment projections | fulfillment owner | blocked until owner approval | Scope-dependent. |
| BizBox supplier data | BizBox/current supplier files/API | import preview/apply records | imports service plus Catalog/Warehouse | imports workflow | Apply requires preview token and owner gates. |

## 6. Import Domains

### 6.1 Orders

Goal:

- Import Allegro checkout forms into local projections.
- Forward only valid and mapped order payloads to orders-microservice.

Current state:

- Local projection importer exists and is guarded.
- Runtime order service can upsert projections and forward to orders.

Required changes:

- Split `OrderProjectionImporter` from `OrderForwardingService`.
- Add sync-run and raw-payload capture to local order imports.
- Add account-aware cursors.
- Add replay equality checks for forwarded payloads.
- Add blocked state for orders with unmapped line items or missing Catalog links.
- Add a no-forward mode for all bulk import scripts.

Forwarding criteria:

- Every line item has a Catalog product mapping.
- `externalOrderId` is stable and unique per channel account.
- `channel = "allegro"`.
- `channelAccountId` is included.
- Buyer/delivery/payment summary fields are redacted in logs.
- Replay of the same source payload produces the same central order payload.

Do not do yet:

- Do not create central orders from incomplete line mapping.
- Do not write order status/payment updates back to orders-microservice without
  a separate owner-approved contract.

### 6.2 Offers and Products

Goal:

- Import Allegro offers and product snapshots into local channel projections.
- Map them to Catalog products where possible.
- Prepare safe Catalog enrichment workflows without silently overwriting product
  truth.

Current state:

- `AllegroProduct` and `AllegroOffer` exist.
- Several scripts can write Catalog and local offers.
- `CatalogSellActionService` is the closest current Catalog-to-Allegro channel
  layer.

Required changes:

- Create `CatalogChannelProjectionService` for product/media/pricing/marketplace
  projection updates.
- Require dry-run and preview-token apply for Catalog writes.
- Separate "import channel snapshot" from "create/update Catalog product".
- Add conflict classification:
  - no Catalog match;
  - weak Catalog match;
  - existing Catalog product differs;
  - category mapping missing;
  - media mismatch;
  - price mismatch;
  - stock must not be trusted from Allegro.
- Add account-aware offer identity.

Do not do yet:

- Do not use Allegro product-offer stock as Warehouse stock.
- Do not activate accounts/settings as a side effect of an import script.

### 6.3 Stock Snapshots

Goal:

- Import current Allegro listing stock as channel evidence.
- Never treat it as Warehouse truth.

Current state:

- Read-only current stock audit script exists.
- Mapping doc states only product-offer detail stock is current channel evidence.

Required changes:

- Add `AllegroOfferStockSnapshot`.
- Persist snapshot source endpoint, fetched time, payload hash, and authority
  classification.
- Add dry-run compare between current `AllegroOffer.stockAvailable` and fresh
  product-offer detail stock.
- Emit warnings when order history, offer list, product-offer detail, and local
  projection disagree.

Do not do yet:

- Do not mutate Warehouse.
- Do not mutate Allegro stock.
- Do not infer stock from order quantity.

### 6.4 Billing and Payment Operations

Goal:

- Import Allegro billing and payment operation data for finance visibility.
- Keep it separate from central orders until finance contracts are explicit.

Required projections:

- `AllegroBillingType`
- `AllegroBillingEntry`
- `AllegroPaymentOperation`
- `AllegroPaymentRefund`

Required changes:

- Add read-only API clients.
- Add sync runs and cursors.
- Add PII and finance redaction rules.
- Add reconciliation keys to connect billing entries to offer/order/account
  where Allegro provides them.

Do not do yet:

- Do not create payments in payments-microservice.
- Do not initiate refunds, captures, payouts, or settlement writes.

### 6.5 Returns, Claims, Invoices, Issues

Goal:

- Import after-sale operational data so customer service and finance can see the
  Allegro state.

Required projections:

- `AllegroCustomerReturn`
- `AllegroRefundClaim`
- `AllegroOrderInvoice`
- `AllegroSaleIssue`

Required changes:

- Add read-only clients and projection models.
- Link to order projection by Allegro order id where possible.
- Link to central order only after central order mapping exists.
- Add redaction for messages, buyer data, addresses, invoice data, and issue
  details.

Do not do yet:

- Do not accept/deny returns.
- Do not approve/refuse claims.
- Do not generate/send invoices.
- Do not write issue replies.

### 6.6 Shipments and One Fulfillment

Goal:

- Import shipment, package, document, and fulfillment state.
- Prepare future shipping label and fulfillment commands behind owner approval.

Required projections:

- `AllegroShipment`
- `AllegroShipmentPackage`
- `AllegroShipmentDocument`
- One Fulfillment-specific projections where scopes exist.

Required changes:

- Add read-only clients first.
- Link shipment projections to order projections.
- Track document metadata without storing sensitive binary documents unless
  storage/security policy is explicit.

Do not do yet:

- Do not create shipping labels.
- Do not generate shipment documents.
- Do not mutate fulfillment state.

## 7. Export Domains

### 7.1 Catalog to Allegro Offer Export

Goal:

- Publish and update Allegro listings from Catalog-owned data through a governed
  lifecycle.

Required source data:

- Catalog product id.
- Title/name.
- Description.
- Category mapping.
- Required Allegro parameters.
- Media/image URLs.
- Price and currency.
- VAT/tax profile if required.
- Delivery, warranty, return, and implied profile data.
- Warehouse-backed available quantity for stock target.

Required changes:

- Centralize create/PATCH/activate in `AllegroListingPublisher`.
- Reuse `AllegroPublishAttempt` or extend to a generic command attempt model.
- Enforce category/parameter validation before publish.
- Enforce preview/apply and idempotency.
- Add rollback plan for failed activation.
- Add UI/API status surfaces for draft, ready, blocked, attempted, published,
  failed, and drifted states.

Do not do yet:

- Do not publish if required category parameters are unknown.
- Do not publish if Warehouse availability cannot be resolved.
- Do not allow scripts to directly activate listings without publish lifecycle.

### 7.2 Warehouse to Allegro Stock Export

Goal:

- Update Allegro listing quantity from Warehouse availability through durable
  command attempts.

Required source data:

- Warehouse available stock for Catalog product.
- Listing mapping from Catalog product to Allegro offer.
- Current Allegro stock snapshot.
- Reservation/oversell policy.
- Minimum/maximum channel quantity policy.
- Account rate-limit policy.

Required changes:

- Create `WarehouseBackedStockSyncPlanner`.
- Create `AllegroStockCommandAttempt`.
- Use Allegro quantity command endpoint and status polling.
- Store decision inputs and command result.
- Integrate RabbitMQ stock events as trigger candidates.
- Add "plan only", "preview", and "apply" modes.

Blocked until:

- Warehouse owner approves exact stock availability semantics.
- Stock orchestration thread approves source evidence and command policy.
- Rate-limit and retry behavior is source-backed.

Forbidden:

- No direct Warehouse mutation from Allegro stock sync.
- No legacy DB-first Allegro stock update in production.
- No stock import based on historical order quantity.

### 7.3 Orders Back to Allegro

Goal:

- Only after central order and fulfillment owner approval, decide which statuses
  or shipment events should be written back to Allegro.

Current plan:

- Read-only order import and central forwarding first.
- Shipment/fulfillment write-back is a later lane.

Forbidden now:

- No order status write-back.
- No shipment creation.
- No refund/claim/invoice write-back.

## 8. Existing Script Refactor Plan

### 8.1 `import-checkout-forms-local.ts`

Target state:

- Thin CLI wrapper around `OrderProjectionImporter`.
- Uses `AllegroSyncRun`, `AllegroRawPayload`, `AllegroProjectionAuditLog`, and
  `AllegroSyncCursor`.
- Keeps default dry-run and `--apply --confirm-local-only`.
- Adds optional `--preview-token` once preview artifacts are implemented.

Allowed writes:

- Local Allegro order projections only, and only in confirmed local-only mode.

Forbidden writes:

- orders-microservice.
- Catalog.
- Warehouse.
- Allegro.
- BizBox/imports.

Code comment anchor:

- At the apply gate: "This script writes local Allegro projections only. Do not
  add central order forwarding here; use the owner-gated forwarding lane."

### 8.2 `import-order-offer-products.ts`

Target state:

- Split into:
  - offer/product raw import;
  - local channel projection update;
  - Catalog proposal generation;
  - Catalog apply through owner-gated preview token.
- Default dry-run remains.
- `--apply` cannot write Catalog unless a preview token confirms Catalog owner
  scope.

Allowed writes after refactor:

- Local Allegro offer/product projections in confirmed local projection mode.
- Catalog writes only through `CatalogChannelProjectionService` with owner gate.

Forbidden writes:

- Warehouse stock writes.
- Allegro remote writes.
- automatic account activation.

Code comment anchor:

- Near marketplace quantity mapping: "Marketplace quantity is a channel override
  or listing snapshot; it is not Warehouse physical stock."

### 8.3 `import-allegro-offers-to-catalog.ts`

Target state:

- Refactor or deprecate.
- It must become dry-run by default.
- Account activation/settings changes must be removed from import side effects.
- Catalog writes must route through preview-token apply.

Allowed writes after refactor:

- None by default.
- Catalog writes only with explicit owner-confirmed apply.

Forbidden writes:

- Account activation as import side effect.
- Warehouse writes.
- Allegro writes.

### 8.4 `audit-current-stock-source.ts`

Target state:

- Keep read-only.
- Add optional persistence of `AllegroOfferStockSnapshot` in local-only confirmed
  mode, after schema exists.
- Keep `mutates: false` for audit mode.

Allowed writes:

- None in audit mode.
- Future local snapshot projection only with explicit local-only confirmation.

Forbidden writes:

- Warehouse.
- Allegro.
- Catalog.
- orders-microservice.

### 8.5 `scripts/harvest-order-offers.js`

Target state:

- Deprecate or rewrite in TypeScript under the shared script framework.
- Must not bypass guards.

### 8.6 `scripts/migrate-products-to-catalog.ts`

Target state:

- Keep out of normal Allegro channel operations.
- If retained, wrap live mode with owner-gated preview/apply and `--skip-stock`
  default.
- Document as migration-only, not operational sync.

Code comment anchor:

- Near `setStock`: "Warehouse stock mutation is owner-gated. Do not run from an
  Allegro channel sync without the Warehouse-approved import contract."

### 8.7 BizBox import scripts/services

Target state:

- Keep preview/apply split.
- Require category mapping readiness.
- Bind apply to preview token and input hash.
- Route Warehouse stock mutation through Warehouse-approved policy only.

Code comment anchor:

- Near BizBox apply stock path: "BizBox stock changes mutate Warehouse and are
  not part of Allegro channel import unless the imports and Warehouse owners
  approve the apply run."

### 8.8 Offer publish/update/stock service methods

Target state:

- `AllegroListingPublisher` owns create/PATCH/activate.
- `WarehouseBackedStockSyncPlanner` owns stock command planning.
- Legacy public endpoints call governed services or are blocked for production.

Code comment anchors:

- Near direct stock update method: "Legacy DB-first stock update is not approved
  for production stock sync. Use durable stock command attempts."
- Near PATCH quantity payload: "This is Allegro channel target quantity, not a
  physical stock source."

## 9. Ecosystem Application Updates

### 9.1 Catalog

Required updates:

- Define the Catalog fields that Allegro can consume:
  - title/name;
  - description;
  - media;
  - pricing;
  - category mapping;
  - marketplace profile fields;
  - product identifiers;
  - VAT/tax profile.
- Define Catalog-facing Allegro routes:
  - sell on Allegro;
  - Allegro status;
  - Allegro draft;
  - Allegro confirmation.
- Add contract tests for payloads used by `CatalogSellActionService`.
- Add a projection list for frontend Catalog pages.

Forbidden:

- No Catalog DB writes from Allegro except through Catalog public APIs.
- No direct FK assumption from Allegro database to Catalog database.

### 9.2 Warehouse

Required updates:

- Confirm exact meaning of available stock:
  - total;
  - reserved;
  - sellable;
  - damaged/blocked;
  - inbound;
  - location-specific availability.
- Confirm RabbitMQ events that can trigger stock sync:
  - `stock.updated`;
  - `stock.low`;
  - `stock.out`.
- Define stock sync decision policy:
  - zero-stock behavior;
  - oversell buffer;
  - account/listing maximum;
  - stale event handling;
  - command retry limits.

Forbidden:

- No Warehouse mutation from Allegro channel sync.
- No stock command apply until Warehouse owner signs off.

### 9.3 orders-microservice

Required updates:

- Confirm `orders.create.v1` contract for:
  - `channel`;
  - `externalOrderId`;
  - `channelAccountId`;
  - buyer;
  - delivery;
  - lines;
  - payment summary;
  - totals.
- Add replay equality tests.
- Define duplicate handling and idempotent central create behavior.
- Define blocked order handling when a line item is unmapped.

Forbidden:

- No central order apply from bulk import until replay and mapping validation
  pass.
- No order status/payment write-back until a separate owner-approved contract.

### 9.4 payments/finance

Required updates:

- Define read-only projection schema for Allegro billing and payment operations.
- Define any lookup contract against payments-microservice.
- Define reconciliation report format.
- Define refund/settlement ownership before writes.

Forbidden:

- No captures.
- No refunds.
- No payout or settlement writes.
- No payment creation from Allegro imported data.

### 9.5 imports/BizBox

Required updates:

- Keep preview/apply split.
- Add category mapping readiness gate.
- Add input hash and preview-token binding.
- Add owner gates for Catalog and Warehouse writes.
- Add run summaries compatible with the Allegro script framework.

Forbidden:

- No BizBox apply without preview token.
- No Warehouse mutation without Warehouse/import owner approval.

### 9.6 API gateway and frontend

Required updates:

- Keep hosted Auth redirects and callback state validation.
- Route `/api/allegro/*` and `/api/import/*` through existing gateway patterns.
- Add operational screens for:
  - account status;
  - sync runs;
  - orders;
  - unmapped orders;
  - offers;
  - publish attempts;
  - stock snapshots;
  - stock command attempts;
  - billing/payment projections;
  - shipments/returns/invoices/issues;
  - BizBox previews and applies.
- UI must label read-only, preview, and apply states clearly.

Forbidden:

- No local login/register forms when hosted Auth exists.
- No UI button that triggers production write without preview-token confirmation
  and owner scope.

## 10. Phased Roadmap

### Phase 0: Guardrails and documentation freeze

Objective:

- Preserve current research and prevent unsafe mutations while implementation
  tasks are prepared.

Deliverables:

- This master plan.
- Mapping document link to this plan.
- Agent-ready lanes.
- Clear forbidden-write list.

Allowed files:

- `docs/orchestrator/*`
- task/planning docs only.

Forbidden:

- Code changes that mutate data.
- Live imports.
- Live exports.
- Chrome/browser-control.
- Warehouse or BizBox mutations.

Validation:

- `git status --short --branch`
- `git diff --check`
- doc review.

Acceptance:

- Plan committed.
- Repo clean after commit.
- No live data mutation performed.

### Phase 1: Script safety framework

Objective:

- Refactor scripts to use common guard, preview, redaction, account, and summary
  utilities.

Deliverables:

- Shared script framework modules.
- Converted `import-checkout-forms-local.ts`.
- Converted or deprecated `harvest-order-offers.js`.
- Updated script README/runbook.
- Code comments at unsafe write anchors.

Allowed files:

- `services/allegro-service/src/scripts/lib/*`
- guarded script files.
- docs/runbooks.

Forbidden:

- Prisma schema changes unless this phase is combined with Phase 2 by the
  integration owner.
- Live applies.
- Warehouse/Catalog/Allegro writes.

Validation:

- `git diff --check`
- `cd services/allegro-service && npm run build`
- dry-run script commands with output captured.
- no-mutation evidence in validation report.

Acceptance:

- Scripts emit standard summary fields.
- Apply gates are impossible to trigger accidentally.
- Existing safe local order import behavior is preserved.

### Phase 2: Sync and projection schema foundation

Objective:

- Add durable sync, cursor, raw payload, and audit models.

Deliverables:

- Prisma schema additions.
- Migration SQL.
- Type generation.
- Minimal repository/service helpers.
- Dry-run backfill count plan.

Allowed files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- service helpers in Allegro service only.
- validation docs.

Forbidden:

- Data backfill apply without separate dry-run report.
- Destructive migration.
- Renaming existing camelCase fields without compatibility plan.

Validation:

- migration SQL review.
- Prisma generate.
- service build.
- targeted helper tests.

Acceptance:

- Existing projections remain compatible.
- New tables are additive and nullable where needed.
- No existing order/offer import breaks.

### Phase 3: Read-only import pipelines

Objective:

- Build read-only imports for every Allegro domain before any write-back.

Deliverables:

- Orders local projection importer with sync runs.
- Offer/product projection importer with sync runs.
- Stock snapshot importer.
- Billing/payment projection importer.
- Returns/claims/invoices/issues importer.
- Shipment/fulfillment projection importer.

Allowed writes:

- Local Allegro projection tables only, gated by local-only apply.

Forbidden:

- Central order forwarding in bulk mode.
- Catalog writes.
- Warehouse writes.
- Allegro remote writes.
- payments writes.

Validation:

- dry-run counts.
- local-only apply on controlled data only after preview.
- before/after table counts.
- PII redaction check.

Acceptance:

- Every domain can be fetched, stored as raw payload, projected, and replayed.
- Unmapped or unsupported data is blocked, not guessed.

### Phase 4: orders-microservice integration

Objective:

- Forward valid Allegro orders to central orders through an owner-approved
  contract.

Deliverables:

- `OrderForwardingService` with replay equality.
- Mapping completeness report.
- Idempotent create/replay tests.
- Blocked-order report.

Allowed writes:

- orders-microservice only in explicit approved apply mode.

Forbidden:

- Forwarding orders with unmapped products.
- Updating central payment/order status without a separate contract.

Validation:

- contract tests against `orders.create.v1`.
- dry-run payload diff.
- idempotency/replay proof.
- small approved apply run.

Acceptance:

- Replaying an already forwarded Allegro order is safe.
- Missing mappings block forwarding with actionable evidence.

### Phase 5: Offer export and publish lifecycle hardening

Objective:

- Export Catalog-backed offers to Allegro through governed lifecycle.

Deliverables:

- `AllegroListingPublisher`.
- Category/parameter validation.
- Publish attempt improvements.
- Frontend/API publish status surfaces.

Allowed writes:

- Allegro publish/update only after preview-token apply and owner approval.

Forbidden:

- Direct script activation.
- Publish without required category parameters.
- Publish with stock not backed by Warehouse decision.

Validation:

- dry-run publish payload.
- category validation tests.
- sandbox or controlled account apply where approved.
- publish attempt terminal state review.

Acceptance:

- Offer creation/update/activation is auditable and idempotent.
- Failed publish attempts are inspectable and recoverable.

### Phase 6: Warehouse-backed stock sync

Objective:

- Export Warehouse availability to Allegro listing quantity safely.

Deliverables:

- `WarehouseBackedStockSyncPlanner`.
- `AllegroStockCommandAttempt`.
- Stock snapshot comparison reports.
- Command status polling.
- RabbitMQ trigger handling.

Allowed writes:

- Local command attempts first.
- Allegro quantity commands only after Warehouse owner and stock orchestration
  approval.

Forbidden:

- Warehouse mutation.
- Legacy DB-first stock endpoint in production.
- Stock inference from order history.

Validation:

- stock source audit.
- plan-only report.
- dry-run command payloads.
- command idempotency tests.
- approved small apply only after coordination.

Acceptance:

- Stock command attempts are durable, replay-safe, and tied to Warehouse
  decision evidence.

### Phase 7: billing/payment reconciliation

Objective:

- Make Allegro finance data visible and reconcilable.

Deliverables:

- Billing/payment projection models.
- Read-only sync clients.
- Reconciliation report.
- Finance UI/API read surfaces.

Allowed writes:

- Local projections only.

Forbidden:

- Refund/capture/payout/settlement writes.
- Payments-microservice mutations.

Validation:

- dry-run counts.
- projection tests.
- redacted sample report.

Acceptance:

- Finance can see Allegro billing/payment data without operational writes.

### Phase 8: returns, claims, invoices, issues, shipments

Objective:

- Import after-sale and logistics state.

Deliverables:

- Projection models and read-only clients.
- Order linkage.
- UI/API read surfaces.
- Owner decision matrix for future writes.

Allowed writes:

- Local projections only.

Forbidden:

- Accept/deny returns.
- Approve/refuse claims.
- Generate/send invoices.
- Write issue replies.
- Create labels or shipment documents.

Validation:

- dry-run counts.
- redacted sample report.
- order linkage tests.

Acceptance:

- Customer service and finance can inspect Allegro after-sale state safely.

### Phase 9: Operations UI

Objective:

- Give operators a single Allegro control surface without hiding ownership
  boundaries.

Deliverables:

- Sync run dashboard.
- Offer/publish dashboard.
- Order mapping dashboard.
- Stock snapshot/command dashboard.
- Billing/payment dashboard.
- Returns/shipments/issues dashboard.
- BizBox preview/apply dashboard.

Validation:

- frontend build.
- route smoke.
- permission/role checks.
- no dangerous button without confirmation.

Acceptance:

- Operators can see what is read-only, preview, blocked, and apply-ready.

### Phase 10: Channel-agnostic adapter blueprint

Objective:

- Extract the Allegro pattern into a reusable sales-channel model.

Deliverables:

- `SalesChannelOwnershipPolicy`.
- Channel adapter interface.
- Channel projection vocabulary.
- Aukro/Bazos/FlipFlop readiness notes.

Validation:

- design review.
- no runtime behavior change until implementation task.

Acceptance:

- New channels can follow Allegro's pattern without copying unsafe scripts.

### Phase 11: Production rollout and observability

Objective:

- Run the primary Allegro channel safely in production.

Deliverables:

- runbooks.
- alerts.
- rate-limit dashboards.
- retry/rollback procedures.
- support playbooks.
- data retention/redaction policy.

Validation:

- deployment readiness gate.
- controlled smoke tests.
- rollback drill.
- alert test.

Acceptance:

- Operators can run import/export/reconciliation and recover from failures.

## 11. Detailed Workstreams

### W0: Integration owner

Status: final integration
Owner role: Allegro integration owner
Objective: Keep shared contracts coherent and merge work in safe order.
Allowed files: shared docs, IPS spines, graph nodes, validation reports.
Forbidden files/actions: live import/export/stock mutations unless explicitly
approved.
Expected output: updated master plan, task spine, merge decisions, validation
summary.
Dependencies: all lanes.
Validation owner: integration owner plus dedicated validation lane.
Handoff path: `reports/validation/TASK-0XX-integration-owner-handoff.md`

### W1: Script framework refactor

Status: ready_parallel after task spine creation
Owner role: scripts/CLI agent
Objective: Build shared script guard framework and convert safe scripts first.
Allowed files:

- `services/allegro-service/src/scripts/lib/*`
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts`
- `services/allegro-service/src/scripts/audit-current-stock-source.ts`
- script docs.

Forbidden files/actions:

- Prisma migrations.
- Catalog/Warehouse/Allegro/orders writes.
- destructive scripts.

Expected output:

- guard framework;
- standard JSON summaries;
- code comments at apply gates;
- dry-run validation evidence.

Dependencies:

- W0 task spine.

Validation:

- `git diff --check`
- `cd services/allegro-service && npm run build`
- dry-run output with `mutates: false`.

Merge order:

- after W0 docs and before converting unsafe scripts.

### W2: Schema and projection foundation

Status: ready_parallel after task spine creation
Owner role: data model agent
Objective: Add additive sync, cursor, raw payload, audit, and stock snapshot
models.
Allowed files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- schema docs.

Forbidden files/actions:

- destructive migrations.
- data backfill apply.
- existing field renames without compatibility plan.

Expected output:

- migration plan;
- generated types;
- compatibility report.

Dependencies:

- W0 task spine.

Validation:

- migration SQL review;
- Prisma generate;
- service build.

Merge order:

- before pipelines depend on new tables.

### W3: Orders integration

Status: dependency_gated by W2 and orders owner contract
Owner role: orders integration agent
Objective: Split local projection from central order forwarding and make replay
safe.
Allowed files:

- order projection/forwarding services;
- order mapper tests;
- order validation docs.

Forbidden files/actions:

- bulk central order apply;
- central order status/payment writes.

Expected output:

- replay equality tests;
- mapping completeness report;
- blocked-order report;
- owner-approved apply runbook.

Dependencies:

- W2 schema;
- orders-microservice contract confirmation.

Validation:

- contract tests;
- dry-run payload report.

Merge order:

- after W2 and before any production order forwarding.

### W4: Catalog offer export and publish lifecycle

Status: partially_implemented; full export remains dependency_gated by category/parameter contract and W2
Owner role: Catalog/Allegro publish agent
Objective: Centralize offer publish/update/activate and make Catalog export
auditable.
Allowed files:

- publish lifecycle service;
- Catalog sell action service;
- Allegro API client wrappers;
- publish tests/docs.

Forbidden files/actions:

- direct live publish without preview token;
- bypassing category validation;
- stock writes.

Expected output:

- governed publisher;
- publish payload preview;
- category validation evidence;
- publish attempt terminal-state evidence.

Dependencies:

- W2 schema;
- Catalog contract lane.

Implemented foundation:

- Publish lifecycle `prepare` returns a deterministic preview token bound to the
  redacted command payload, target, idempotency key, requester, and stale window.
- Publish lifecycle `confirm` requires the preview token and stores only token
  hash/confirmation metadata in `policySnapshot.previewTokenBinding`.
- Catalog sell-action confirm routes pass the preview token through to the
  governed publish lifecycle.
- Direct single-offer update and sync-to-Allegro routes accept preview-token and
  lifecycle idempotency controls, strip those controls from command payloads,
  and forward the token to the governed lifecycle.
- Bulk publish accepts a lifecycle idempotency prefix and preview-token maps by
  idempotency key or offer id, resolves them for `executeMany`, and redacts token
  maps from logs.

Remaining gated work:

- category/parameter completeness evidence is still required before broad offer
  export apply;
- live publish/update execution remains prohibited without owner approval and
  preview-token confirmation.

Validation:

- build;
- targeted publish lifecycle tests;
- dry-run payload samples.

Merge order:

- after W1/W2.

### W5: Warehouse-backed stock sync

Status: partially_executed_for_current_stock_import; Allegro quantity-command write-back remains dependency_gated
Owner role: stock integration agent
Objective: Plan and then implement Warehouse-backed Allegro quantity commands.
Allowed files:

- stock planner;
- stock command attempt schema after W2;
- stock docs/tests.

Forbidden files/actions:

- Warehouse mutations outside owner-approved guarded current-stock import;
- live Allegro quantity-command stock apply;
- legacy DB-first stock endpoint in production.

Expected output:

- source-backed availability decision contract;
- command attempt implementation;
- dry-run command report;
- owner-approved apply procedure.

Dependencies:

- W2 schema;
- Warehouse semantics;
- recurring stock orchestration policy is implemented for Allegro: Warehouse-only quantity, `stock.updated`/`stock.out`, automatic execute, target `0` for out-of-stock, and one request per second default pacing.

Validation:

- stock audit compare;
- dry-run command payload;
- command status polling test.

Merge order:

- after W2 and after explicit stock approval.

### W6: Billing and payment projections

Status: ready_parallel as design/schema lane, apply local-only after W2
Owner role: finance integration agent
Objective: Add read-only billing/payment projection plan and sync.
Allowed files:

- schema additions;
- Allegro billing/payment clients;
- projection services;
- finance docs.

Forbidden files/actions:

- payments-microservice mutations;
- refunds/captures/payouts/settlement writes.

Expected output:

- projection models;
- read-only dry-run report;
- redacted reconciliation sample.

Dependencies:

- W2 foundation or same integration-owned schema branch.

Validation:

- build;
- dry-run counts;
- PII redaction check.

Merge order:

- after W2 or integrated by W0 if schema conflicts.

### W7: Logistics and after-sale projections

Status: ready_parallel as design/schema lane, local projection after W2
Owner role: customer service/logistics integration agent
Objective: Add read-only returns, claims, invoices, issues, shipments, and
fulfillment projections.
Allowed files:

- schema additions;
- read-only clients;
- projection services;
- UI/API read docs.

Forbidden files/actions:

- accepting/denying returns;
- approving/refusing claims;
- invoice generation/send;
- issue replies;
- shipping label creation.

Expected output:

- projection schema;
- dry-run import plan;
- order linkage report.

Dependencies:

- W2 foundation.

Validation:

- build;
- dry-run counts;
- redaction check.

Merge order:

- after W2 or integrated by W0 if schema conflicts.

### W8: Gateway/Auth/frontend operations UI

Status: ready_parallel for route/screen contract, implementation gated by API
availability
Owner role: frontend/API agent
Objective: Define and implement operator surfaces for Allegro sync and channel
operations.
Allowed files:

- `services/api-gateway/*`
- `services/frontend/*`
- UI/API docs.

Forbidden files/actions:

- local credential forms;
- direct unsafe write buttons;
- bypassing preview-token confirmation.

Expected output:

- route map;
- screen contract;
- build evidence;
- role/permission notes.

Dependencies:

- API endpoints from W1-W7.

Validation:

- frontend build;
- gateway build;
- route smoke;
- UI state review.

Merge order:

- route/screen docs can merge early;
- write-capable UI after backend gates.

### W9: Validation and operations

Status: ready_parallel
Owner role: validation agent
Objective: Build the validation matrix and operational runbooks for every lane.
Allowed files:

- `docs/12_validation/*`
- `docs/16_operations/*`
- `docs/orchestrator/*`
- runbook docs.

Forbidden files/actions:

- implementation code changes unless separately assigned.
- live deploy.

Expected output:

- validation command matrix;
- no-mutation checklist;
- deployment readiness checklist;
- rollback runbook.

Dependencies:

- W0 plan.

Validation:

- `git diff --check`
- `npm run ips:audit`
- doc consistency check.

Merge order:

- early, before coding lanes apply writes.

### W10: Channel-agnostic adapter blueprint

Status: ready_parallel design only
Owner role: architecture agent
Objective: Extract Allegro lessons into a reusable sales-channel pattern for
Aukro, Bazos, FlipFlop, and future channels.
Allowed files:

- architecture docs;
- interface proposal docs.

Forbidden files/actions:

- runtime refactor without approved implementation task.

Expected output:

- channel vocabulary;
- interface proposal;
- migration path from Allegro-specific code to channel-aware code.

Dependencies:

- W0 plan and W1/W2 findings.

Validation:

- design review.

Merge order:

- design can merge early; runtime changes later.

## 12. Parallel Execution Model

### Ready now

These lanes can start after a task spine is created:

- W1 script framework refactor.
- W2 sync/projection schema foundation.
- W6 billing/payment projection design.
- W7 logistics/after-sale projection design.
- W8 frontend/API route and screen contract.
- W9 validation and operations runbooks.
- W10 channel-agnostic adapter blueprint.

### Dependency-gated

These lanes must wait:

- W3 orders integration waits for W2 plus orders owner contract.
- W4 offer export waits for category/parameter validation and W2.
- W5 current-stock Warehouse import has one owner-approved execution; recurring Allegro stock sync now has a standing policy and implementation for Warehouse `stock.updated`/`stock.out` events.
- BizBox apply hardening waits for import owner and Warehouse/Catalog owner
  gates.

### Blocked

These are blocked until explicit approval:

- live Allegro stock apply;
- Warehouse mutation from Allegro/import flows;
- BizBox apply to Catalog/Warehouse;
- central order replay apply at scale;
- refunds/captures/payouts/settlement writes;
- return/claim/invoice/issue/shipment write-back;
- production publish/activate without governed lifecycle.

### Shared files and conflict control

Only the integration owner should edit shared contracts in parallel:

- `TASKS.md`
- `STATE.json`
- `docs/16_operations/INTEGRATIONS.md`
- `graph/project_graph.example.yaml`
- shared validation reports
- shared Prisma schema if multiple lanes add models at once.

Workers should either:

- edit disjoint implementation files; or
- write isolated handoffs under `reports/validation/TASK-0XX-*-handoff.md`.

### Merge order

1. Master plan and task spine.
2. Validation/operations runbook.
3. Additive schema foundation.
4. Script framework.
5. Read-only clients/projections.
6. UI read surfaces.
7. Owner-approved central order forwarding.
8. Owner-approved publish lifecycle writes.
9. Owner-approved Warehouse-backed stock commands.
10. Owner-approved after-sale/logistics/finance write-back.

## 13. Validation Gates

### Planning gate

Commands:

- `git status --short --branch`
- `git diff --check`
- `npm run ips:audit`

Evidence:

- clean or intentional diff;
- no live mutation;
- no Chrome/browser-control;
- no deploy.

### Pre-coding gate

Commands:

- `npm run ips:pre-coding`

Notes:

- This command writes `reports/validation/ips-pre-coding-gate.json`.
- Run it only when task spine exists and report output is intended.

### Build gates

Commands:

- `cd services/allegro-service && npm run build`
- `cd services/frontend && npm run build`
- `cd services/api-gateway && npm run build`

Run only for lanes touching those services.

### Prisma gates

Commands:

- Prisma generate command used by the repo.
- migration SQL review.
- targeted repository/service tests.

Evidence:

- additive schema changes;
- no destructive migration;
- compatibility with existing camelCase fields.

### Dry-run gates

Every import/export-capable script must provide:

- command run;
- JSON summary;
- `mutates` flags;
- count summary;
- input hash;
- warning/blocker list.

### Apply gates

Apply requires:

- owner-approved task;
- preview artifact;
- preview token;
- input hash match;
- actor/account/scope match;
- idempotency key;
- before/after counts;
- rollback or remediation plan.

## 14. Security and Privacy

Sensitive data:

- buyer names;
- buyer emails;
- buyer logins;
- phone numbers;
- delivery addresses;
- invoice details;
- payment and refund details;
- issue/claim/return messages;
- raw payloads.

Rules:

- Do not log full raw payloads.
- Use payload hashes in summaries.
- Redact buyer and address fields in validation artifacts.
- Limit raw payload access to trusted debug paths.
- Record `piiClass` and `redactionVersion`.
- Retain raw payloads according to `raw-payload-retention-v1`:
  `sensitive_order_payload` for 90 days, `offer_stock_payload` and
  `offer_catalog_payload` for 180 days, `category_parameter_payload` for 365
  days, and unknown classes for 30 days.
- Treat retention cleanup as report-only until a separate owner-approved delete
  or redaction job is implemented.
- Avoid storing binary invoice/shipment documents until storage policy exists.
- Do not expose tokens, OAuth secrets, or account credentials in docs or logs.

## 15. Rollout Strategy

### Stage 1: read-only visibility

- Build sync runs and projections.
- Import data locally.
- Show dashboards.
- No external writes.

### Stage 2: local-only projection applies

- Allow local projection writes with confirmation.
- Validate replay and audit logs.
- No sibling service or Allegro writes.

### Stage 3: owner-approved internal writes

- Forward mapped orders to orders-microservice.
- Apply Catalog projections only through Catalog owner-approved paths.
- Keep Warehouse writes blocked unless explicitly approved.

### Stage 4: owner-approved Allegro writes

- Publish/update listings through governed lifecycle.
- Apply stock quantity commands after Warehouse approval.
- Keep finance/logistics/after-sale write-back blocked until owners approve.

### Stage 5: operational automation

- Schedule imports.
- Process webhooks.
- Trigger stock command planning from Warehouse events.
- Alert on drift, failed commands, stale cursors, and unmapped orders.

## 16. Open Questions

Use `[MISSING: ...]` or `[UNKNOWN: ...]` in implementation docs until these are
resolved:

- `[MISSING: confirmed Allegro OAuth scopes for billing, payments, returns, claims, invoices, issues, shipments, and fulfillment]`
- Warehouse sellable quantity is authoritative for Allegro stock sync; reservation/decrement semantics are owned by Warehouse and emitted as `stock.updated`/`stock.out` events.
- Recurring stock orchestration policy for automatic Allegro quantity commands is implemented: Warehouse-only source, automatic execute, target `0` out-of-stock, durable attempts, polling, and one-request-per-second default pacing.
- `[MISSING: category and parameter mapping completeness for publish beyond offline readiness helper]`
- `[MISSING: finance owner decision for payment/refund/settlement writes]`
- `[MISSING: customer service owner decision for return/claim/issue write-back]`
- `[MISSING: fulfillment owner decision for shipment label/document creation]`
- Production account rate-limit policy for automatic Allegro stock sync: default one request per second per running subscriber path via `ALLEGRO_STOCK_SYNC_RATE_LIMIT_MS=1000`; broader publish/import rate-limit policy remains governed separately.
- `[MISSING: central order duplicate/idempotency behavior confirmation]`
- `[UNKNOWN: whether One Fulfillment is enabled for the current account]`
- `[UNKNOWN: whether all 60 visible Sales Center orders are represented in the current local projection snapshot]`

## 17. Future Code Comment Checklist

Add short comments only where they prevent unsafe edits:

- `services/allegro-service/src/allegro/orders/orders.service.ts`
  - near forwarding: central order writes are orders-owner gated.
- `services/allegro-service/src/allegro/offers/offers.service.ts`
  - near legacy stock update: DB-first stock update is not production-approved.
  - near PATCH quantity: Allegro quantity is channel target, not stock source.
- `services/imports/src/import/import.service.ts`
  - near BizBox apply stock path: Warehouse mutation is owner-gated.
- `scripts/migrate-products-to-catalog.ts`
  - near `setStock`: migration stock mutation is not normal Allegro sync.
- `services/allegro-service/src/scripts/import-order-offer-products.ts`
  - near Catalog marketplace quantity: channel quantity is not physical stock.
- `services/allegro-service/src/scripts/import-checkout-forms-local.ts`
  - near apply gate: local projection only, no central forwarding.

## 18. Agent Prompt Template

Use this prompt shape for future Codex subagents or separate threads:

```text
Goal: <one specific lane objective>

Repository: ssh alfares, /home/ssf/Documents/Github/allegro

Mode:
- Follow AGENTS.md and IPS.
- Do not use Chrome/browser-control.
- Do not run live import/export/stock mutations.
- Do not mutate Warehouse, BizBox, Allegro, orders, payments, or Catalog unless
  this prompt explicitly allows it.

Intent chain:
Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding
Prompt -> Code -> Validation

Allowed files:
- <explicit file list>

Forbidden files/actions:
- <explicit list>

Expected output:
- <artifact, tests, handoff path>

Validation:
- git status --short --branch
- git diff --check
- <targeted build/test/dry-run>

Handoff:
- Summarize changed files.
- Summarize validation evidence.
- Mark missing facts as [MISSING: ...] or [UNKNOWN: ...].
- Do not invent contracts.
```

## 19. Immediate Next Implementation Sequence

The safest next sequence is:

1. Create `TASK-010` IPS spine for Allegro primary channel foundation.
2. Run validation/operations lane to define exact gate commands and report
   format.
3. Implement script framework and convert the already safe local order importer.
4. Add additive sync-run/cursor/raw-payload/audit schema.
5. Convert read-only stock audit to optionally emit local stock snapshots.
6. Add billing/payment and logistics/after-sale projection schemas and read-only
   clients.
7. Harden order forwarding with replay equality.
8. Harden Catalog publish lifecycle.
9. Only after Warehouse approval, implement stock command attempts and live
   quantity command apply.

This order gives the ecosystem useful Allegro visibility before it allows new
external writes.
