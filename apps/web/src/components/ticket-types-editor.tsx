"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { PaymentMode } from "@/lib/enums";
import { formatPrice } from "@/lib/format";
import { Checkbox, Field, Select, TextArea, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  capacity: number | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
  requiresStudentId: boolean;
  requiresApproval: boolean;
  transferable: boolean;
  maxPerUser: number;
  paymentMode: PaymentMode;
  organizerUpiId: string | null;
  organizerUpiName: string | null;
  organizerUpiQrUploadId: string | null;
  issuedCount: number;
};

type Draft = {
  name: string;
  description: string;
  priceRupees: string;
  capacity: string;
  salesStartAt: string;
  salesEndAt: string;
  requiresStudentId: boolean;
  requiresApproval: boolean;
  transferable: boolean;
  maxPerUser: string;
  paymentMode: PaymentMode;
  organizerUpiId: string;
  organizerUpiName: string;
  organizerUpiQrUploadId: string;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  priceRupees: "0",
  capacity: "",
  salesStartAt: "",
  salesEndAt: "",
  requiresStudentId: true,
  requiresApproval: false,
  transferable: false,
  maxPerUser: "1",
  paymentMode: PaymentMode.AUTOMATIC,
  organizerUpiId: "",
  organizerUpiName: "",
  organizerUpiQrUploadId: "",
};

function toDraft(row: TicketTypeRow): Draft {
  return {
    name: row.name,
    description: row.description ?? "",
    priceRupees: String(row.pricePaise / 100),
    capacity: row.capacity === null ? "" : String(row.capacity),
    salesStartAt: row.salesStartAt ?? "",
    salesEndAt: row.salesEndAt ?? "",
    requiresStudentId: row.requiresStudentId,
    requiresApproval: row.requiresApproval,
    transferable: row.transferable,
    maxPerUser: String(row.maxPerUser),
    paymentMode: row.paymentMode,
    organizerUpiId: row.organizerUpiId ?? "",
    organizerUpiName: row.organizerUpiName ?? "",
    organizerUpiQrUploadId: row.organizerUpiQrUploadId ?? "",
  };
}

/** Rupees in the form, paise on the wire — money is never stored as a float. */
function draftToPayload(draft: Draft) {
  return {
    name: draft.name,
    description: draft.description,
    pricePaise: Math.round(Number(draft.priceRupees || "0") * 100),
    capacity: draft.capacity,
    salesStartAt: draft.salesStartAt,
    salesEndAt: draft.salesEndAt,
    requiresStudentId: draft.requiresStudentId,
    requiresApproval: draft.requiresApproval,
    transferable: draft.transferable,
    maxPerUser: draft.maxPerUser,
    paymentMode: draft.paymentMode,
    organizerUpiId: draft.organizerUpiId,
    organizerUpiName: draft.organizerUpiName,
    organizerUpiQrUploadId: draft.organizerUpiQrUploadId || null,
  };
}

export function TicketTypesEditor({
  eventId,
  ticketTypes,
  eventCapacity,
}: {
  eventId: string;
  ticketTypes: TicketTypeRow[];
  eventCapacity: number | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(ticketTypes.length === 0);

  const allocated = ticketTypes.reduce((sum, t) => sum + (t.capacity ?? 0), 0);

  return (
    <section aria-labelledby="ticket-types-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ticket-types-heading" className="font-display text-xl font-normal text-slate-900">
          Ticket types
        </h2>
        {eventCapacity !== null ? (
          <p className="text-sm text-slate-600">
            {allocated} of {eventCapacity} seats allocated
          </p>
        ) : null}
      </div>

      {ticketTypes.length === 0 && !adding ? (
        <Card>
          <p className="text-sm text-slate-600">No ticket types yet.</p>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {ticketTypes.map((row) =>
          editingId === row.id ? (
            <li key={row.id}>
              <TicketTypeForm
                eventId={eventId}
                ticketTypeId={row.id}
                initial={toDraft(row)}
                lockedFields={row.issuedCount > 0}
                issuedCount={row.issuedCount}
                onDone={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={row.id}>
              <TicketTypeSummary row={row} onEdit={() => setEditingId(row.id)} />
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <TicketTypeForm
          eventId={eventId}
          initial={emptyDraft}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add ticket type
        </Button>
      )}
    </section>
  );
}

function TicketTypeSummary({ row, onEdit }: { row: TicketTypeRow; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!confirm(`Delete the ticket type "${row.name}"? This cannot be undone.`)) return;
    setPending(true);
    const result = await apiRequest(`/api/organizer/ticket-types/${row.id}`, "DELETE");
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "Ticket type deleted.");
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">
          {row.name} · {formatPrice(row.pricePaise)}
        </p>
        {row.description ? <p className="mt-1 text-sm text-slate-600">{row.description}</p> : null}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <li>Capacity {row.capacity ?? "unlimited"}</li>
          <li>{row.issuedCount} issued</li>
          <li>Max {row.maxPerUser} per person</li>
          <li>{row.requiresStudentId ? "College ID required" : "Guests allowed"}</li>
          <li>{row.transferable ? "Transferable" : "Non-transferable"}</li>
          {row.paymentMode === PaymentMode.MANUAL_UPI ? (
            <li className="font-medium text-amber-300">Manual UPI · {row.organizerUpiId}</li>
          ) : null}
        </ul>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="danger" onClick={remove} disabled={pending || row.issuedCount > 0}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

function TicketTypeForm({
  eventId,
  ticketTypeId,
  initial,
  lockedFields = false,
  issuedCount = 0,
  onDone,
  onCancel,
}: {
  eventId: string;
  ticketTypeId?: string;
  initial: Draft;
  lockedFields?: boolean;
  issuedCount?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const idPrefix = ticketTypeId ?? "new";

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const payload = draftToPayload(draft);
    const result = ticketTypeId
      ? await apiRequest(`/api/organizer/ticket-types/${ticketTypeId}`, "PATCH", payload)
      : await apiRequest(`/api/organizer/events/${eventId}/ticket-types`, "POST", payload);

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", ticketTypeId ? "Ticket type updated." : "Ticket type added.");
    onDone();
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {message ? <Alert>{message}</Alert> : null}
        {lockedFields ? (
          <Alert tone="info">
            {issuedCount} ticket(s) already issued — price and the college ID requirement are locked.
          </Alert>
        ) : null}

        <Field label="Name" htmlFor={`${idPrefix}-name`} error={fields.name} required>
          <TextInput
            id={`${idPrefix}-name`}
            value={draft.name}
            error={fields.name}
            required
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor={`${idPrefix}-description`} error={fields.description}>
          <TextArea
            id={`${idPrefix}-description`}
            value={draft.description}
            error={fields.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price (₹)"
            htmlFor={`${idPrefix}-price`}
            error={fields.pricePaise}
            hint="Enter 0 for a free ticket."
            required
          >
            <TextInput
              id={`${idPrefix}-price`}
              type="number"
              min={0}
              step="0.01"
              value={draft.priceRupees}
              error={fields.pricePaise}
              disabled={lockedFields}
              required
              onChange={(e) => set("priceRupees", e.target.value)}
            />
          </Field>

          <Field
            label="Capacity"
            htmlFor={`${idPrefix}-capacity`}
            error={fields.capacity}
            hint="Leave blank for unlimited."
          >
            <TextInput
              id={`${idPrefix}-capacity`}
              type="number"
              min={issuedCount || 1}
              value={draft.capacity}
              error={fields.capacity}
              onChange={(e) => set("capacity", e.target.value)}
            />
          </Field>

          <Field label="Sales start" htmlFor={`${idPrefix}-salesStart`} error={fields.salesStartAt}>
            <TextInput
              id={`${idPrefix}-salesStart`}
              type="datetime-local"
              value={draft.salesStartAt}
              error={fields.salesStartAt}
              onChange={(e) => set("salesStartAt", e.target.value)}
            />
          </Field>

          <Field label="Sales end" htmlFor={`${idPrefix}-salesEnd`} error={fields.salesEndAt}>
            <TextInput
              id={`${idPrefix}-salesEnd`}
              type="datetime-local"
              value={draft.salesEndAt}
              error={fields.salesEndAt}
              onChange={(e) => set("salesEndAt", e.target.value)}
            />
          </Field>

          <Field label="Max per person" htmlFor={`${idPrefix}-maxPerUser`} error={fields.maxPerUser} required>
            <TextInput
              id={`${idPrefix}-maxPerUser`}
              type="number"
              min={1}
              max={20}
              value={draft.maxPerUser}
              error={fields.maxPerUser}
              required
              onChange={(e) => set("maxPerUser", e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-800">Payment</legend>

          <Field label="How is this ticket paid for?" htmlFor={`${idPrefix}-paymentMode`} error={fields.paymentMode}>
            <Select
              id={`${idPrefix}-paymentMode`}
              value={draft.paymentMode}
              error={fields.paymentMode}
              disabled={lockedFields}
              onChange={(e) => set("paymentMode", e.target.value as PaymentMode)}
            >
              <option value={PaymentMode.AUTOMATIC}>Free (no payment collected)</option>
              <option value={PaymentMode.MANUAL_UPI}>Manual UPI — student pays you directly</option>
            </Select>
          </Field>

          {draft.paymentMode === PaymentMode.MANUAL_UPI ? (
            <div className="mt-3 space-y-3">
              <Field label="Your UPI ID" htmlFor={`${idPrefix}-upiId`} error={fields.organizerUpiId} required>
                <TextInput
                  id={`${idPrefix}-upiId`}
                  value={draft.organizerUpiId}
                  error={fields.organizerUpiId}
                  placeholder="name@bank"
                  onChange={(e) => set("organizerUpiId", e.target.value)}
                />
              </Field>

              <Field label="Account holder name" htmlFor={`${idPrefix}-upiName`} error={fields.organizerUpiName}>
                <TextInput
                  id={`${idPrefix}-upiName`}
                  value={draft.organizerUpiName}
                  error={fields.organizerUpiName}
                  placeholder="Shown to students before they pay"
                  onChange={(e) => set("organizerUpiName", e.target.value)}
                />
              </Field>

              <UpiQrUpload
                uploadId={draft.organizerUpiQrUploadId}
                onUploaded={(id) => set("organizerUpiQrUploadId", id)}
              />

              <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-inset ring-amber-400/25">
                Students pay you directly and upload proof. You must confirm every payment in your
                own UPI or bank app before issuing a ticket — screenshots can be faked.
              </p>
            </div>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="sr-only">Ticket rules</legend>
          <Checkbox
            label="Requires college ID"
            hint="Attendees must have a roll number on file."
            checked={draft.requiresStudentId}
            disabled={lockedFields}
            onChange={(e) => set("requiresStudentId", e.target.checked)}
          />
          {/* Paid types are already gated by payment verification, so this
              would be a second queue for the same decision. */}
          {Number(draft.priceRupees || "0") === 0 ? (
            <Checkbox
              label="Approve each request by hand"
              hint="Free seats go to a queue for you to accept or decline, instead of being issued instantly. Use this when the event is only for your own students."
              checked={draft.requiresApproval}
              onChange={(e) => set("requiresApproval", e.target.checked)}
            />
          ) : null}
          <Checkbox
            label="Transferable"
            hint="Allows an official transfer to another verified account."
            checked={draft.transferable}
            onChange={(e) => set("transferable", e.target.checked)}
          />
        </fieldset>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : ticketTypeId ? "Save ticket type" : "Add ticket type"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Uploads the organizer's UPI QR image and reports back the stored upload id. */
function UpiQrUpload({
  uploadId,
  onUploaded,
}: {
  uploadId: string;
  onUploaded: (uploadId: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const body = new FormData();
    body.set("file", file);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        uploadId?: string;
        message?: string;
      };

      if (!res.ok || !data.uploadId) {
        toast.push("error", data.message ?? "Could not upload that image.");
        return;
      }

      onUploaded(data.uploadId);
      toast.push("success", "UPI QR uploaded. Save the ticket type to apply it.");
    } catch {
      toast.push("error", "Network error while uploading.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-800">UPI QR image</span>

      {uploadId ? (
        <img
          src={`/api/uploads/${uploadId}`}
          alt="Current UPI QR code"
          className="mb-2 h-32 w-32 rounded-lg object-contain ring-1 ring-white/10"
        />
      ) : null}

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        className="w-full rounded-lg border border-white/12 bg-white/[0.03] p-2 text-sm text-slate-800 transition-colors hover:border-white/20 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-500/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-300 hover:file:bg-brand-500/25"
      />
      <p className="mt-1 text-xs text-slate-500">
        {busy ? "Uploading…" : "Optional. Students can also pay using the UPI ID alone."}
      </p>
    </div>
  );
}
