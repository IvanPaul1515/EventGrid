ALTER TABLE "event_settings" ADD COLUMN "notificationStockThreshold" INTEGER;
CREATE TABLE "app_notifications" ("id" TEXT NOT NULL PRIMARY KEY,"eventId" TEXT NOT NULL,"recipientId" TEXT NOT NULL,"eventKey" TEXT NOT NULL,"kind" TEXT NOT NULL,"audience" TEXT NOT NULL,"referenceId" TEXT NOT NULL,"title" TEXT NOT NULL,"description" TEXT NOT NULL,"priority" TEXT NOT NULL DEFAULT 'NORMAL',"relatedStatus" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"readAt" TIMESTAMP);
CREATE UNIQUE INDEX "app_notifications_eventId_recipientId_eventKey_key" ON "app_notifications"("eventId","recipientId","eventKey");
CREATE INDEX "app_notifications_eventId_recipientId_readAt_createdAt_idx" ON "app_notifications"("eventId","recipientId","readAt","createdAt");
CREATE TABLE "notification_preferences" ("userId" TEXT NOT NULL PRIMARY KEY,"sound" BOOLEAN NOT NULL DEFAULT true,"desktop" BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE "notification_stock_states" ("eventId" TEXT NOT NULL,"itemId" TEXT NOT NULL,"threshold" INTEGER NOT NULL,"active" BOOLEAN NOT NULL DEFAULT false,"episode" INTEGER NOT NULL DEFAULT 0,PRIMARY KEY ("eventId","itemId","threshold"));
