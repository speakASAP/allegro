# Offers View – Allegro Full Payload

## Implementation Status

### ✅ Completed

- ✅ Database schema: Added `rawData` JSONB column to `allegro_offers` table
- ✅ Backend storage: All import functions store full Allegro payload in `rawData`
- ✅ Image extraction: Helper function extracts and stores images in `images` field
- ✅ Backend API: `GET /allegro/offers` returns offers with pagination, filters (status, search, category), and `rawData`
- ✅ Backend API: `GET /allegro/offers/:id` returns single offer with full `rawData`
- ✅ Frontend: OffersPage component created with list view, filters, pagination
- ✅ Frontend: Detail modal with core fields, images, attributes, variations, selling mode, publication details, delivery/payment, after-sales services, raw JSON
- ✅ Frontend: Routing added (`/dashboard/offers`) and navigation entry in sidebar
- ✅ TypeScript: All `any` types replaced with proper interfaces
- ✅ Logging: Added logging for offers API calls (list/detail requests) with userId, filters, pagination
- ✅ Production: Migration applied, code deployed

### 🔄 In Progress / Next Steps

- ⏳ Add sync provenance tracking (source: import vs Sales Center) - track which import method was used
- ⏳ Add validation/readiness flags for future publish flows

## Goal

- Provide a single-source-of-truth offers view for all Allegro items imported/exported into our database.
- Let operators inspect the full Allegro payload: photos, media, descriptions, attributes/parameters, variations, price, stock, delivery/payment, publication status, and related product links.
- Serve from our DB (no live passthrough) and render inside the existing dashboard in the frontend service.
- Current iteration: Allegro only; keep design extensible for future platforms (Aukro, Heureka, Bazos, etc.).

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
