-- Additive repair of objects missing from the historical PostgreSQL migration chain.

-- No applied migration/checksum is rewritten. Rehearse on an empty isolated target first.

CREATE TABLE "schedule_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "speakerName" TEXT,
    "speakerBio" TEXT,
    "speakerCompany" TEXT,
    "room" TEXT,
    "day" TEXT NOT NULL DEFAULT 'Día 1',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isKeynote" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "publishAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "announcementText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "function" TEXT,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SPONSOR',
    "category" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "logoUrl" TEXT,
    "notes" TEXT,
    "contributionType" TEXT NOT NULL DEFAULT 'MONETARY',
    "inKindDescription" TEXT,
    "committedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "receivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "pendingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "commitmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation_dispatches" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "results" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sponsor_payments" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "receiptNumber" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "annulledAt" TIMESTAMP(3),
    "annulledReason" TEXT,
    "annulledByUserId" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_change_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changeSummary" TEXT NOT NULL,
    "previousValues" TEXT NOT NULL,
    "newValues" TEXT NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "batchJobId" TEXT,
    "deliveryStatus" TEXT DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_notifications" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetGroup" TEXT NOT NULL DEFAULT 'ALL',
    "templateCode" TEXT NOT NULL DEFAULT 'SCHEDULE_CHANGE_ALERT',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "mode" TEXT NOT NULL DEFAULT 'REAL',
    "scheduleItemId" TEXT,
    "batchJobId" TEXT,
    "createdByUserId" TEXT,
    "executedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_settings" ADD COLUMN "schedulePdfUrl" TEXT;

ALTER TABLE "event_settings" ADD COLUMN "sponsorCategoryValues" TEXT;

ALTER TABLE "users" ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "users" ADD COLUMN "staffArea" TEXT;

ALTER TABLE "users" ADD COLUMN "assignedEventId" TEXT;

ALTER TABLE "email_logs" ADD COLUMN "dispatchKey" TEXT;

ALTER TABLE "email_logs" ADD COLUMN "messageId" TEXT;

CREATE UNIQUE INDEX "email_logs_dispatchKey_key" ON "email_logs"("dispatchKey");

CREATE UNIQUE INDEX "email_logs_messageId_key" ON "email_logs"("messageId");

CREATE INDEX "schedule_items_eventId_idx" ON "schedule_items"("eventId");

CREATE INDEX "schedule_items_day_idx" ON "schedule_items"("day");

CREATE INDEX "schedule_items_status_idx" ON "schedule_items"("status");

CREATE INDEX "schedule_change_logs_eventId_idx" ON "schedule_change_logs"("eventId");

CREATE INDEX "schedule_change_logs_scheduleItemId_idx" ON "schedule_change_logs"("scheduleItemId");

CREATE INDEX "scheduled_notifications_eventId_idx" ON "scheduled_notifications"("eventId");

CREATE INDEX "scheduled_notifications_status_idx" ON "scheduled_notifications"("status");

CREATE INDEX "scheduled_notifications_scheduledFor_idx" ON "scheduled_notifications"("scheduledFor");

CREATE INDEX "sponsors_eventId_idx" ON "sponsors"("eventId");

CREATE INDEX "sponsors_type_idx" ON "sponsors"("type");

CREATE INDEX "sponsors_status_idx" ON "sponsors"("status");

CREATE INDEX "sponsors_isArchived_idx" ON "sponsors"("isArchived");

CREATE UNIQUE INDEX "sponsors_eventId_name_key" ON "sponsors"("eventId", "name");

CREATE INDEX "sponsor_payments_sponsorId_idx" ON "sponsor_payments"("sponsorId");

CREATE INDEX "sponsor_payments_status_idx" ON "sponsor_payments"("status");

CREATE INDEX "sponsor_payments_paymentDate_idx" ON "sponsor_payments"("paymentDate");

CREATE INDEX "staff_members_eventId_idx" ON "staff_members"("eventId");

CREATE UNIQUE INDEX "user_invitations_tokenHash_key" ON "user_invitations"("tokenHash");

CREATE INDEX "user_invitations_userId_idx" ON "user_invitations"("userId");

CREATE UNIQUE INDEX "invitation_dispatches_requestKey_key" ON "invitation_dispatches"("requestKey");

ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_change_logs" ADD CONSTRAINT "schedule_change_logs_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "schedule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_change_logs" ADD CONSTRAINT "schedule_change_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sponsor_payments" ADD CONSTRAINT "sponsor_payments_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Repair missing audit enum labels without changing existing rows.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETRY_UNCERTAIN_BATCH';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_RESEND_AUTHORIZED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BULK_EMAIL_RESEND_AUTHORIZED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_TOGGLE_STATUS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_DELETE';
ALTER TYPE "AuditEntity" ADD VALUE IF NOT EXISTS 'EMAIL_BATCH_JOB';

-- Only the future default is corrected; existing edition text is preserved.
ALTER TABLE "event_settings" ALTER COLUMN "subtitle" SET DEFAULT 'Tecnología, Innovación y Comunidad';
