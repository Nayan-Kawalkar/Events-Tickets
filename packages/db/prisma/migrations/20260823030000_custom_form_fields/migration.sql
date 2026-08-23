-- Organizer-controlled registration forms.

CREATE TYPE "FieldMode" AS ENUM ('HIDDEN', 'OPTIONAL', 'REQUIRED');
CREATE TYPE "CustomFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'SELECT', 'CHECKBOX');

-- Which built-in fields each ticket type asks for.
ALTER TABLE "ticket_types" ADD COLUMN "phoneMode"      "FieldMode" NOT NULL DEFAULT 'OPTIONAL';
ALTER TABLE "ticket_types" ADD COLUMN "rollNumberMode" "FieldMode" NOT NULL DEFAULT 'OPTIONAL';
ALTER TABLE "ticket_types" ADD COLUMN "departmentMode" "FieldMode" NOT NULL DEFAULT 'OPTIONAL';

-- Fold the existing flag in, so ticket types that already demanded a student id
-- keep demanding one instead of silently relaxing on deploy.
UPDATE "ticket_types" SET "rollNumberMode" = 'REQUIRED' WHERE "requiresStudentId" = true;

-- Organizer-defined questions.
CREATE TABLE "ticket_type_fields" (
  "id"           UUID PRIMARY KEY,
  "ticketTypeId" UUID NOT NULL REFERENCES "ticket_types"("id") ON DELETE CASCADE,
  "label"        TEXT NOT NULL,
  "helpText"     TEXT,
  "type"         "CustomFieldType" NOT NULL DEFAULT 'SHORT_TEXT',
  "required"     BOOLEAN NOT NULL DEFAULT false,
  "options"      TEXT[] NOT NULL DEFAULT '{}',
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ticket_type_fields_ticketTypeId_sortOrder_idx"
  ON "ticket_type_fields"("ticketTypeId", "sortOrder");

-- Answers are kept on the ticket, not joined from the question, so editing or
-- deleting a question never rewrites an attendee list already collected.
ALTER TABLE "tickets" ADD COLUMN "customAnswers" JSONB;
