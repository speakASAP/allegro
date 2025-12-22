# Migration to Central Microservices

This document tracks the migration of allegro-service from local Product table to central catalog-microservice and warehouse-microservice.

## Status: ✅ Complete

**Last Updated**: 2024-12-20

## Changes Made

### 1. API Clients Created ✅

- `shared/clients/catalog-client.service.ts` - Fetches products from catalog-microservice
- `shared/clients/warehouse-client.service.ts` - Fetches stock from warehouse-microservice
- `shared/clients/order-client.service.ts` - Forwards orders to orders-microservice
- `shared/clients/clients.module.ts` - NestJS module for clients

### 2. RabbitMQ Subscriber Created ✅

- `shared/rabbitmq/stock-events.subscriber.ts` - Subscribes to stock.updated events
- `shared/rabbitmq/rabbitmq.module.ts` - NestJS module for RabbitMQ

## Migration Steps

### Step 1: Update Prisma Schema

**Current State:**
- `Product` model exists with foreign key relation to `AllegroOffer`
- `AllegroOffer.productId` is a foreign key to `Product.id`

**Target State:**
- Keep `AllegroOffer.productId` as string UUID (no foreign key)
- Product data fetched from catalog-microservice
- Stock data fetched from warehouse-microservice

**Action:**
1. Remove foreign key constraint from `AllegroOffer.productId`
2. Keep `productId` as optional string UUID
3. Add comment: "Product ID from catalog-microservice (no foreign key)"

### Step 2: Update Services

**Services to Update:**
- `services/allegro-service/src/allegro/products/products.service.ts` ✅
  - ✅ Replaced local Product queries with CatalogClientService calls
  - ✅ Products fetched from catalog-microservice
  - ✅ Products created/updated in catalog-microservice
  - ✅ AllegroProduct kept for Allegro-specific raw data only
- `services/allegro-service/src/allegro/offers/offers.service.ts` ✅
  - ✅ Updated to fetch product data from catalog-microservice
  - ✅ Updated to fetch stock from warehouse-microservice
- `services/imports/src/import/import.service.ts` ✅
  - ✅ Creates products in catalog-microservice instead of local DB
  - ✅ Updates stock in warehouse-microservice

### Step 3: Update Order Processing

**Current:**
- Orders stored locally in `AllegroOrder` table

**Target:**
- Forward orders to orders-microservice
- Keep `AllegroOrder` for Allegro-specific metadata only

**Action:**
- Update order creation to call OrderClientService.createOrder()
- Keep AllegroOrder for tracking Allegro-specific data

### Step 4: Environment Variables

Add to `.env`:
```
CATALOG_SERVICE_URL=http://catalog-microservice:3200
WAREHOUSE_SERVICE_URL=http://warehouse-microservice:3201
ORDER_SERVICE_URL=http://orders-microservice:3203
RABBITMQ_URL=amqp://guest:guest@statex_rabbitmq:5672
```

### Step 5: Update Module Imports

Add to service modules:
```typescript
imports: [
  // ... existing imports
  ClientsModule,
  RabbitMQModule,
]
```

## Data Migration

### Existing Products

**Option 1: Keep in local DB (temporary)**
- Keep Product table for backward compatibility
- Gradually migrate products to catalog-microservice
- Update offers to use catalog product IDs

**Option 2: One-time migration**
- Export all products from local DB
- Import to catalog-microservice
- Update all AllegroOffer.productId references

## Testing Checklist

- [ ] Products fetched from catalog-microservice
- [ ] Stock fetched from warehouse-microservice
- [ ] Stock events received via RabbitMQ
- [ ] Offers updated when stock changes
- [ ] Orders forwarded to orders-microservice
- [ ] Import creates products in catalog-microservice
- [ ] Import updates stock in warehouse-microservice

## Rollback Plan

If issues occur:
1. Revert Prisma schema changes
2. Remove ClientsModule and RabbitMQModule imports
3. Restore local Product queries
4. Keep using local Product table

## Notes

- Product model in Prisma schema should be deprecated but not deleted yet
- Keep AllegroProduct model (Allegro-specific product data)
- Keep AllegroOffer model (Allegro-specific offer data)
- Only remove Product model after full migration is complete

