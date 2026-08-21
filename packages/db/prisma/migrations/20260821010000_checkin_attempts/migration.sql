-- CreateTable
CREATE TABLE "checkin_attempts" (
    "id" UUID NOT NULL,
    "ticketId" UUID,
    "eventId" UUID,
    "gateId" TEXT,
    "scannerUserId" UUID,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkin_attempts_eventId_createdAt_idx" ON "checkin_attempts"("eventId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "checkin_attempts_ticketId_idx" ON "checkin_attempts"("ticketId");

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_scannerUserId_fkey" FOREIGN KEY ("scannerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

