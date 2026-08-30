"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { CustomFieldType } from "@/lib/enums";
import {
  BUILT_IN_LABELS,
  type BuiltInKey,
  type FormSpec,
  MULTI_SEPARATOR,
  shownBuiltIns,
} from "@/lib/attendee-fields";
import { Checkbox, Field, Select, TextArea, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type AttendeeDefaults = {
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  attendeeRollNumber: string;
  attendeeDepartment: string;
};

const LABELS: Record<BuiltInKey, string> = {
  ...BUILT_IN_LABELS,
  attendeeDepartment: "Department / class",
};

const HINTS: Partial<Record<BuiltInKey, (required: boolean) => string | undefined>> = {
  attendeePhone: () => "Used only if the organizer needs to reach you about this event.",
  attendeeRollNumber: (required) =>
    required ? "Required — gate staff may check it against your ID." : "Optional.",
};

/**
 * Details collected at purchase.
 *
 * The shape of this form is the organizer's decision, not a fixed list: which
 * built-in fields appear, which are required, and any questions of their own
 * all come from `form`. The same description drives server-side validation, so
 * the two cannot drift apart.
 *
 * Pre-filled from the buyer's profile but fully editable: a guest pass often
 * names someone other than the account holder, and whatever is entered here is
 * what the organizer sees on the attendee list and what the gate checks.
 */
export function AttendeeForm({
  eventId,
  ticketTypeId,
  defaults,
  form,
  submitLabel,
}: {
  eventId: string;
  ticketTypeId: string;
  defaults: AttendeeDefaults;
  form: FormSpec;
  submitLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(defaults);
  const [accepted, setAccepted] = useState(false);
  // Answers to the organizer's own questions, keyed by field id.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set(key: keyof AttendeeDefaults, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function answer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  const shown = shownBuiltIns(form);
  const asked = new Set<BuiltInKey>(shown.map((f) => f.key));

  const payload = {
    ticketTypeId,
    attendeeName: values.attendeeName,
    attendeeEmail: values.attendeeEmail,
    // A hidden field is not sent at all. The server discards it regardless,
    // but there is no reason to transmit what was never asked for.
    attendeePhone: asked.has("attendeePhone") ? values.attendeePhone : "",
    attendeeRollNumber: asked.has("attendeeRollNumber") ? values.attendeeRollNumber : "",
    attendeeDepartment: asked.has("attendeeDepartment") ? values.attendeeDepartment : "",
    customAnswers: answers,
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {/* Only the built-in fields this organizer chose to ask for. */}
          {shown.map(({ key, required }) => (
            <Field
              key={key}
              label={LABELS[key]}
              htmlFor={key}
              error={fields[key]}
              required={required}
              hint={HINTS[key]?.(required)}
            >
              <TextInput
                id={key}
                type={key === "attendeePhone" ? "tel" : "text"}
                inputMode={key === "attendeePhone" ? "tel" : undefined}
                autoComplete={key === "attendeePhone" ? "tel" : undefined}
                value={values[key]}
                error={fields[key]}
                required={required}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>

        {/* Questions this organizer added. */}
        {form.customFields.length > 0 ? (
          <div className="space-y-4 border-t border-white/8 pt-4">
            {form.customFields.map((field) => {
              const value = answers[field.id] ?? "";

              if (field.type === CustomFieldType.CHECKBOX) {
                return (
                  <div key={field.id}>
                    <Checkbox
                      label={field.required ? `${field.label} *` : field.label}
                      hint={field.helpText ?? undefined}
                      checked={value === "true"}
                      onChange={(e) => answer(field.id, e.target.checked ? "true" : "false")}
                    />
                    {fields[field.id] ? (
                      <p role="alert" className="mt-1 text-xs font-medium text-red-300">
                        {fields[field.id]}
                      </p>
                    ) : null}
                  </div>
                );
              }

              return (
                <Field
                  key={field.id}
                  label={field.label}
                  htmlFor={field.id}
                  error={fields[field.id]}
                  required={field.required}
                  hint={field.helpText ?? undefined}
                >
                  {field.type === CustomFieldType.SELECT ? (
                    <Select
                      id={field.id}
                      value={value}
                      error={fields[field.id]}
                      required={field.required}
                      onChange={(e) => answer(field.id, e.target.value)}
                    >
                      <option value="">{field.placeholder || "Select an option"}</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === CustomFieldType.RADIO ? (
                    <div className="space-y-2 pt-1">
                      {field.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name={field.id}
                            value={opt}
                            checked={value === opt}
                            onChange={() => answer(field.id, opt)}
                            className="h-4 w-4 border-white/20 bg-transparent"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : field.type === CustomFieldType.MULTI_SELECT ? (
                    <div className="space-y-2 pt-1">
                      {field.options.map((opt) => {
                        const picked = value ? value.split(MULTI_SEPARATOR) : [];
                        return (
                          <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={picked.includes(opt)}
                              onChange={(e) => {
                                // Rebuilt from the option list so the stored order
                                // matches the order shown, not the order ticked.
                                const next = e.target.checked
                                  ? field.options.filter((o) => picked.includes(o) || o === opt)
                                  : picked.filter((o) => o !== opt);
                                answer(field.id, next.join(MULTI_SEPARATOR));
                              }}
                              className="h-4 w-4 rounded border-white/20 bg-transparent"
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : field.type === CustomFieldType.LONG_TEXT ? (
                    <TextArea
                      id={field.id}
                      rows={3}
                      value={value}
                      placeholder={field.placeholder ?? undefined}
                      error={fields[field.id]}
                      required={field.required}
                      onChange={(e) => answer(field.id, e.target.value)}
                    />
                  ) : (
                    <TextInput
                      id={field.id}
                      type={field.type === CustomFieldType.NUMBER ? "number" : "text"}
                      placeholder={field.placeholder ?? undefined}
                      inputMode={field.type === CustomFieldType.NUMBER ? "numeric" : undefined}
                      value={value}
                      error={fields[field.id]}
                      required={field.required}
                      onChange={(e) => answer(field.id, e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        ) : null}

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
