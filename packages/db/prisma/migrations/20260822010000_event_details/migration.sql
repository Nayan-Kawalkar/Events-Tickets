-- AlterTable
ALTER TABLE "events" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "hostOrganization" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "event_hosts" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "photoUrl" TEXT,
    "instagram" TEXT,
    "twitter" TEXT,
    "linkedin" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_hosts_eventId_sortOrder_idx" ON "event_hosts"("eventId", "sortOrder");

-- AddForeignKey
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

