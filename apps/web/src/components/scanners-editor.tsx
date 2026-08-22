"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Field, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type ScannerRow = {
  id: string;
  gateId: string | null;
  user: { fullName: string; email: string; role: string };
  assignedBy: string;
};

/** Volunteers allowed to scan this event, and nothing else. */
export function ScannersEditor({ eventId, scanners }: { eventId: string; scanners: ScannerRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const form = e.currentTarget;
    const data = new FormData(form);
    const result = await apiRequest(`/api/organizer/events/${eventId}/scanners`, "POST", {
      email: String(data.get("email") ?? ""),
      gateId: String(data.get("gateId") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", "Volunteer can now scan this event.");
    form.reset();
    router.refresh();
  }

  async function revoke(row: ScannerRow) {
    if (!confirm(`Remove ${row.user.fullName} from this event's scanners?`)) return;

    setPending(true);
    const result = await apiRequest(`/api/organizer/scanner-assignments/${row.id}`, "DELETE");
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "Access revoked.");
    router.refresh();
  }

  return (
    <section aria-labelledby="scanners-heading" className="space-y-4">
      <div>
        <h2 id="scanners-heading" className="text-display text-slate-900">
          Gate volunteers
        </h2>
        <p className="prose-measure mt-1 text-sm text-slate-600">
          A volunteer can scan tickets for this event only. They cannot edit the event, see the
          guest list, or export anything.
        </p>
      </div>

      {scanners.length > 0 ? (
        <ul className="space-y-2">
          {scanners.map((row) => (
            <li key={row.id}>
              <Card glow={false} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{row.user.fullName}</p>
                  <p className="truncate text-sm text-slate-600">{row.user.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.gateId ? `Gate: ${row.gateId}` : "No gate set"} · added by {row.assignedBy}
                    {row.user.role !== "SCANNER" ? ` · ${row.user.role.toLowerCase()}` : ""}
                  </p>
                </div>
                <Button variant="danger" disabled={pending} onClick={() => revoke(row)}>
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <form onSubmit={assign} className="space-y-4" noValidate>
          {message ? <Alert>{message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Volunteer's email"
              htmlFor="scanner-email"
              error={fields.email}
              hint="They must already have an account — ask them to sign up first."
              required
            >
              <TextInput id="scanner-email" name="email" type="email" required error={fields.email} />
            </Field>

            <Field
              label="Gate"
              htmlFor="scanner-gate"
              error={fields.gateId}
              hint="Optional label, e.g. Main Gate."
            >
              <TextInput id="scanner-gate" name="gateId" error={fields.gateId} placeholder="Main Gate" />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add volunteer"}
          </Button>

          <p className="text-xs text-slate-500">
            A student account is promoted to <strong>scanner</strong> when added. Removing them here
            revokes access to this event without touching their account.
          </p>
        </form>
      </Card>
    </section>
  );
}
