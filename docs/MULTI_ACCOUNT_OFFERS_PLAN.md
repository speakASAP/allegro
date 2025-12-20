# Multi-Account Offers Implementation Plan

## Goal

1. **Add `accountId` tracking to `AllegroOffer`** - Link each offer to the Allegro account that owns it
2. **Create "Clone to Account" feature** - Allow creating new offers on a different account using existing offer data

## Current State

- `AllegroOffer` has no `accountId` field
- All 17 offers in DB belong to `statexcz` account (have Allegro IDs from that account)
- "Publish All" tries to update existing Allegro offers, which fails with "Access denied" when using a different account
- User wants to create NEW offers on `flipflopcz` using the same product data

## Architecture

### Database Changes

Add `accountId` to `AllegroOffer` to track which Allegro account owns each offer:

```prisma
model AllegroOffer {
  // ... existing fields ...

  // Multi-account support
  accountId String? @db.Uuid // Links to AllegroAccount that owns this offer

  // Relations
  account AllegroAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)

  @@index([accountId])
}
```

Also add relation on `AllegroAccount`:

```prisma
model AllegroAccount {
  // ... existing fields ...

  // Relations
  offers AllegroOffer[]
}
```

### API Changes

1. **GET /allegro/offers** - Add optional `accountId` filter; by default show all offers
2. **POST /allegro/offers/clone-to-account** - Clone selected offers to a different account (creates NEW Allegro listings)
3. **Import flows** - Automatically set `accountId` to the active account when importing

### Frontend Changes

1. **OffersPage** - Add account filter dropdown; show account name in offers table
2. **"Clone to Account" button** - Allow selecting target account and cloning offers

## Implementation Checklist

### Phase 1: Database Schema Update

- [ ] 1.1 Add `accountId` field to `AllegroOffer` in `prisma/schema.prisma`
- [ ] 1.2 Add `offers` relation to `AllegroAccount` in `prisma/schema.prisma`
- [ ] 1.3 Add `@@index([accountId])` for performance
- [ ] 1.4 Run `npx prisma migrate dev --name add_account_id_to_offers`
- [ ] 1.5 Update existing offers to set `accountId` for `statexcz` account

### Phase 2: Backend - Clone to Account Feature

- [ ] 2.1 Add `cloneOffersToAccount` method in `offers.service.ts`
- [ ] 2.2 Add `POST /allegro/offers/clone-to-account` endpoint in `offers.controller.ts`
- [ ] 2.3 The clone method should:
  - Load source offers from DB
  - Get OAuth token for target account
  - Create NEW offers on Allegro (not update existing)
  - Save new offers to DB with target `accountId`
  - Return summary of created offers

### Phase 3: Backend - Update Existing Flows

- [ ] 3.1 Update `importOffersFromAllegro` to set `accountId` from active account
- [ ] 3.2 Update `importFromSalesCenter` to set `accountId` from active account
- [ ] 3.3 Update `getOffers` to accept optional `accountId` filter
- [ ] 3.4 Update `publishOffersToAllegro` to verify offers belong to active account

### Phase 4: Frontend Changes

- [ ] 4.1 Add account filter dropdown to OffersPage
- [ ] 4.2 Add "Account" column to offers table
- [ ] 4.3 Add "Clone to Account" button and modal
- [ ] 4.4 Show account name in offer detail view

### Phase 5: Deploy & Test

- [ ] 5.1 Commit and push changes
- [ ] 5.2 Pull on production server
- [ ] 5.3 Run database migration on production
- [ ] 5.4 Rebuild and restart affected services
- [ ] 5.5 Test cloning offers from `statexcz` to `flipflopcz`

## Technical Details

### Clone Offer Logic

When cloning an offer to a new account:
1. Load source offer with all data (title, description, price, images, category, etc.)
2. Get OAuth token for TARGET account
3. Call Allegro API to CREATE a new offer (POST /sale/product-offers)
4. Allegro returns a NEW `allegroOfferId`
5. Save new offer record in DB with:
   - New UUID for `id`
   - New `allegroOfferId` from Allegro
   - Target `accountId`
   - Same product data (title, description, price, images, etc.)
   - `syncSource: 'CLONED'`
   - Reference to source offer (optional `clonedFromId`)

### Important: NOT Updating Existing Offers

The "Access denied" error happens because we're trying to UPDATE offers that belong to a different account. The clone feature creates BRAND NEW offers on Allegro, which is allowed.

## Risks & Mitigations

- **Allegro API rate limits**: Process offers sequentially with delays if needed
- **Failed creations**: Track successes/failures, allow retry for failed ones
- **Duplicate offers**: Add check to prevent cloning to same account twice (optional)

## Success Criteria

- [ ] Offers table shows which account owns each offer
- [ ] Can filter offers by account
- [ ] Can clone offers from `statexcz` to `flipflopcz`
- [ ] New offers appear on Allegro under `flipflopcz` account
- [ ] Import flows automatically track account ownership

