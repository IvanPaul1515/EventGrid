-- Null preserves legacy role guards. Explicit permissions restrict newly configured operators.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "operationalPermissions" TEXT;
