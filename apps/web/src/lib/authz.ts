import "server-only";
import { prisma, Role, type Event } from "@ct/db";
import type { SessionUser } from "./auth";

/**
 * Authorization rules. Every rule is evaluated on the server; the UI only ever
 * mirrors these decisions.
 */

export function isAdmin(user: SessionUser) {
  return user.role === Role.ADMIN;
}

export function canAccessOrganizerArea(user: SessionUser) {
  return user.role === Role.ORGANIZER || user.role === Role.ADMIN;
}

/**
 * Who may open the gate scanner at all.
 *
 * A SCANNER passes this check but still needs an assignment for the specific
 * event — the role opens the door, the assignment says which gate.
 */
export function canUseScanner(user: SessionUser) {
  return user.role === Role.SCANNER || user.role === Role.ORGANIZER || user.role === Role.ADMIN;
}

/** Events a given user may scan, as a Prisma `where` fragment. */
export function scannableEventsWhere(user: SessionUser) {
  if (user.role === Role.ADMIN) return {};
  if (user.role === Role.ORGANIZER) {
    return {
      OR: [
        { createdById: user.id },
        { scannerAssignments: { some: { userId: user.id } } },
      ],
    };
  }
  // A volunteer sees only what they have been assigned.
  return { scannerAssignments: { some: { userId: user.id } } };
}

/**
 * Organizers may only act on events they created. Admins may act on any event.
 * (Organization-scoped ownership replaces this in a later phase.)
 */
export function canManageEvent(user: SessionUser, event: Pick<Event, "createdById">) {
  if (isAdmin(user)) return true;
  return user.role === Role.ORGANIZER && event.createdById === user.id;
}

/**
 * Load an event the user is allowed to manage.
 * Returns null for both "not found" and "not yours" so the API cannot be used
 * to probe which event IDs exist (IDOR / enumeration).
 */
export async function findManageableEvent(user: SessionUser, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (!canManageEvent(user, event)) return null;
  return event;
}
