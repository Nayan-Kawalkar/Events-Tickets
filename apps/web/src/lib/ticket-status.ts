import { TicketStatus } from "@ct/db";

/**
 * Statuses that occupy a seat. A cancelled or expired ticket frees its place;
 * a blocked one does not, because the holder may still be readmitted.
 */
export const LIVE_TICKET_STATUSES = [
  TicketStatus.ISSUED,
  TicketStatus.CHECKED_IN,
  TicketStatus.BLOCKED,
] as const;

export const LIVE_TICKET_STATUS_LIST = [...LIVE_TICKET_STATUSES];
