# Allegro Edit + Publish Plan

## Goal

Enable editing of Allegro offers in the UI, updating the database first (single source of truth), then syncing changes back to Allegro via existing API endpoints. This completes the edit/sync flow for the current Allegro iteration.

## Current State

- ✅ Backend: `PUT /allegro/offers/:id` endpoint exists
- ✅ Backend: `updateOffer()` service method updates both Allegro API and DB
- ✅ Backend: `UpdateOfferDto` exists with basic fields (title, description, price, etc.)
- ✅ Frontend: OffersPage with read-only detail view
- ⏳ Frontend: No edit UI yet
- ⏳ Backend: UpdateOfferDto needs enhancement for full payload support
- ⏳ Backend: Update flow needs to handle rawData updates and re-validation

## Implementation Plan

### 1. Backend Enhancements

#### 1.1 Enhance UpdateOfferDto
- **File**: `services/allegro-service/src/allegro/dto/update-offer.dto.ts`
- **Changes**:
  - Add `stockQuantity?: number`
  - Add `currency?: string`
  - Add `images?: string[]` (array of image URLs)
  - Add `deliveryOptions?: any` (JSON)
  - Add `paymentOptions?: any` (JSON)
  - Add `publicationStatus?: string`
  - Add `attributes?: Array<{ id: string; values: string[] }>` for parameters
  - Keep existing fields: title, description, categoryId, price, quantity, status

#### 1.2 Enhance updateOffer Service Method
- **File**: `services/allegro-service/src/allegro/offers/offers.service.ts`
- **Changes**:
  - Transform DTO to Allegro API format before calling `allegroApi.updateOffer()`
  - Handle images array transformation
  - Handle attributes/parameters transformation
  - Update `rawData` field after successful Allegro API update (fetch updated offer or merge)
  - Re-run validation after update
  - Update `syncStatus`, `syncSource: 'MANUAL'`, `lastSyncedAt`
  - Add error handling with proper logging
  - Return updated offer with full rawData

#### 1.3 Add Helper Methods
- **File**: `services/allegro-service/src/allegro/offers/offers.service.ts`
- **Methods**:
  - `transformDtoToAllegroFormat(dto: UpdateOfferDto, existingOffer: any): any` - Convert DTO to Allegro API payload
  - `mergeRawDataUpdates(existingRawData: any, updates: any): any` - Merge updates into rawData
  - `fetchUpdatedOfferFromAllegro(allegroOfferId: string): Promise<any>` - Fetch fresh data after update

#### 1.4 Enhance Controller Error Handling
- **File**: `services/allegro-service/src/allegro/offers/offers.controller.ts`
- **Changes**:
  - Add try/catch with metrics tracking
  - Add logging for update operations
  - Return user-friendly error messages

### 2. Frontend Enhancements

#### 2.1 Add Edit Mode to OffersPage
- **File**: `services/allegro-frontend-service/src/pages/OffersPage.tsx`
- **Changes**:
  - Add `isEditMode` state
  - Add `editedOffer` state to track form changes
  - Add "Edit" button in detail modal (next to "View Details")
  - Add "Save" and "Cancel" buttons when in edit mode
  - Toggle between view and edit modes

#### 2.2 Create Edit Form
- **File**: `services/allegro-frontend-service/src/pages/OffersPage.tsx`
- **Form Fields**:
  - Title (text input)
  - Description (textarea with HTML support)
  - Price (number input)
  - Currency (select/dropdown)
  - Stock Quantity (number input)
  - Status (select: ACTIVE, INACTIVE, ENDED)
  - Publication Status (select: ACTIVE, INACTIVE)
  - Images (image URL list with add/remove)
  - Category ID (text input, could be enhanced with category picker later)
  - Delivery Options (JSON editor or structured form - start with JSON)
  - Payment Options (JSON editor or structured form - start with JSON)
  - Attributes/Parameters (list with add/edit/remove - structured form)

#### 2.3 Add Update API Call
- **File**: `services/allegro-frontend-service/src/pages/OffersPage.tsx`
- **Method**: `handleSaveOffer()`
  - Validate form data
  - Call `api.put(/allegro/offers/${offer.id}, editedOffer)`
  - Show loading state
  - Handle success: close edit mode, refresh offer data, show success message
  - Handle errors: show error message, keep edit mode open

#### 2.4 Add Sync Status Display
- Show sync status after update (SYNCED, PENDING, ERROR)
- Show last synced timestamp
- Show sync errors if any

### 3. Data Flow

1. **User clicks "Edit"** → Enter edit mode, populate form with current offer data
2. **User modifies fields** → Update `editedOffer` state
3. **User clicks "Save"** → 
   - Validate form
   - Call `PUT /allegro/offers/:id` with updated data
   - Backend transforms DTO to Allegro format
   - Backend calls Allegro API `PUT /sale/offers/:allegroOfferId`
   - Backend updates DB with new data
   - Backend updates rawData (fetch from Allegro or merge)
   - Backend re-validates offer
   - Backend returns updated offer
4. **Frontend receives response** → 
   - Update `selectedOffer` with new data
   - Exit edit mode
   - Show success message
   - Refresh validation status

### 4. Error Handling

- **Allegro API errors**: Catch and return user-friendly message
- **Validation errors**: Show validation issues before save
- **Network errors**: Show retry option
- **OAuth errors**: Prompt user to re-authorize
- **Sync errors**: Store in `syncError` field, display in UI

### 5. Testing

- Manual testing:
  - Edit title, description, price, stock
  - Edit images (add/remove)
  - Edit attributes
  - Verify changes appear in Allegro
  - Verify rawData is updated
  - Verify validation runs after update
  - Test error scenarios (OAuth expired, invalid data, network failure)

## Implementation Checklist

1. ✅ Review existing updateOffer implementation
2. ✅ Enhance UpdateOfferDto with all editable fields
3. ✅ Enhance updateOffer service method to handle full payload
4. ✅ Add helper methods for transformation and rawData merging
5. ✅ Add error handling and logging to controller
6. ✅ Add edit mode state and UI toggle to OffersPage
7. ✅ Create edit form with all editable fields
8. ✅ Implement handleSaveOffer method
9. ✅ Add sync status display after updates
10. ⏳ Test edit flow end-to-end
11. ✅ Update documentation

## Notes

- Keep rawData in sync: After updating Allegro, either fetch fresh data or intelligently merge updates
- Validation: Re-run validation after every update to ensure offer remains publishable
- Images: Support adding/removing image URLs; validate URLs before save
- Attributes: Support editing required attributes; validate against category requirements
- Sync Status: Track sync state (PENDING → SYNCED/ERROR) to show user feedback
- Error Recovery: Allow retry on sync failures

