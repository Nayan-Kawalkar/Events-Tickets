"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Checkbox, Field, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export function ManualPaymentForm({
  eventId,
  ticketTypeId,
  amountLabel,
  defaults,
  requiresStudentId,
}: {
  eventId: string;
  ticketTypeId: string;
  amountLabel: string;
  defaults: {
    attendeeName: string;
    attendeeEmail: string;
    attendeePhone: string;
    attendeeRollNumber: string;
    attendeeDepartment: string;
  };
  requiresStudentId: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    // multipart, because this carries a screenshot file.
    const body = new FormData(formEvent.currentTarget);
    body.set("ticketTypeId", ticketTypeId);

    let res: Response;
    try {
      res = await fetch(`/api/events/${eventId}/manual-payments`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
    } catch {
      setPending(false);
      setMessage("Network error. Check your connection and try again.");
      return;
    }

    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      fields?: Record<string, string>;
    };

    setPending(false);

    if (!res.ok) {
      setMessage(data.message ?? "Something went wrong. Please try again.");
      setFields(data.fields ?? {});
      toast.push("error", data.message ?? "Could not submit payment details.");
      return;
    }

    toast.push("success", "Payment details submitted for verification.");
    router.push("/payments?submitted=1");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {message ? <Alert>{message}</Alert> : null}

        <div>
          <h2 className="text-eyebrow">Attendee details</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            These appear on the ticket and the organizer&apos;s attendee list.
          </p>
        </div>

        <Field label="Full name" htmlFor="attendeeName" error={fields.attendeeName} required>
          <TextInput
            id="attendeeName"
            name="attendeeName"
            defaultValue={defaults.attendeeName}
            error={fields.attendeeName}
            autoComplete="name"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="attendeeEmail" error={fields.attendeeEmail} required>
            <TextInput
              id="attendeeEmail"
              name="attendeeEmail"
              type="email"
              defaultValue={defaults.attendeeEmail}
              error={fields.attendeeEmail}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Phone" htmlFor="attendeePhone" error={fields.attendeePhone}>
            <TextInput
              id="attendeePhone"
              name="attendeePhone"
              type="tel"
              inputMode="tel"
              defaultValue={defaults.attendeePhone}
              error={fields.attendeePhone}
              autoComplete="tel"
            />
          </Field>
          <Field
            label="Roll number"
            htmlFor="attendeeRollNumber"
            error={fields.attendeeRollNumber}
            hint={requiresStudentId ? "Required for this ticket." : "Optional."}
            required={requiresStudentId}
          >
            <TextInput
              id="attendeeRollNumber"
              name="attendeeRollNumber"
              defaultValue={defaults.attendeeRollNumber}
              error={fields.attendeeRollNumber}
              required={requiresStudentId}
            />
          </Field>
          <Field label="Department / class" htmlFor="attendeeDepartment" error={fields.attendeeDepartment}>
            <TextInput
              id="attendeeDepartment"
              name="attendeeDepartment"
              defaultValue={defaults.attendeeDepartment}
              error={fields.attendeeDepartment}
            />
          </Field>
        </div>

        <div className="border-t border-white/8 pt-4">
          <h2 className="text-eyebrow mb-2">Payment proof</h2>
        </div>

        <Field
          label="UPI reference / UTR number"
          htmlFor="upiTransactionId"
          error={fields.upiTransactionId}
          hint="Optional, but it makes verification much faster."
        >
          <TextInput
            id="upiTransactionId"
            name="upiTransactionId"
            error={fields.upiTransactionId}
            placeholder="e.g. 412345678901"
            inputMode="numeric"
          />
        </Field>

        <Field
          label="Payment screenshot"
          htmlFor="screenshot"
          error={fields.screenshot}
          hint="JPG, PNG or WebP, up to 5 MB."
        >
          <input
            id="screenshot"
            name="screenshot"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="w-full rounded-lg border border-white/12 bg-white/[0.03] p-2 text-sm text-slate-800 transition-colors hover:border-white/20 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-500/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-300 hover:file:bg-brand-500/25"
          />
        </Field>

        {fileName ? <p className="text-xs text-slate-600">Selected: {fileName}</p> : null}

        <div className="border-t border-white/8 pt-4">
          <Checkbox
            label="I accept the event rules"
            hint="One ticket admits one person, once. Tickets are personal and must not be shared."
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <input type="hidden" name="acceptTerms" value={accepted ? "true" : "false"} />
          {fields.acceptTerms ? (
            <p role="alert" className="mt-1 text-xs font-medium text-red-300">
              {fields.acceptTerms}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending || !accepted} className="w-full">
          {pending ? "Submitting…" : `I have paid ${amountLabel} — submit for verification`}
        </Button>

        <p className="text-xs text-slate-500">
          Submitting does not issue a ticket. The organizer checks the payment in their own UPI
          app first, and you will get an email either way.
        </p>
      </form>
    </Card>
  );
}
