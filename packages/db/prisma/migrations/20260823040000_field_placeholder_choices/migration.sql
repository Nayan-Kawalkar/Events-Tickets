-- Placeholder text, and choice types that carry their own option list.
ALTER TYPE "CustomFieldType" ADD VALUE IF NOT EXISTS 'RADIO';
ALTER TYPE "CustomFieldType" ADD VALUE IF NOT EXISTS 'MULTI_SELECT';

ALTER TABLE "ticket_type_fields" ADD COLUMN "placeholder" TEXT;
