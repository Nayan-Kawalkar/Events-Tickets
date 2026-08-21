-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "attendeeDepartment" TEXT,
ADD COLUMN     "attendeeEmail" TEXT,
ADD COLUMN     "attendeeName" TEXT,
ADD COLUMN     "attendeePhone" TEXT,
ADD COLUMN     "attendeeRollNumber" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "manual_payments" ADD COLUMN     "attendee" JSONB;

