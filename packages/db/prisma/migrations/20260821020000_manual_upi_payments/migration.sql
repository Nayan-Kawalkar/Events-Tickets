-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('AUTOMATIC', 'MANUAL_UPI');

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('UPI_QR', 'PAYMENT_PROOF');

-- AlterTable
ALTER TABLE "ticket_types" ADD COLUMN     "organizerUpiId" TEXT,
ADD COLUMN     "organizerUpiName" TEXT,
ADD COLUMN     "organizerUpiQrUploadId" UUID,
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'AUTOMATIC';

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_payments" (
    "id" UUID NOT NULL,
    "ticketTypeId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "upiTransactionId" TEXT,
    "screenshotUploadId" UUID,
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "issuedTicketId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploads_uploadedById_idx" ON "uploads"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payments_issuedTicketId_key" ON "manual_payments"("issuedTicketId");

-- CreateIndex
CREATE INDEX "manual_payments_eventId_status_idx" ON "manual_payments"("eventId", "status");

-- CreateIndex
CREATE INDEX "manual_payments_userId_idx" ON "manual_payments"("userId");

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_organizerUpiQrUploadId_fkey" FOREIGN KEY ("organizerUpiQrUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_screenshotUploadId_fkey" FOREIGN KEY ("screenshotUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_issuedTicketId_fkey" FOREIGN KEY ("issuedTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

