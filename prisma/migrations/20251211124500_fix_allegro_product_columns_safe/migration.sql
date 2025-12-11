-- Ensure camelCase columns exist even if prior rename partially applied

-- Allegro products columns
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "allegroProductId" VARCHAR(100);
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "manufacturerCode" VARCHAR(255);
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "publicationStatus" VARCHAR(50);
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "isAiCoCreated" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "marketedBeforeGPSR" BOOLEAN;
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "rawData" JSONB;
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "allegro_products" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill from snake_case if camelCase is null and snake exists
UPDATE "allegro_products"
SET "allegroProductId" = COALESCE("allegroProductId", "allegro_product_id"),
    "manufacturerCode" = COALESCE("manufacturerCode", "manufacturer_code"),
    "publicationStatus" = COALESCE("publicationStatus", "publication_status"),
    "isAiCoCreated" = COALESCE("isAiCoCreated", "is_ai_co_created"),
    "marketedBeforeGPSR" = COALESCE("marketedBeforeGPSR", "marketed_before_gpsr"),
    "rawData" = COALESCE("rawData", "raw_data")
WHERE TRUE;

-- Allegro product parameters columns
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "allegroProductId" UUID;
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "parameterId" VARCHAR(100);
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "valuesIds" JSONB;
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "rangeValue" JSONB;
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "allegro_product_parameters" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "allegro_product_parameters"
SET "allegroProductId" = COALESCE("allegroProductId", "allegro_product_id"),
    "parameterId" = COALESCE("parameterId", "parameter_id"),
    "valuesIds" = COALESCE("valuesIds", "values_ids"),
    "rangeValue" = COALESCE("rangeValue", "range_value")
WHERE TRUE;

-- Sync PK/FK/unique/indexes to camelCase
ALTER TABLE "allegro_product_parameters" DROP CONSTRAINT IF EXISTS "allegro_product_parameters_allegro_product_id_parameter_id_key";
ALTER TABLE "allegro_product_parameters" DROP CONSTRAINT IF EXISTS "allegro_product_parameters_allegroProductId_parameterId_key";
ALTER TABLE "allegro_product_parameters" ADD CONSTRAINT "allegro_product_parameters_allegroProductId_parameterId_key" UNIQUE ("allegroProductId", "parameterId");

DROP INDEX IF EXISTS "allegro_product_parameters_parameter_id_idx";
DROP INDEX IF EXISTS "allegro_product_parameters_parameterId_idx";
CREATE INDEX IF NOT EXISTS "allegro_product_parameters_parameterId_idx" ON "allegro_product_parameters" ("parameterId");

-- Allegro offers FK/index
ALTER TABLE "allegro_offers" ADD COLUMN IF NOT EXISTS "allegroProductId" UUID;
UPDATE "allegro_offers" SET "allegroProductId" = COALESCE("allegroProductId", "allegro_product_id") WHERE TRUE;
DROP INDEX IF EXISTS "allegro_offers_allegro_product_id_idx";
DROP INDEX IF EXISTS "allegro_offers_allegroProductId_idx";
CREATE INDEX IF NOT EXISTS "allegro_offers_allegroProductId_idx" ON "allegro_offers" ("allegroProductId");

ALTER TABLE "allegro_offers" DROP CONSTRAINT IF EXISTS "allegro_offers_allegro_product_id_fkey";
ALTER TABLE "allegro_offers" DROP CONSTRAINT IF EXISTS "allegro_offers_allegroProductId_fkey";
ALTER TABLE "allegro_offers" ADD CONSTRAINT "allegro_offers_allegroProductId_fkey" FOREIGN KEY ("allegroProductId") REFERENCES "allegro_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

