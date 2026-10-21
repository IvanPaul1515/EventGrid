-- AlterTable
ALTER TABLE "email_batch_jobs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'REAL';
ALTER TABLE "email_batch_jobs" ADD COLUMN "customSubject" TEXT;
ALTER TABLE "email_batch_jobs" ADD COLUMN "customBodyHtml" TEXT;
ALTER TABLE "email_batch_jobs" ADD COLUMN "customMessage" TEXT;
ALTER TABLE "email_batch_jobs" ADD COLUMN "templateSnapshot" JSONB;
ALTER TABLE "email_batch_jobs" ADD COLUMN "bodyHtml" TEXT;
ALTER TABLE "email_batch_jobs" ADD COLUMN "bodyText" TEXT;

-- AlterTable
ALTER TABLE "email_batch_items" ADD COLUMN "messageId" TEXT;
ALTER TABLE "email_batch_items" ADD COLUMN "renderedSubject" TEXT;
ALTER TABLE "email_batch_items" ADD COLUMN "renderedHtml" TEXT;

-- CreateIndex
CREATE INDEX "email_batch_items_messageId_idx" ON "email_batch_items"("messageId");
