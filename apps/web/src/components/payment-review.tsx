"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Button, Card } from "./ui";
import { useToast } from "./toast";

export type PendingPayment = {
  id: string;
  amountLabel: string;
  ticketTypeName: string;
  submittedAt: string;
  upiTransactionId: string | null;
  screenshotUploadId: string | null;
  payer: { name: string; email: string; rollNumber: string | null };
};

export function PaymentReviewCard({ payment }: { payment: PendingPayment }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(body: { action: "VERIFY" } | { action: "REJECT"; reason: string }) {
    setPending(true);
    const result = await apiRequest(`/api/organizer/manual-payments/${payment.id}`, "POST", body);
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      router.refresh();
      return;
    }

    toast.push(
      "success",
      body.action === "VERIFY" ? "Payment verified — ticket issued." : "Payment rejected.",
    );
    // refresh() re-fetches this route and drops the client router cache, so the
    // attendee list reflects the new ticket the moment it is opened.
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div>
          <p className="font-medium text-slate-900">{payment.payer.name}</p>
          <p className="text-sm text-slate-600">{payment.payer.email}</p>
          {payment.payer.rollNumber ? (
            <p className="text-sm text-slate-600">Roll no. {payment.payer.rollNumber}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">Submitted {payment.submittedAt}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-display text-xl font-normal text-slate-900">{payment.amountLabel}</p>
          <p className="text-sm text-slate-600">{payment.ticketTypeName}</p>
          <p className="mt-1 font-mono text-xs text-slate-700">
            {payment.upiTransactionId ? `UTR ${payment.upiTransactionId}` : "No UTR given"}
          </p>
        </div>
      </div>

      {payment.screenshotUploadId ? (
        <a
          href={`/api/uploads/${payment.screenshotUploadId}`}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          <img
            src={`/api/uploads/${payment.screenshotUploadId}`}
            alt={`Payment screenshot from ${payment.payer.name}`}
            className="media-reveal max-h-56 w-full rounded-lg bg-black/30 object-contain ring-1 ring-white/10 transition-transform duration-300 hover:scale-[1.01] sm:max-h-72"
          />
          <span className="mt-1.5 block text-xs text-brand-400 underline-offset-2 hover:underline">
            Open full size
          </span>
        </a>
      ) : (
        <p className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-600">
          No screenshot was uploaded.
        </p>
      )}

      <p className="rounded-lg bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200 ring-1 ring-inset ring-amber-400/30">
        <strong>Always confirm this payment in your own UPI or bank app before verifying.</strong>{" "}
        Screenshots and reference numbers can be faked.
      </p>

      {rejecting ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${payment.id}`} className="block text-sm font-medium text-slate-800">
            Reason for rejection (the student sees this)
          </label>
          <input
            id={`reason-${payment.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. No matching payment found in our account"
            className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={pending || reason.trim().length < 3}
              onClick={() => act({ action: "REJECT", reason: reason.trim() })}
            >
              Confirm rejection
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            disabled={pending}
            onClick={() => {
              if (confirm("Have you confirmed this payment in your UPI or bank app?")) {
                void act({ action: "VERIFY" });
              }
            }}
          >
            Verify &amp; issue ticket
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
    </Card>
  );
}
