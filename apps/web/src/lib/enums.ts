/**
 * Client-safe mirrors of the Prisma enums.
 *
 * Client components must not import `@ct/db`, because that module instantiates
 * a PrismaClient. These constants hold exactly the same string values, so they
 * are interchangeable with the generated enums at the API boundary. Keep them in
 * step with `packages/db/prisma/schema.prisma`.
 */

export const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const TicketStatus = {
  ISSUED: "ISSUED",
  CANCELLED: "CANCELLED",
  BLOCKED: "BLOCKED",
  CHECKED_IN: "CHECKED_IN",
  EXPIRED: "EXPIRED",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const Role = {
  STUDENT: "STUDENT",
  ORGANIZER: "ORGANIZER",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PaymentMode = {
  AUTOMATIC: "AUTOMATIC",
  MANUAL_UPI: "MANUAL_UPI",
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];
