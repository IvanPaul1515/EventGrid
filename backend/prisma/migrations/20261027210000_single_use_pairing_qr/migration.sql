ALTER TABLE "QueueStation" ADD COLUMN "inviteTokenHash" TEXT;
CREATE UNIQUE INDEX "QueueStation_inviteTokenHash_key" ON "QueueStation"("inviteTokenHash");
ALTER TABLE "QueueDevice" ADD COLUMN "invitationVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QueueDevice" ADD COLUMN "deviceLabel" TEXT;
