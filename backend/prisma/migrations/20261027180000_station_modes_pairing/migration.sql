-- AlterTable
ALTER TABLE "QueueStation" ADD COLUMN     "inviteCipher" TEXT,
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteHash" TEXT;

-- CreateTable
CREATE TABLE "QueuePairingPresence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueuePairingPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueuePairingPresence_sessionId_key" ON "QueuePairingPresence"("sessionId");

-- CreateIndex
CREATE INDEX "QueuePairingPresence_eventId_expiresAt_idx" ON "QueuePairingPresence"("eventId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueStation_inviteHash_key" ON "QueueStation"("inviteHash");

