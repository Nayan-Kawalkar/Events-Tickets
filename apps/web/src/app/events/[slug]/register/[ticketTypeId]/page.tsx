import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, EventStatus, PaymentMode } from "@ct/db";
import { AttendeeForm } from "@/components/attendee-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; ticketTypeId: string }> };

export default async function RegisterPage({ params }: Props) {
  const { slug, ticketTypeId } = await params;

  const idResult = uuidSchema.safeParse(ticketTypeId);
  if (!idResult.success) notFound();

  const [user, ticketType] = await Promise.all([
    requireUser(`/events/${slug}/register/${ticketTypeId}`),
    prisma.ticketType.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        name: true,
        description: true,
        pricePaise: true,
        requiresStudentId: true,
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
        paymentMode: true,
        event: {
          select: { id: true, slug: true, title: true, status: true, venue: true, startsAt: true },
        },
      },
    }),
  ]);

  // Free tickets only: a paid type belongs in the payment flow.
  if (
    !ticketType ||
    ticketType.event.slug !== slug ||
    ticketType.event.status !== EventStatus.PUBLISHED ||
    ticketType.pricePaise > 0 ||
    ticketType.paymentMode !== PaymentMode.AUTOMATIC
  ) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Confirm your details"
        description={`${ticketType.event.title} · ${ticketType.name}`}
      />

      <div className="space-y-5">
        <Card glow={false} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="font-medium text-slate-900">{ticketType.event.title}</p>
            <p className="text-sm text-slate-600">
              {formatDateTime(ticketType.event.startsAt)}
              {ticketType.event.venue ? ` · ${ticketType.event.venue}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">{ticketType.name}</p>
            <p className="font-display text-2xl text-slate-900">
              {formatPrice(ticketType.pricePaise)}
            </p>
          </div>
        </Card>

        <AttendeeForm
          eventId={ticketType.event.id}
          ticketTypeId={ticketType.id}
          form={{
            phoneMode: ticketType.phoneMode,
            rollNumberMode: ticketType.rollNumberMode,
            departmentMode: ticketType.departmentMode,
            customFields: ticketType.customFields,
          }}
          submitLabel="Confirm registration"
          defaults={{
            attendeeName: user.fullName,
            attendeeEmail: user.email,
            attendeePhone: "",
            attendeeRollNumber: user.rollNumber ?? "",
            attendeeDepartment: user.department ?? "",
          }}
        />

        <p className="text-sm text-slate-600">
          <Link
            href={`/events/${slug}`}
            className="font-medium text-brand-400 underline-offset-2 hover:underline"
          >
            ← Back to the event
          </Link>
        </p>
      </div>
    </div>
  );
}
