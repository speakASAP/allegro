ALTER TABLE "allegro_orders"
  ADD COLUMN IF NOT EXISTS "buyerAuthSubject" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "allegro_orders_buyerAuthSubject_idx"
  ON "allegro_orders"("buyerAuthSubject");
