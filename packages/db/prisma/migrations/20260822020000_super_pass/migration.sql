-- CreateEnum
CREATE TYPE "SuperPassStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "super_passes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "status" "SuperPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(6),
    "usedByUserId" UUID,
    "usedEventId" UUID,
    "usedGateId" TEXT,

    CONSTRAINT "super_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_passes_code_key" ON "super_passes"("code");

-- CreateIndex
CREATE INDEX "super_passes_status_createdAt_idx" ON "super_passes"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "super_passes" ADD CONSTRAINT "super_passes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_passes" ADD CONSTRAINT "super_passes_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_passes" ADD CONSTRAINT "super_passes_usedEventId_fkey" FOREIGN KEY ("usedEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

