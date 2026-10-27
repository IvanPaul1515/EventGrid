-- AlterTable
ALTER TABLE "event_settings" ADD COLUMN     "paymentDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "paymentSupportContact" TEXT;

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancellationType" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "externalPaymentMethod" TEXT,
ADD COLUMN     "importOriginalData" TEXT,
ADD COLUMN     "lastExternalSyncAt" TIMESTAMP(3),
ADD COLUMN     "organizationRnc" TEXT,
ADD COLUMN     "participantCategory" TEXT,
ADD COLUMN     "paymentFullReported" TEXT,
ADD COLUMN     "waitlistState" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'ONSITE',
ADD COLUMN     "externalMethod" TEXT,
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "recordedByUserId" TEXT,
ADD COLUMN     "sourceBatchId" TEXT;

-- Existing money has no proven channel. Classify once; never rewrite amounts.
UPDATE "payments" SET "channel" = 'LEGACY';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "contentHash" TEXT;

-- AlterTable
ALTER TABLE "courtesy_requests" ADD COLUMN     "agreementReference" TEXT,
ADD COLUMN     "exceptionType" TEXT NOT NULL DEFAULT 'COURTESY';

-- CreateTable
CREATE TABLE "FinancialReview" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT,
    "sourceBatchId" TEXT,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "channel" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "decisionReason" TEXT,
    "reference" TEXT,
    "method" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialReview_eventId_status_idx" ON "FinancialReview"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReview_eventId_fingerprint_key" ON "FinancialReview"("eventId", "fingerprint");

-- CreateIndex
CREATE INDEX "RefundRequest_eventId_registrationId_idx" ON "RefundRequest"("eventId", "registrationId");

-- CreateIndex
CREATE INDEX "RefundRequest_paymentId_status_idx" ON "RefundRequest"("paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_eventId_requestKey_key" ON "RefundRequest"("eventId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_eventId_contentHash_key" ON "import_batches"("eventId", "contentHash");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReview" ADD CONSTRAINT "FinancialReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReview" ADD CONSTRAINT "FinancialReview_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
