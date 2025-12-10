# Allegro API Migration: sale/offers → sale/product-offers

## Summary

Allegro deprecated the `/sale/offers/{offerId}` endpoint for creating and editing offers at the beginning of 2024. The endpoint is now blocked and returns `403 ACCESS_DENIED` errors.

## New Endpoint

**Replacement:** `/sale/product-offers/{offerId}`

### Available Methods

1. **PATCH /sale/product-offers/{offerId}**
   - Purpose: Partial updates to specific fields
   - Use case: Updating individual fields like price, stock, title, description
   - Recommended for: Most update operations

2. **PUT /sale/product-offers/{offerId}**
   - Purpose: Full offer updates
   - Use case: Comprehensive changes requiring complete offer data
   - Note: Requires sending the entire offer payload

### Authentication

- Requires OAuth 2.0 authorization code flow token (user-specific)
- Client credentials token will NOT work for this endpoint
- We've already implemented OAuth token usage in `updateOfferWithOAuthToken`

### Content-Type

- Required: `application/vnd.allegro.public.v1+json` (already implemented)
- Accept: `application/vnd.allegro.public.v1+json`

## Migration Steps

1. ✅ Update endpoint from `/sale/offers/{offerId}` to `/sale/product-offers/{offerId}`
2. ✅ Change HTTP method from PUT to PATCH (for partial updates)
3. ✅ Ensure OAuth token is used (already implemented)
4. ✅ Ensure correct Content-Type header (already implemented)
5. ⏳ Test with actual offer updates

## References

- Allegro Developer News: https://developer.allegro.pl/news/at-the-beginning-of-2024-we-will-disable-the-sale-offers-resources-for-creating-and-editing-offers-k1dG88KlxHv
- GitHub Issues:
  - https://github.com/allegro/allegro-api/issues/11949
  - https://github.com/allegro/allegro-api/issues/12023
  - https://github.com/allegro/allegro-api/issues/10193

## Current Status

- ✅ Research completed
- ✅ Code migration completed
- ✅ Required fields fix completed
- ⏳ Testing pending (ready for manual testing)

## Fixes Applied

1. **Endpoint Migration**: Changed from `/sale/offers/{offerId}` to `/sale/product-offers/{offerId}`
2. **HTTP Method**: Changed from PUT to PATCH for partial updates
3. **Images Requirement**: Always include images in PATCH requests (from DTO or existing offer)
4. **Required Parameters**: Always include all required fields from existing offer:
   - Category (required)
   - Parameters/attributes (required - all existing parameters are included)
   - Images (required - at least 1)
   - Selling mode (if exists)
   - Stock (if exists)
   - Publication (if exists)
   - Delivery options (if exists)
   - Payment options (if exists)

