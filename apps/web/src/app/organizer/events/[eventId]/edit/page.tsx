import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { EventForm } from "@/components/event-form";
import { HostsEditor, type HostRow } from "@/components/hosts-editor";
import { ScannersEditor, type ScannerRow } from "@/components/scanners-editor";
import { VipPassesEditor, type VipPassRow } from "@/components/vip-passes-editor";
import { TicketTypesEditor, type TicketTypeRow } from "@/components/ticket-types-editor";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

const LIVE = [TicketStatus.ISSUED, TicketStatus.CHECKED_IN, TicketStatus.BLOCKED];

type Props = { params: Promise<{ eventId: string }> };

export default async function EditEventPage({ params }: Props) {
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN]);

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) notFound();

  // Returns null for events the organizer does not own, so a guessed id is a 404.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const [ticketTypes, issuedTickets, hosts, scanners, vipPasses] = await Promise.all([
    prisma.ticketType.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        pricePaise: true,
        capacity: true,
        salesStartAt: true,
        salesEndAt: true,
        requiresStudentId: true,
        transferable: true,
        maxPerUser: true,
        paymentMode: true,
        organizerUpiId: true,
        organizerUpiName: true,
        organizerUpiQrUploadId: true,
        _count: { select: { tickets: { where: { status: { in: LIVE } } } } },
      },
    }),
    prisma.ticket.count({ where: { eventId: event.id, status: { in: LIVE } } }),
    prisma.eventHost.findMany({
      where: { eventId: event.id },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        instagram: true,
        twitter: true,
        linkedin: true,
      },
    }),
    prisma.scannerAssignment.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        gateId: true,
        user: { select: { fullName: true, email: true, role: true } },
        assignedBy: { select: { fullName: true } },
      },
    }),
    prisma.vipPass.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, guestName: true, note: true, status: true, usedAt: true },
    }),
  ]);

  const rows: TicketTypeRow[] = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    pricePaise: t.pricePaise,
    capacity: t.capacity,
    salesStartAt: toDateTimeLocal(t.salesStartAt) || null,
    salesEndAt: toDateTimeLocal(t.salesEndAt) || null,
    requiresStudentId: t.requiresStudentId,
    transferable: t.transferable,
    maxPerUser: t.maxPerUser,
    paymentMode: t.paymentMode,
    organizerUpiId: t.organizerUpiId,
    organizerUpiName: t.organizerUpiName,
    organizerUpiQrUploadId: t.organizerUpiQrUploadId,
    issuedCount: t._count.tickets,
  }));

  return (
    <>
      <PageHeader
        title={event.title}
        description={`/events/${event.slug}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/organizer/events/${event.id}`} variant="secondary">
              Back to event
            </ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}/attendees`} variant="secondary">
              Guest list
            </ButtonLink>
          </div>
        }
      />

      <div className="space-y-10">
        <EventForm
          issuedTickets={issuedTickets}
          initial={{
            id: event.id,
            title: event.title,
            slug: event.slug,
            description: event.description ?? "",
            venue: event.venue ?? "",
            startsAt: toDateTimeLocal(event.startsAt),
            endsAt: toDateTimeLocal(event.endsAt),
            registrationOpensAt: toDateTimeLocal(event.registrationOpensAt),
            registrationClosesAt: toDateTimeLocal(event.registrationClosesAt),
            status: event.status,
            capacity: event.capacity === null ? "" : String(event.capacity),
            posterUploadId: event.posterUploadId ?? "",
            hostOrganization: event.hostOrganization ?? "",
            addressLine: event.addressLine ?? "",
            latitude: event.latitude === null ? "" : String(event.latitude),
            longitude: event.longitude === null ? "" : String(event.longitude),
            contactEmail: event.contactEmail ?? "",
            contactPhone: event.contactPhone ?? "",
          }}
        />

        <TicketTypesEditor eventId={event.id} ticketTypes={rows} eventCapacity={event.capacity} />

        <HostsEditor eventId={event.id} hosts={hosts as HostRow[]} />

        <VipPassesEditor
          eventId={event.id}
          passes={vipPasses.map((p): VipPassRow => ({
            id: p.id,
            code: p.code,
            guestName: p.guestName,
            note: p.note,
            status: p.status,
            usedAt: p.usedAt ? formatDateTime(p.usedAt) : null,
          }))}
        />

        <ScannersEditor
          eventId={event.id}
          scanners={scanners.map((row): ScannerRow => ({
            id: row.id,
            gateId: row.gateId,
            user: row.user,
            assignedBy: row.assignedBy.fullName,
          }))}
        />
      </div>
    </>
  );
}
