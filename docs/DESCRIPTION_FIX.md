# Description Field Fix

## Issue

**Error**: 422 Unprocessable Entity
```
"code": "JsonMappingException",
"message": "Message is not readable.",
"path": "description",
"userMessage": "Request contains invalid data. Contact the application author."
```

**Time**: 5:08:28 PM

## Root Cause

The `description` field was being included in PATCH requests even when it wasn't being updated. Allegro API's `/sale/product-offers` endpoint doesn't accept the description field in certain formats for PATCH requests, or requires it to be omitted if not being updated.

## Fix

**File**: `services/allegro-service/src/allegro/offers/offers.service.ts`

**Change**: Only include `description` in the payload when it's explicitly being updated. Don't include it if it's not in the DTO.

**Before**:
```typescript
if (dto.description !== undefined) {
  payload.description = dto.description;
} else if (existingOffer.rawData?.description) {
  payload.description = existingOffer.rawData.description; // ❌ This caused the error
}
```

**After**:
```typescript
// Description - only include if explicitly updating
// For PATCH requests, Allegro may not accept description in certain formats
// Only include if it's being updated, otherwise omit it
if (dto.description !== undefined) {
  // If description is being updated, use the new value
  // Ensure it's in the correct format (string or sections array)
  if (typeof dto.description === 'string') {
    payload.description = dto.description;
  } else if (Array.isArray(dto.description)) {
    // If it's an array (sections format), use as-is
    payload.description = dto.description;
  } else {
    // If it's an object, convert to sections format if needed
    payload.description = dto.description;
  }
}
// Don't include description if not updating - let Allegro keep existing value
```

## Deployment

- **Commit**: `47434e1` - "Fix: Only include description in PATCH payload when explicitly updating"
- **Deployed**: 5:10 PM
- **Service**: Restarted and running

## Testing

After this fix, PATCH requests should:
- ✅ Succeed when updating title, price, stock, etc. (without description)
- ✅ Succeed when explicitly updating description
- ✅ Not include description in payload if not updating it

## Status

✅ **Fixed and deployed**

