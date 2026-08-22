-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SCANNER';

-- CreateTable
CREATE TABLE "scanner_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "gateId" TEXT,
    "assignedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scanner_assignments_eventId_idx" ON "scanner_assignments"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "scanner_assignments_userId_eventId_key" ON "scanner_assignments"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "scanner_assignments" ADD CONSTRAINT "scanner_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_assignments" ADD CONSTRAINT "scanner_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_assignments" ADD CONSTRAINT "scanner_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

