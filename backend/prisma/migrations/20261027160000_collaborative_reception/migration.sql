-- AlterTable
ALTER TABLE "users" ADD COLUMN     "scannerOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReceptionQueue" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReceptionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueStation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DIRECT',
    "leaseUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueDevice" (
    "id" TEXT NOT NULL,
    "activeSessionId" TEXT,
    "eventId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "codeHash" TEXT,
    "codeCipher" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'WAITING',
    "firstScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedBySessionId" TEXT,
    "claimedByUserId" TEXT,
    "claimUntil" TIMESTAMP(3),

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionQueue_eventId_key" ON "ReceptionQueue"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueStation_sessionId_key" ON "QueueStation"("sessionId");

-- CreateIndex
CREATE INDEX "QueueStation_eventId_mode_leaseUntil_idx" ON "QueueStation"("eventId", "mode", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDevice_activeSessionId_key" ON "QueueDevice"("activeSessionId");

-- CreateIndex
CREATE INDEX "QueueDevice_stationId_status_idx" ON "QueueDevice"("stationId", "status");

-- CreateIndex
CREATE INDEX "QueueDevice_sessionId_status_idx" ON "QueueDevice"("sessionId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_eventId_state_firstScannedAt_idx" ON "QueueEntry"("eventId", "state", "firstScannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_eventId_registrationId_key" ON "QueueEntry"("eventId", "registrationId");

