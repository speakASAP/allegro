-- Drop legacy snake_case columns now that camelCase columns are in use
ALTER TABLE "allegro_products"
  DROP COLUMN IF EXISTS "allegro_product_id",
  DROP COLUMN IF EXISTS "manufacturer_code",
  DROP COLUMN IF EXISTS "publication_status",
  DROP COLUMN IF EXISTS "is_ai_co_created",
  DROP COLUMN IF EXISTS "marketed_before_gpsr",
  DROP COLUMN IF EXISTS "raw_data",
  DROP COLUMN IF EXISTS "created_at",
  DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE "allegro_product_parameters"
  DROP COLUMN IF EXISTS "allegro_product_id",
  DROP COLUMN IF EXISTS "parameter_id",
  DROP COLUMN IF EXISTS "values_ids",
  DROP COLUMN IF EXISTS "range_value",
  DROP COLUMN IF EXISTS "created_at",
  DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE "allegro_offers"
  DROP COLUMN IF EXISTS "allegro_product_id";

