-- CreateTable
CREATE TABLE "merch_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "initialQuantity" INTEGER NOT NULL,
    "participantQuota" INTEGER NOT NULL,
    "staffQuota" INTEGER NOT NULL,
    "criterion" TEXT NOT NULL,
    "criterionNotes" TEXT NOT NULL DEFAULT '',
    "eligibilityAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merch_allocations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reason" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" TEXT,

    CONSTRAINT "merch_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merch_movements" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "allocationId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merch_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "organization" TEXT,
    "photoUrl" TEXT,
    "biography" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "registrationId" TEXT,
    "sourceUrl" TEXT,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaker_talks" (
    "speakerId" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "speaker_talks_pkey" PRIMARY KEY ("speakerId","scheduleItemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "merch_items_eventId_name_variant_key" ON "merch_items"("eventId", "name", "variant");

-- CreateIndex
CREATE INDEX "merch_allocations_eventId_recipientId_idx" ON "merch_allocations"("eventId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "merch_allocations_itemId_kind_recipientId_key" ON "merch_allocations"("itemId", "kind", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "merch_movements_requestKey_key" ON "merch_movements"("requestKey");

-- CreateIndex
CREATE INDEX "merch_movements_eventId_itemId_idx" ON "merch_movements"("eventId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "speakers_registrationId_key" ON "speakers"("registrationId");

-- CreateIndex
CREATE INDEX "speakers_eventId_idx" ON "speakers"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "speakers_eventId_email_key" ON "speakers"("eventId", "email");

-- CreateIndex
CREATE INDEX "speaker_talks_eventId_scheduleItemId_idx" ON "speaker_talks"("eventId", "scheduleItemId");

-- AddForeignKey
ALTER TABLE "merch_allocations" ADD CONSTRAINT "merch_allocations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "merch_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merch_movements" ADD CONSTRAINT "merch_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "merch_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merch_movements" ADD CONSTRAINT "merch_movements_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "merch_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_talks" ADD CONSTRAINT "speaker_talks_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "speakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

