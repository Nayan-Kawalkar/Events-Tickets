"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export function ManualPaymentForm({
  eventId,
  ticketTypeId,
  amountLabel,
}: {
  eventId: string;
  ticketTypeId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string | null>(null);

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

        <Button type="submit" disabled={pending} className="w-full">
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
