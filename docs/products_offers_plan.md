# Allegro Products & Offers Persistence Plan

## Goals

- Store Allegro `productSet` raw JSON for offers to enable later edits.
- Normalize product parameters for reuse across services while keeping raw fidelity.
- Link offers to stored Allegro products and surface product data in frontend.
- Add dashboard Products menu (`/dashboard/products`) with add/remove/edit capabilities.

## Steps

1. SSH to prod host `statex`, review `.env` website section (~203-205) without leaking secrets. ✅
2. Update `prisma/schema.prisma` with new models for Allegro products and parameters; add FK from offers.
3. Generate Prisma migration and client.
4. Extend backend offer ingestion/create/update to upsert Allegro products (raw + normalized parameters) and link offers.
5. Ensure offer GET endpoints include linked Allegro product + parameters.
6. Update frontend offers view to display Allegro product details.
7. Add dashboard Products menu entry and UI to add/remove/edit products at `https://allegro.statex.cz/dashboard/products`.
8. Run tests/migrations locally; prepare deployment steps (push, pull on prod).

## Implementation Checklist

1. Review existing schema and offer flows for productSet handling. ✅
2. Add `AllegroProduct` + `AllegroProductParameter` models and FK in `AllegroOffer`.
3. Create Prisma migration and regenerate client.
4. Update backend logic to persist productSet raw and normalized params on import/create/update, including extracting products during imports from Allegro raw JSON.
5. Update backend logic to persist productSet raw and normalized params on import/create/update; ensure import routines extract products from Allegro raw JSON and save/update them.
6. Include allegroProduct + parameters in offer responses.
7. Adjust frontend to show product info and parameters.
8. Add Products menu entry and CRUD UI at `/dashboard/products`.
9. Run tests/migrations; document changes and deployment steps.
10. Strip unsupported Prisma fields (e.g., publicUrl) from offer persistence.
