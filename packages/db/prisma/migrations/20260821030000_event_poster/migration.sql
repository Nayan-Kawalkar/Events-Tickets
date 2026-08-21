-- AlterEnum
ALTER TYPE "UploadKind" ADD VALUE 'EVENT_POSTER';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "posterUploadId" UUID;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_posterUploadId_fkey" FOREIGN KEY ("posterUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

