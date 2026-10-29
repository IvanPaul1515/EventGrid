CREATE TABLE "opinion_surveys" (
 "eventId" TEXT NOT NULL PRIMARY KEY, "publicKey" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "questions" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "opinion_surveys_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "opinion_surveys_publicKey_key" ON "opinion_surveys"("publicKey");
CREATE TABLE "opinion_responses" (
 "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'EVENT',
 "answers" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "opinion_responses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "opinion_surveys"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "opinion_responses_eventId_createdAt_idx" ON "opinion_responses"("eventId", "createdAt");
CREATE TABLE "opinion_suggestions" (
 "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "category" TEXT NOT NULL, "text" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "useful" BOOLEAN NOT NULL DEFAULT false, "internalNotes" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "opinion_suggestions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "opinion_surveys"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "opinion_suggestions_eventId_status_createdAt_idx" ON "opinion_suggestions"("eventId", "status", "createdAt");
