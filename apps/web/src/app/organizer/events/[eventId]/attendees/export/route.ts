import { prisma, Role } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOrganizerArea, findManageableEvent } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { fail, forbidden, notFound, unauthorized } from "@/lib/api";
import { toCsv } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canAccessOrganizerArea(user)) return forbidden();

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  // Attendee data is only ever released to someone who can manage the event.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) return notFound();

  const tickets = await prisma.ticket.findMany({
    where: { eventId: event.id },
    orderBy: { issuedAt: "asc" },
    select: {
      publicId: true,
      status: true,
      issuedAt: true,
      checkedInAt: true,
      attendeeName: true,
      attendeeEmail: true,
      attendeePhone: true,
      attendeeRollNumber: true,
      attendeeDepartment: true,
      termsAcceptedAt: true,
      owner: { select: { fullName: true, email: true, rollNumber: true, department: true } },
      ticketType: { select: { name: true, pricePaise: true } },
    },
  });

  const csv = toCsv([
    [
      "ticket_public_id",
      "attendee_name",
      "email",
      "phone",
      "roll_number",
      "department",
      "account_email",
      "terms_accepted_at",
      "ticket_type",
      "price_paise",
      "status",
      "issued_at",
      "checked_in_at",
    ],
    ...tickets.map((t) => [
      t.publicId,
      t.attendeeName ?? t.owner.fullName,
      t.attendeeEmail ?? t.owner.email,
      t.attendeePhone ?? "",
      t.attendeeRollNumber ?? t.owner.rollNumber ?? "",
      t.attendeeDepartment ?? t.owner.department ?? "",
      t.owner.email,
      t.termsAcceptedAt?.toISOString() ?? "",
      t.ticketType.name,
      t.ticketType.pricePaise,
      t.status,
      t.issuedAt.toISOString(),
      t.checkedInAt?.toISOString() ?? "",
    ]),
  ]);

  // Exporting personal data is an auditable action.
  await audit({
    actorUserId: user.id,
    entityType: "Event",
    entityId: event.id,
    action: "ATTENDEES_EXPORTED",
    metadata: { rowCount: tickets.length, actorRole: user.role === Role.ADMIN ? "ADMIN" : "ORGANIZER" },
  });

  const filename = `attendees-${event.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
