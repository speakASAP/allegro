-- AlterTable: Increase allegroClientSecret field size from VARCHAR(500) to TEXT
-- This prevents truncation of encrypted secrets (encrypted length can be up to ~1000 chars for long secrets)
ALTER TABLE "user_settings" ALTER COLUMN "allegroClientSecret" TYPE TEXT;

