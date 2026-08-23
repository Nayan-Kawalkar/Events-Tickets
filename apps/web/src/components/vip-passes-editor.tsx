"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { Field, TextInput } from "./form";
import { Alert, Button, Card, cx } from "./ui";
import { useToast } from "./toast";

export type VipPassRow = {
  id: string;
  code: string;
  guestName: string;
  note: string | null;
  status: "ACTIVE" | "USED" | "REVOKED";
  usedAt: string | null;
};

const statusStyles: Record<VipPassRow["status"], string> = {
  ACTIVE: "bg-brand-500/12 text-brand-300 ring-brand-500/40",
  USED: "bg-sky-400/12 text-sky-300 ring-sky-400/40",
  REVOKED: "bg-slate-200/50 text-slate-700 ring-white/10",
};

function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  // Built in the browser so the link always matches the host it is shared from.
  const url = typeof window === "undefined" ? `/vip/${code}` : `${window.location.origin}/vip/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300"
    >
      {copied ? (
        <Check className="h-4 w-4 text-brand-400" strokeWidth={2} aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      )}
      {copied ? "Link copied" : "Copy share link"}
    </button>
  );
}

/** Guest passes an organizer hands out. No account, no registration. */
export function VipPassesEditor({ eventId, passes }: { eventId: string; passes: VipPassRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function issue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const form = e.currentTarget;
    const data = new FormData(form);
    const result = await apiRequest(`/api/organizer/events/${eventId}/vip-passes`, "POST", {
      guestName: String(data.get("guestName") ?? ""),
      note: String(data.get("note") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", "Guest pass created. Copy the link and send it.");
    form.reset();
    router.refresh();
  }

  async function revoke(pass: VipPassRow) {
    if (!confirm(`Cancel ${pass.guestName}'s pass? The link stops working immediately.`)) return;

    setPending(true);
    const result = await apiRequest(`/api/organizer/vip-passes/${pass.id}`, "DELETE");
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "Pass cancelled.");
    router.refresh();
  }

  return (
    <section aria-labelledby="vip-heading" className="space-y-4">
      <div>
        <h2 id="vip-heading" className="text-display text-slate-900">
          Guest passes
        </h2>
        <p className="prose-measure mt-1 text-sm text-slate-600">
          For a chief guest, sponsor or judge who will not register. Send them the link — no
          account, no sign-in. Each pass admits one person, once.
        </p>
      </div>

      {passes.length > 0 ? (
        <ul className="space-y-2">
          {passes.map((pass) => (
            <li key={pass.id}>
              <Card glow={false} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{pass.guestName}</p>
                  {pass.note ? <p className="text-sm text-slate-600">{pass.note}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {pass.usedAt ? `Used ${pass.usedAt}` : "Not used yet"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      statusStyles[pass.status],
                    )}
                  >
                    {pass.status.toLowerCase()}
                  </span>

                  {pass.status === "ACTIVE" ? (
                    <>
                      <ShareLink code={pass.code} />
                      <Button variant="danger" disabled={pending} onClick={() => revoke(pass)}>
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <form onSubmit={issue} className="space-y-4" noValidate>
          {message ? <Alert>{message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest name" htmlFor="vip-name" error={fields.guestName} required>
              <TextInput id="vip-name" name="guestName" required error={fields.guestName} />
            </Field>
            <Field
              label="Note"
              htmlFor="vip-note"
              error={fields.note}
              hint="Optional, shown to the guest — e.g. Chief guest, seat reserved."
            >
              <TextInput id="vip-note" name="note" error={fields.note} />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create guest pass"}
          </Button>

          <p className="text-xs text-slate-500">
            Anyone holding the link can enter, so send it to one person and cancel it if it spreads.
          </p>
        </form>
      </Card>
    </section>
  );
}
