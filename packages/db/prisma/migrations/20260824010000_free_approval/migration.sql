-- Free ticket types an organizer approves one at a time.
-- Default false: every existing free type stays first-come-first-served.
ALTER TABLE "ticket_types" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
