-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "buyerName" TEXT,
ADD COLUMN     "commercialUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "externalPaymentStatus" TEXT,
ADD COLUMN     "externalPlatform" TEXT,
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "originLabel" TEXT;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionStation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "busy" BOOLEAN NOT NULL DEFAULT false,
    "activeLinkId" TEXT,
    "activeReadingId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceptionStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "mobileSessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "codeHash" TEXT,
    "codeCipher" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mobileLeaseUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerReading" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "registrationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionStation_sessionId_key" ON "ReceptionStation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionStation_activeLinkId_key" ON "ReceptionStation"("activeLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionStation_activeReadingId_key" ON "ReceptionStation"("activeReadingId");

-- CreateIndex
CREATE INDEX "ReceptionStation_eventId_userId_leaseUntil_idx" ON "ReceptionStation"("eventId", "userId", "leaseUntil");

-- CreateIndex
CREATE INDEX "ScannerLink_mobileSessionId_status_idx" ON "ScannerLink"("mobileSessionId", "status");

-- CreateIndex
CREATE INDEX "ScannerLink_stationId_status_idx" ON "ScannerLink"("stationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerReading_linkId_requestKey_key" ON "ScannerReading"("linkId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_eventId_externalPlatform_externalReference_key" ON "registrations"("eventId", "externalPlatform", "externalReference");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
