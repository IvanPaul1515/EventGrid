ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_username_case_insensitive" ON "users"(lower("username"));
ALTER TABLE "users" ADD CONSTRAINT "users_username_normalized" CHECK ("username" IS NULL OR "username"=lower("username"));
CREATE TABLE "application_settings" (
 "id" TEXT NOT NULL DEFAULT 'global', "installationId" TEXT NOT NULL,
 "publicOrigin" TEXT, "originStatus" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
 "originVerifiedAt" TIMESTAMP(3), "originCheckedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "application_settings_installationId_key" ON "application_settings"("installationId");
ALTER TABLE "opinion_surveys" ADD COLUMN "buzonEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "opinion_surveys" SET "buzonEnabled"="enabled";
ALTER TABLE "event_settings" ADD COLUMN "horizontalLogoUrl" TEXT;
