-- Additive changes only; existing deliveries and participant prices remain intact.
ALTER TABLE "QueueEntry" ADD COLUMN "selectedTshirtSize" TEXT;
ALTER TABLE "QueueEntry" ADD COLUMN "validatedQrHash" TEXT;
ALTER TABLE "ticket_types" ADD COLUMN "includesTshirt" BOOLEAN NOT NULL DEFAULT true;
