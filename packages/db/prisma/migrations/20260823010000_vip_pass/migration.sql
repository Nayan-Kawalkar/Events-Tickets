-- CreateEnum
CREATE TYPE "VipPassStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- CreateTable
CREATE TABLE "vip_passes" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "note" TEXT,
    "status" "VipPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(6),
    "usedByUserId" UUID,
    "usedGateId" TEXT,

    CONSTRAINT "vip_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_passes_code_key" ON "vip_passes"("code");

-- CreateIndex
CREATE INDEX "vip_passes_eventId_status_idx" ON "vip_passes"("eventId", "status");

-- AddForeignKey
ALTER TABLE "vip_passes" ADD CONSTRAINT "vip_passes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_passes" ADD CONSTRAINT "vip_passes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_passes" ADD CONSTRAINT "vip_passes_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

