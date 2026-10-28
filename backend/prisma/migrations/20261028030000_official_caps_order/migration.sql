-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "officialOrderSource" TEXT,
ADD COLUMN     "officialRegistrationOrder" INTEGER;

-- AlterTable
ALTER TABLE "merch_items" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "systemCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "merch_items_eventId_systemCode_key" ON "merch_items"("eventId", "systemCode");

