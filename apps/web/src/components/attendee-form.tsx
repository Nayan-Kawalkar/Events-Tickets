"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Checkbox, Field, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type AttendeeDefaults = {
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  attendeeRollNumber: string;
  attendeeDepartment: string;
};

/**
 * Details collected at purchase.
 *
 * Pre-filled from the buyer's profile but fully editable: a guest pass often
 * names someone other than the account holder, and whatever is entered here is
 * what the organizer sees on the attendee list and what the gate checks.
 */
export function AttendeeForm({
  eventId,
  ticketTypeId,
  defaults,
  requiresStudentId,
  submitLabel,
}: {
  eventId: string;
  ticketTypeId: string;
  defaults: AttendeeDefaults;
  requiresStudentId: boolean;
  submitLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(defaults);
  const [accepted, setAccepted] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set(key: keyof AttendeeDefaults, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const payload = {
    ticketTypeId,
    attendeeName: values.attendeeName,
    attendeeEmail: values.attendeeEmail,
    attendeePhone: values.attendeePhone,
    attendeeRollNumber: values.attendeeRollNumber,
    attendeeDepartment: values.attendeeDepartment,
    acceptTerms: accepted,
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const result = await apiRequest<{ ticket: { publicId: string } }>(
      `/api/events/${eventId}/register`,
      "POST",
      payload,
    );

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      router.refresh();
      return;
    }

    toast.push("success", "Ticket issued. Check your email for confirmation.");
    router.push(`/tickets/${result.data.ticket.publicId}?new=1`);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {message ? <Alert>{message}</Alert> : null}

        <div>
          <h2 className="text-eyebrow">Attendee details</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            These appear on the ticket and on the organizer&apos;s attendee list. Enter the details
            of the person who will attend.
          </p>
        </div>

        <Field label="Full name" htmlFor="attendeeName" error={fields.attendeeName} required>
          <TextInput
            id="attendeeName"
            value={values.attendeeName}
            error={fields.attendeeName}
            autoComplete="name"
            required
            onChange={(e) => set("attendeeName", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="attendeeEmail" error={fields.attendeeEmail} required>
            <TextInput
              id="attendeeEmail"
              type="email"
              value={values.attendeeEmail}
              error={fields.attendeeEmail}
              autoComplete="email"
              required
              onChange={(e) => set("attendeeEmail", e.target.value)}
            />
          </Field>

          <Field
            label="Phone"
            htmlFor="attendeePhone"
            error={fields.attendeePhone}
            hint="Used only if the organizer needs to reach you about this event."
          >
            <TextInput
              id="attendeePhone"
              type="tel"
              inputMode="tel"
              value={values.attendeePhone}
              error={fields.attendeePhone}
              autoComplete="tel"
              onChange={(e) => set("attendeePhone", e.target.value)}
            />
          </Field>

          <Field
            label="Roll number"
            htmlFor="attendeeRollNumber"
            error={fields.attendeeRollNumber}
            hint={requiresStudentId ? "Required — gate staff may check it against your ID." : "Optional."}
            required={requiresStudentId}
          >
            <TextInput
              id="attendeeRollNumber"
              value={values.attendeeRollNumber}
              error={fields.attendeeRollNumber}
              required={requiresStudentId}
              onChange={(e) => set("attendeeRollNumber", e.target.value)}
            />
          </Field>

          <Field label="Department / class" htmlFor="attendeeDepartment" error={fields.attendeeDepartment}>
            <TextInput
              id="attendeeDepartment"
              value={values.attendeeDepartment}
              error={fields.attendeeDepartment}
              onChange={(e) => set("attendeeDepartment", e.target.value)}
            />
          </Field>
        </div>

        <div className="border-t border-white/8 pt-4">
          <Checkbox
            label="I accept the event rules"
            hint="One ticket admits one person, once. Tickets are personal and must not be shared."
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          {fields.acceptTerms ? (
            <p role="alert" className="mt-1 text-xs font-medium text-red-300">
              {fields.acceptTerms}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending || !accepted} className="w-full sm:w-auto">
          {pending ? "Registering…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
