ALTER TABLE "sponsors" ADD COLUMN "legalName" TEXT;
ALTER TABLE "sponsors" ADD COLUMN "rnc" TEXT;
CREATE UNIQUE INDEX "sponsors_eventId_rnc_key" ON "sponsors"("eventId","rnc");
ALTER TABLE "sponsor_payments" ADD COLUMN "historicalDate" TEXT;
CREATE TABLE "module_import_records" ("metadata" TEXT,"id" TEXT NOT NULL PRIMARY KEY,"eventId" TEXT NOT NULL,"kind" TEXT NOT NULL,"source" TEXT NOT NULL,"externalKey" TEXT NOT NULL,"payloadHash" TEXT NOT NULL,"entityId" TEXT NOT NULL,"batchId" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP NOT NULL);
CREATE UNIQUE INDEX "module_import_records_eventId_kind_source_externalKey_key" ON "module_import_records"("eventId","kind","source","externalKey");
CREATE INDEX "module_import_records_eventId_kind_idx" ON "module_import_records"("eventId","kind");
CREATE TABLE "imported_contributions" ("id" TEXT NOT NULL PRIMARY KEY,"eventId" TEXT NOT NULL,"sponsorId" TEXT NOT NULL,"kind" TEXT NOT NULL,"state" TEXT NOT NULL,"amount" DOUBLE PRECISION,"currency" TEXT,"description" TEXT NOT NULL,"quantity" DOUBLE PRECISION,"unit" TEXT,"estimatedValue" DOUBLE PRECISION,"historicalDate" TEXT,"destination" TEXT,"reference" TEXT NOT NULL,"notes" TEXT,"paymentId" TEXT,"merchItemId" TEXT,"stockReceived" BOOLEAN NOT NULL DEFAULT false,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP NOT NULL,CONSTRAINT "imported_contributions_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "imported_contributions_eventId_sponsorId_idx" ON "imported_contributions"("eventId","sponsorId");
