import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { EventForm } from "@/components/event-form";
import { HostsEditor, type HostRow } from "@/components/hosts-editor";
import { ScannersEditor, type ScannerRow } from "@/components/scanners-editor";
import { VipPassesEditor, type VipPassRow } from "@/components/vip-passes-editor";
import { TicketTypesEditor, type TicketTypeRow } from "@/components/ticket-types-editor";
import { RegistrationFormEditor } from "@/components/registration-form-editor";
import { SectionTabs } from "@/components/section-tabs";
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

      {/* Everything below used to render on a single page — details, ticket
          types, a form editor per ticket type, hosts, passes and scanners.
          Sections are rendered by the server in this one response and
          switched on the client, so choosing one is instant rather than a
          round trip that leaves the URL and the screen frozen. */}
      <SectionTabs
        label="Event settings sections"
        initial={tab}
        sections={[
          {
            value: "details",
            label: "Details",
            content: (
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
            ),
          },
          {
            value: "tickets",
            label: "Ticket types",
            count: counts.tickets,
            content: (
              <TicketTypesEditor
                eventId={event.id}
                ticketTypes={rows}
                eventCapacity={event.capacity}
              />
            ),
          },
          {
            value: "forms",
            label: "Questions",
            count: counts.forms,
            content:
              ticketTypes.length === 0 ? (
                <EmptyState
                  title="No ticket types yet"
                  description="Add a ticket type first — the questions you ask belong to a specific one."
                />
              ) : (
                <div className="space-y-10">
                  {ticketTypes.map((t) => (
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
                  ))}
                </div>
              ),
          },
          {
            value: "hosts",
            label: "Hosts",
            count: counts.hosts,
            content: <HostsEditor eventId={event.id} hosts={hosts as HostRow[]} />,
          },
          {
            value: "passes",
            label: "Guest passes",
            count: counts.passes,
            content: (
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
            ),
          },
          {
            value: "scanners",
            label: "Scanners",
            count: counts.scanners,
            content: (
              <ScannersEditor
                eventId={event.id}
                scanners={scanners.map((row): ScannerRow => ({
                  id: row.id,
                  gateId: row.gateId,
                  user: row.user,
                  assignedBy: row.assignedBy.fullName,
                }))}
              />
            ),
          },
        ]}
      />
    </>
  );
}
