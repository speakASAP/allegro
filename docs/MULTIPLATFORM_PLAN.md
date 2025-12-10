# Multiplatform Offers & Products Architecture (High Level)

## Purpose & Scope

- Single source of truth for all products/offers in our DB; no platform owns data.
- Support importing, enriching, and exporting offers across platforms: **Allegro (existing)**, **Aukro**, **Heureka**, **Bazos** (future).
- Enable manual edits, scripted updates, and AI-assisted enrichment (media, text, attributes) before publishing everywhere.
- Provide full visibility: products, product details, every field we import; photos, prices, descriptions, media.

## Goal

- Provide a single-source-of-truth offers view for all Allegro items imported/exported into our database.
- Let operators inspect the full Allegro payload: photos, media, descriptions, attributes/parameters, variations, price, stock, delivery/payment, publication status, and related product links.
- Serve from our DB (no live passthrough) and render inside the existing dashboard in the frontend service.
- Current iteration: Allegro only; keep design extensible for future platforms (Aukro, Heureka, Bazos, etc.).

## Iteration Boundaries

- Now: Allegro view/read-only (inspect stored data, no live passthrough).
- Next: Allegro edit + publish back to Allegro (reuse sync jobs).
- Later: Extend projections/mappers to Aukro/Heureka/Bazos with platform-specific validation and export.

## Current Baseline (Allegro)

- Services kept: **api-gateway**, **allegro-service**, **import-service**, **allegro-settings-service**, **allegro-frontend-service**.
- Prisma models already in place:
  - `Product`: canonical product data (descriptions, SEO, media URLs, prices, dimensions, attributes, tags, categories).
  - `AllegroOffer`: platform offer projection with price, stock, status, images, delivery/payment JSON, sync metadata, **rawData JSONB** ✅.
  - `AllegroOrder`, `SyncJob`, `ImportJob`, `WebhookEvent`, `SupplierProduct`, `UserSettings` (stores Allegro creds/tokens).
- Flows implemented: Allegro import (all, preview/approve), Sales Center preview/import, CRUD on offers, stock update, CSV export.
- Frontend: dashboard has Settings / Import Jobs / Orders / **Offers** ✅ (list + detail view with full payload display).

## Target Architecture (Conceptual)

- **Canonical Product Layer**: `Product` remains the master entity (titles, rich descriptions, media sets, attributes, dimensions, SEO, pricing, stock).
- **Platform Offer Projections**: per-platform offer records (Allegro, Aukro, Heureka, Bazos) linked to `Product`; store platform-specific IDs, statuses, price/stock, media ordering, publication flags, delivery/payment options, category/attribute mappings, validation errors, and sync metadata.
- **Media & Assets**: normalized media list per product (images, video placeholders); platform projection stores ordered references and any platform-specific transformations (resizing/format/limit).
- **Taxonomy & Attributes Mapping**: mapping tables to translate canonical categories/attributes to each platform’s taxonomy; keep per-platform required/optional attributes, value dictionaries, and last-validated state.
- **Ingestion/Import**:
  - Allegro: existing OAuth-based import (offers and Sales Center).
  - CSV/manual: continue via import-service for canonical products.
  - Future: platform APIs (Aukro/Heureka/Bazos) for imports when available; otherwise CSV/XML scrapes mapped into canonical products.
- **Export/Publish**:
  - Use per-platform mappers to transform canonical product + platform config into platform offer payloads.
  - Validate required fields/attributes/media before publish; store validation errors on the projection.
  - Support preview/dry-run and CSV export per platform.
- **Orchestration & Sync**:
  - Jobs for import/export/sync with statuses, counts, errors (extend `SyncJob`/`ImportJob` semantics).
  - OAuth/token handling per platform where applicable; secrets only in DB/ENV.
  - Centralized logging via logging microservice; job-level and item-level logs.
- **UI (first step)**:
  - Offers view/catalog showing canonical products with per-platform projection status (Allegro/Aukro/Heureka/Bazos), media, price/stock, description, attributes, validation state, and last sync.
  - Detail view to inspect/edit canonical product fields and platform-specific fields side-by-side; enable manual publish/update triggers.
  - Import/export previews (already for Allegro) extended conceptually to other platforms.
- **Monitoring & Errors**:
  - Health checks per service (existing).
  - Sync/validation dashboards (conceptual) with per-platform error summaries.

## Platform Notes (High Level)

- **Allegro (current)**: OAuth auth code flow; /sale/offers requires OAuth; images arrays; publication status; delivery/payment objects; category/attribute requirements vary by category.
- **Aukro**: expect marketplace-like offers; likely REST with auth tokens; need category mapping and media constraints; confirm price/fee rules.
- **Heureka**: feed-driven (XML/CSV) and API in some cases; strong taxonomy/attribute requirements; shipping/payment tables; likely no offer “status” but availability flags; image URL constraints.
- **Bazos**: classifieds-style; may lack rich API; likely form/posting automation; category and image limits; minimal structured attributes—may require per-listing text templating.
- **Gaps/Risks**: No current integrations for Aukro/Heureka/Bazos; attribute dictionaries and category mapping need discovery; media/size limits per platform unknown; authentication models differ (OAuth, tokens, feed uploads, or form posting).

## Data Flows (Textual)

1) **Import**: Platform/API/CSV → mapper → canonical `Product` (+ optional platform projection) → store validation outcome → log job.
2) **Enrich**: Manual/script/AI edits on canonical product; attach media; set pricing/stock; fill attributes; map categories.
3) **Validate/Map**: For each platform projection, run validators against platform rules (required fields, category attributes, media limits, price/currency, shipping/payment).
4) **Publish/Export**: Transform canonical + projection to platform payload/feed; send via API/feed upload; record platform IDs/status; log per-item results.
5) **Monitor**: Sync jobs track counts/errors; projections store last sync, status, error messages; centralized logging for drill-down.

## Security & Config

- All credentials/tokens in DB (encrypted) and `.env`-driven; no hardcoded secrets.
- `.env` is source of truth; add missing keys to `.env.example` (no secret values).
- Use centralized logger (`utils/logger.js` per project conventions) for all flows.

## Schema / Storage Notes

- ✅ **Allegro**: `rawData` JSONB column added to `allegro_offers` to store full `/sale/offers` payload; existing indexed fields preserved (title, price, stock, status/publicationStatus, images, delivery/payment, lastSyncedAt, syncStatus).
- ⏳ Consider per-sync snapshots or lastSync metadata (source: Allegro import vs Sales Center) to surface provenance in UI.
- Future: per-platform projection tables (Aukro/Heureka/Bazos) linked to `Product` with platform IDs, validation state, media ordering, errors, and sync metadata.

## API Contract (Allegro view, DB-backed)

- ✅ `GET /allegro/offers`: pagination (page, limit), filters (status, search in title, optional category), returns items with core fields + `rawData`, `product` link, and pagination meta; no live Allegro calls.
- ✅ `GET /allegro/offers/:id`: returns single offer with full stored payload (`rawData`), core mapped fields, linked product info; DB-only.
- ✅ Keep existing import/export endpoints unchanged; list/detail consume stored data to ensure deterministic auditing and offline review.

## Frontend Acceptance (Offers view)

- ✅ Route: `/dashboard/offers`; sidebar entry "Offers".
- ✅ List columns: title, price + currency, stock quantity, status/publicationStatus, lastSyncedAt, linked product code/name (if present).
- ✅ Filters: status, text search (title), optional category.
- ✅ Detail view (modal): core fields; description rendered safely; media gallery from stored URLs; attributes/parameters/variations from `rawData`; selling mode; delivery/payment; publication details; after-sales services; product link; raw JSON tab (read-only) for debugging.

## Sync Provenance & Validation

- ✅ Track last sync time and source (Allegro import vs Sales Center) per offer via `syncSource` field; displayed in UI.
- ⏳ Add simple readiness/validation flag on projection (e.g., missing media/attributes) to prepare for future publish flows.

## Logging & Metrics

- ✅ Log offers list/detail API calls via centralized logger; include filters, pagination, userId.
- ⏳ Basic counters/metrics: list requests, detail requests, errors; reuse existing health/logging conventions.

## Platform Discovery Checklist (future)

- Aukro: auth model, category tree, media limits, attribute dictionaries, price/fee rules.
- Heureka: feed vs API choice, category/attribute requirements, shipping/payment tables, image URL constraints, availability flags.
- Bazos: API vs form automation, category/image limits, structured attributes support, templating needs.

## Next Steps (Implementation-Oriented, not executed now)

- Add offers catalog UI (list + detail) in frontend with platform status columns and filters.
- Define platform projection models/tables and mapping dictionaries (attributes/categories) for Aukro/Heureka/Bazos.
- Add validation/mapping services per platform and export pipelines with dry-run.
- Extend jobs/metrics and logging for multiplatform sync.

## Open Questions / Assumptions

- Attribute/value dictionaries and category trees for Aukro/Heureka/Bazos need confirmation.
- Media limits (count, size, formats) per platform?
- Pricing/fees/currency rules per platform?
- Preferred export mechanism for Heureka (feed vs API) and Bazos (API vs form automation)?

## Data Storage Plan

- Keep indexed fields already present on `allegro_offers` (title, description, categoryId, price, quantity/stockQuantity, status/publicationStatus, images, deliveryOptions, paymentOptions, lastSyncedAt, syncStatus).
- Add `rawData` JSON column to store the full Allegro `/sale/offers` payload per offer for complete fidelity (images, sellingMode, stock, publication, delivery/payment, parameters/attributes, variations, external/product references, after-sales services).
- Continue linking to `products` for cross-platform mapping; DB remains the single source of truth for outbound exports.

## Backend API Plan (Allegro Service)

- Reuse/extend `GET /allegro/offers` to return offers from DB with pagination/filters (status, title search, category optional) plus attached `rawData`.
- Reuse/extend `GET /allegro/offers/:id` to return a single offer with full stored payload (`rawData`) and mapped core fields.
- List/detail are DB-backed only (no live Allegro calls) to ensure deterministic auditing and offline review; sync jobs populate/refresh the data.
- Preserve existing import/export endpoints; future edits-to-Allegro flows can reuse the same storage + sync mechanism (stub for next iterations).

## Frontend UX Plan (existing dashboard)

- Add sidebar nav entry “Offers” under `/dashboard`.
- List view:
  - Columns: title, price + currency, stock quantity, status/publicationStatus, lastSyncedAt, linked product code/name when available.
  - Filters: status, text search (title), optional category.
  - Actions: open detail view.
- Detail view (drawer/modal or dedicated page):
  - Core fields: title, description (render HTML safely), price, currency, stock, status/publicationStatus, category, product link.
  - Media: image gallery (from stored image URLs).
  - Attributes/parameters and variations: render from `rawData`.
  - Delivery/payment options, after-sales services (if present).
  - Raw JSON tab/section for debugging (read-only).
- Use existing `api.ts` client and auth; no new auth flow required.

## Future Edit/Sync Note (not in current iteration)

- Edits would update DB first, then push via existing Allegro sync (price/stock/offer update) flows.
- Cross-platform exports (Aukro, Heureka, Bazos, etc.) would map from the same DB source using platform-specific transformers.

## Testing Approach

- API contract checks: `GET /allegro/offers` pagination/filters and `GET /allegro/offers/:id` detail include `rawData`.
- OAuth prerequisite for initial Allegro imports remains; offers view itself consumes stored data.
- Frontend smoke: list renders, filters operate, detail view shows media/attributes/JSON without console errors.
- Regression: ensure existing import/export flows unaffected.

## Original request

Read ../../README.md and ../README.md
We need to add offers view for all imported and exported items from Allegro. I need to see products, product details, every field which we import from Allegro. I need to see photos, prices, description etc.
So we need system for checking and updating everything we have from Allegro.
We need it for task to modify products and offers, to keep them in our database as single source of truth for everything we sell.
We gather all data in our database, update everything manually, with scripts, with AI agents etc. And then we need to export these data and offers on our other sales accounts on another platforms: Aukro, Heureka, Bazos etc.
So we need to have full set of offers for all the platforms. I mean different platforms have their internal data format and data structure. Based on what we have in database we should have the system to import/export everything within the whole multiplatform sales system keeping their format. But all data source should be stored in our database. So we get everything from our database and export it to every sales platform we have account.
For example, we get new shoes. We need to update all the data about them in our database and post offers to all platforms to boost the sales.
And the first step for it is our system where we can update photos, video, text etc. for all items we have.
Create project description in documentation first and research what and how it can be achieved.
