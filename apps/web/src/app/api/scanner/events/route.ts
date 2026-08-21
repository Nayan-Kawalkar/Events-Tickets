import { prisma, EventStatus, Role } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOrganizerArea } from "@/lib/authz";
import { ok, forbidden, serverError, unauthorized } from "@/lib/api";

export const runtime = "nodejs";

/** Events this scanner may check people in at. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canAccessOrganizerArea(user)) return forbidden();

  try {
    const events = await prisma.event.findMany({
      where: {
        status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] },
        ...(user.role === Role.ADMIN ? {} : { createdById: user.id }),
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, venue: true },
    });

    return ok({ events });
  } catch (err) {
    return serverError("scanner events", err);
  }
}
