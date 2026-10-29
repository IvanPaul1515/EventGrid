-- Additive only. Existing stock, deliveries and participant prices remain intact.
ALTER TYPE "RegistrationSource" ADD VALUE IF NOT EXISTS 'HISTORICAL_ONSITE';
ALTER TABLE "merch_items" ADD COLUMN IF NOT EXISTS "historyComplete" BOOLEAN NOT NULL DEFAULT false;
