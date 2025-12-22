# Verify Migration Complete Script

This script verifies that all products have been migrated from allegro-service to catalog-microservice.

## What it does

1. **Fetches products from allegro-service database**:
   - Products from `Product` table (deprecated)
   - Products from `AllegroProduct` table

2. **Fetches products from catalog-microservice**:
   - Tries to connect directly to catalog database (if credentials available)
   - Falls back to using catalog-microservice API

3. **Compares products**:
   - Matches products by SKU
   - Matches products by EAN (if available)
   - Identifies missing products

4. **Generates report**:
   - Shows product counts from both sources
   - Lists all missing products (if any)
   - Indicates if migration is complete

## Prerequisites

1. **Environment variables** must be set:
   - `DATABASE_URL` - PostgreSQL connection string for allegro-service database
   - `CATALOG_SERVICE_URL` - (Optional) URL of catalog-microservice API (default: `http://catalog-microservice:3200`)

2. **For direct database access** (optional, falls back to API if not available):
   - `CATALOG_DB_HOST` or `DB_HOST` - Catalog database host
   - `CATALOG_DB_PORT` or `DB_PORT` - Catalog database port (default: 5432)
   - `CATALOG_DB_USER` or `DB_USER` - Catalog database user
   - `CATALOG_DB_PASSWORD` or `DB_PASSWORD` - Catalog database password
   - `CATALOG_DB_NAME` or `DB_NAME` - Catalog database name (default: catalog_db)

## Usage

### Option 1: Run locally (with .env file)

```bash
cd allegro-service
# Make sure .env file exists with DATABASE_URL
npx ts-node scripts/verify-migration-complete.ts
```

### Option 2: Run in Docker container

```bash
# Execute inside allegro-service container
docker exec -it allegro-service-blue npx ts-node scripts/verify-migration-complete.ts
```

### Option 3: Run with environment variables

```bash
export DATABASE_URL="postgresql://user:password@host:port/allegro"
export CATALOG_SERVICE_URL="http://catalog-microservice:3200"
npx ts-node scripts/verify-migration-complete.ts
```

## Output

The script will output:

```
🔍 Verifying product migration from allegro-service to catalog-microservice...

======================================================================
✅ Connected to catalog-microservice database directly

📦 Fetching products from allegro-service...
   Found 150 products in allegro-service

📦 Fetching products from catalog-microservice...
   Found 150 products in catalog-microservice

🔍 Comparing products...

======================================================================
📊 Migration Verification Report
======================================================================

📦 Product Counts:
   Allegro-service (Product table): 100
   Allegro-service (AllegroProduct table): 50
   Total in allegro-service: 150
   Total in catalog-microservice: 150
   ✅ Migrated: 150
   ❌ Missing: 0

✅ MIGRATION COMPLETE: All products have been migrated!
======================================================================
```

If products are missing, it will show:

```
❌ MIGRATION INCOMPLETE: Some products are missing!

📋 Missing Products (5):
======================================================================

From Product table (3):
  1. SKU: PROD-001, EAN: 1234567890123, Name: Product Name 1
  2. SKU: PROD-002, EAN: N/A, Name: Product Name 2
  3. SKU: PROD-003, EAN: 1234567890124, Name: Product Name 3

From AllegroProduct table (2):
  1. SKU: ALLEGRO-ABC123, EAN: 1234567890125, Name: Allegro Product 1
  2. SKU: ALLEGRO-DEF456, EAN: N/A, Name: Allegro Product 2

💡 To migrate missing products, run:
   npm run migrate:products
```

## Exit Codes

- `0` - Migration is complete (all products migrated)
- `1` - Migration is incomplete (some products missing) or error occurred

## Troubleshooting

### Database connection error

If you see:
```
Can't reach database server at `localhost:5432`
```

**Solution**: Make sure `DATABASE_URL` is set correctly in your `.env` file or environment variables.

### Catalog service not accessible

If you see:
```
⚠️  Could not connect to catalog database directly, will use API
```

**Solution**: This is normal - the script will use the API instead. Make sure `CATALOG_SERVICE_URL` is correct and catalog-microservice is running.

### No products found

If you see:
```
Found 0 products in allegro-service
```

**Solution**: Check that you're connecting to the correct database and that products exist in the `products` and `allegro_products` tables.

## Related Scripts

- `migrate-products-to-catalog.ts` - Migrates products from allegro-service to catalog-microservice
- `verify-migration-prerequisites.ts` - Verifies prerequisites before running migration



