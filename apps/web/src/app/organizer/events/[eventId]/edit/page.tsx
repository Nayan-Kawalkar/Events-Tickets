import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { EventForm } from "@/components/event-form";
import { HostsEditor, type HostRow } from "@/components/hosts-editor";
import { ScannersEditor, type ScannerRow } from "@/components/scanners-editor";
import { VipPassesEditor, type VipPassRow } from "@/components/vip-passes-editor";
import { TicketTypesEditor, type TicketTypeRow } from "@/components/ticket-types-editor";
import { RegistrationFormEditor } from "@/components/registration-form-editor";
import { FilterChips } from "@/components/list-controls";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

const LIVE = [TicketStatus.ISSUED, TicketStatus.CHECKED_IN, TicketStatus.BLOCKED];

/** Ordered the way an event is actually set up. */
const TABS = [
  { label: "Details", value: "details" },
  { label: "Ticket types", value: "tickets" },
  { label: "Questions", value: "forms" },
  { label: "Hosts", value: "hosts" },
  { label: "Guest passes", value: "passes" },
  { label: "Scanners", value: "scanners" },
] as const;

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function EditEventPage({ params, searchParams }: Props) {
  const [user, sp] = await Promise.all([
    requireRole([Role.ORGANIZER, Role.ADMIN]),
    searchParams,
  ]);

  // Unknown values fall back to Details rather than showing a blank page.
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "details";

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
        requiresApproval: true,
        transferable: true,
        maxPerUser: true,
        paymentMode: true,
        organizerUpiId: true,
        organizerUpiName: true,
        organizerUpiQrUploadId: true,
        phoneMode: true,
        rollNumberMode: true,
        departmentMode: true,
        customFields: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            label: true,
            helpText: true,
            placeholder: true,
            type: true,
            required: true,
            options: true,
          },
        },
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
        avatarUploadId: true,
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

  const counts: Record<string, number | undefined> = {
    details: undefined,
    tickets: ticketTypes.length,
    forms: ticketTypes.reduce((n, t) => n + t.customFields.length, 0),
    hosts: hosts.length,
    passes: vipPasses.length,
    scanners: scanners.length,
  };

  const rows: TicketTypeRow[] = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    pricePaise: t.pricePaise,
    capacity: t.capacity,
    salesStartAt: toDateTimeLocal(t.salesStartAt) || null,
    salesEndAt: toDateTimeLocal(t.salesEndAt) || null,
    requiresStudentId: t.requiresStudentId,
    requiresApproval: t.requiresApproval,
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

      {/* One job at a time. Everything below used to render on a single page —
          details, ticket types, a form editor per ticket type, hosts, passes
          and scanners — which is a wall of controls to scroll past to reach the
          one you came for. The tab lives in the URL, so a section can be
          bookmarked or linked to a co-organizer, and Back returns to it. */}
      <div className="mb-6">
        <FilterChips
          label="Event settings sections"
          basePath={`/organizer/events/${event.id}/edit`}
          param="tab"
          current={tab}
          options={TABS.map((t) => ({
            label: counts[t.value] === undefined ? t.label : `${t.label} (${counts[t.value]})`,
            value: t.value,
          }))}
        />
      </div>

      <div className="space-y-10">
        {tab === "details" ? (
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
        ) : null}

        {tab === "tickets" ? (
          <TicketTypesEditor eventId={event.id} ticketTypes={rows} eventCapacity={event.capacity} />
        ) : null}

        {/* What each ticket type asks its buyers. One panel per type,
            because a VIP pass rarely needs what a student pass does. */}
        {tab === "forms" && ticketTypes.length === 0 ? (
          <EmptyState
            title="No ticket types yet"
            description="Add a ticket type first — the questions you ask belong to a specific one."
            action={
              <ButtonLink href={`/organizer/events/${event.id}/edit?tab=tickets`}>
                Add a ticket type
              </ButtonLink>
            }
          />
        ) : null}

        {tab === "forms" ? ticketTypes.map((t) => (
          <RegistrationFormEditor
            key={t.id}
            ticketTypeId={t.id}
            ticketTypeName={t.name}
            initial={{
              phoneMode: t.phoneMode,
              rollNumberMode: t.rollNumberMode,
              departmentMode: t.departmentMode,
              fields: t.customFields.map((c) => ({
                id: c.id,
                label: c.label,
                helpText: c.helpText ?? "",
                placeholder: c.placeholder ?? "",
                type: c.type,
                required: c.required,
                options: c.options,
              })),
            }}
          />
        )) : null}

        {tab === "hosts" ? <HostsEditor eventId={event.id} hosts={hosts as HostRow[]} /> : null}

        {tab === "passes" ? (
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
        ) : null}

        {tab === "scanners" ? (
        <ScannersEditor
          eventId={event.id}
          scanners={scanners.map((row): ScannerRow => ({
            id: row.id,
            gateId: row.gateId,
            user: row.user,
            assignedBy: row.assignedBy.fullName,
          }))}
        />
        ) : null}
      </div>
    </>
  );
}
