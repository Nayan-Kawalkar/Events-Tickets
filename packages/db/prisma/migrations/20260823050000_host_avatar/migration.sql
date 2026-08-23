-- Optional headshot for an event host.
ALTER TYPE "UploadKind" ADD VALUE IF NOT EXISTS 'HOST_AVATAR';

ALTER TABLE "event_hosts" ADD COLUMN "avatarUploadId" UUID;

-- Losing the image must never take the host row with it.
ALTER TABLE "event_hosts"
  ADD CONSTRAINT "event_hosts_avatarUploadId_fkey"
  FOREIGN KEY ("avatarUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Declared but never read or written by any code path, and empty in every row.
ALTER TABLE "event_hosts" DROP COLUMN "photoUrl";
