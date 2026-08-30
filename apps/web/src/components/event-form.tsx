"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EventStatus } from "@/lib/enums";
import { apiRequest } from "@/lib/client-api";
import { slugify } from "@/lib/slug";
import { Field, Select, TextArea, TextInput } from "./form";
import { ImageUpload } from "./image-upload";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type EventFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  status: EventStatus;
  capacity: string;
  posterUploadId: string;
  hostOrganization: string;
  addressLine: string;
  latitude: string;
  longitude: string;
  contactEmail: string;
  contactPhone: string;
};

export const emptyEvent: EventFormValues = {
  title: "",
  slug: "",
  description: "",
  venue: "",
  startsAt: "",
  endsAt: "",
  registrationOpensAt: "",
  registrationClosesAt: "",
  status: EventStatus.DRAFT,
  capacity: "",
  posterUploadId: "",
  hostOrganization: "",
  addressLine: "",
  latitude: "",
  longitude: "",
  contactEmail: "",
  contactPhone: "",
};

export function EventForm({
  initial,
  issuedTickets = 0,
}: {
  initial: EventFormValues;
  issuedTickets?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(initial.id);

  const [values, setValues] = useState(initial);
  // Stop auto-slugging as soon as the organizer edits the slug themselves.
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const payload = {
      title: values.title,
      slug: values.slug,
      description: values.description,
      venue: values.venue,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      registrationOpensAt: values.registrationOpensAt,
      registrationClosesAt: values.registrationClosesAt,
      status: values.status,
      capacity: values.capacity,
      posterUploadId: values.posterUploadId || null,
      hostOrganization: values.hostOrganization,
      addressLine: values.addressLine,
      latitude: values.latitude,
      longitude: values.longitude,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
    };

    const result = isEdit
      ? await apiRequest<{ event: { id: string } }>(`/api/organizer/events/${initial.id}`, "PATCH", payload)
      : await apiRequest<{ event: { id: string } }>("/api/organizer/events", "POST", payload);

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", isEdit ? "Event updated." : "Event created.");
    router.push(`/organizer/events/${result.data.event.id}/edit`);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {message ? <Alert>{message}</Alert> : null}

        <Field label="Title" htmlFor="title" error={fields.title} required>
          <TextInput
            id="title"
            value={values.title}
            error={fields.title}
            required
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </Field>

        <Field
          label="URL slug"
          htmlFor="slug"
          error={fields.slug}
          hint="Appears in the public link: /events/your-slug"
          required
        >
          <TextInput
            id="slug"
            value={values.slug}
            error={fields.slug}
            required
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
        </Field>

        <ImageUpload
          kind="EVENT_POSTER"
          label="Event poster"
          hint="Landscape works best (16:9). JPG, PNG or WebP, up to 5 MB."
          uploadId={values.posterUploadId}
          onUploaded={(id) => set("posterUploadId", id)}
        />

        <Field label="Description" htmlFor="description" error={fields.description}>
          <TextArea
            id="description"
            value={values.description}
            error={fields.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field
          label="Hosted by"
          htmlFor="hostOrganization"
          error={fields.hostOrganization}
          hint="Club, department or committee. Shown above the event title."
        >
          <TextInput
            id="hostOrganization"
            value={values.hostOrganization}
            error={fields.hostOrganization}
            onChange={(e) => set("hostOrganization", e.target.value)}
          />
        </Field>

        <fieldset className="rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-sm font-medium text-slate-800">Location</legend>

          <div className="space-y-3">
            <Field
              label="Venue name"
              htmlFor="venue"
              error={fields.venue}
              hint="Short label used in listings, e.g. Main Auditorium."
            >
              <TextInput
                id="venue"
                value={values.venue}
                error={fields.venue}
                onChange={(e) => set("venue", e.target.value)}
              />
            </Field>

            <Field
              label="Full address"
              htmlFor="addressLine"
              error={fields.addressLine}
              hint="Shown on the event page and used to open the map."
            >
              <TextArea
                id="addressLine"
                value={values.addressLine}
                error={fields.addressLine}
                onChange={(e) => set("addressLine", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Latitude"
                htmlFor="latitude"
                error={fields.latitude}
                hint="Optional. Pins the map exactly."
              >
                <TextInput
                  id="latitude"
                  value={values.latitude}
                  error={fields.latitude}
                  inputMode="decimal"
                  placeholder="21.0951"
                  onChange={(e) => set("latitude", e.target.value)}
                />
              </Field>
              <Field label="Longitude" htmlFor="longitude" error={fields.longitude}>
                <TextInput
                  id="longitude"
                  value={values.longitude}
                  error={fields.longitude}
                  inputMode="decimal"
                  placeholder="79.0034"
                  onChange={(e) => set("longitude", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-sm font-medium text-slate-800">Contact</legend>
          <p className="mb-3 text-xs text-slate-500">
            Shown publicly so attendees can reach you before the event.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact email" htmlFor="contactEmail" error={fields.contactEmail}>
              <TextInput
                id="contactEmail"
                type="email"
                value={values.contactEmail}
                error={fields.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone" error={fields.contactPhone}>
              <TextInput
                id="contactPhone"
                type="tel"
                value={values.contactPhone}
                error={fields.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="startsAt" error={fields.startsAt} required>
            <TextInput
              id="startsAt"
              type="datetime-local"
              value={values.startsAt}
              error={fields.startsAt}
              required
              onChange={(e) => set("startsAt", e.target.value)}
            />
          </Field>
          <Field label="Ends at" htmlFor="endsAt" error={fields.endsAt} required>
            <TextInput
              id="endsAt"
              type="datetime-local"
              value={values.endsAt}
              error={fields.endsAt}
              required
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
          <Field label="Registration opens" htmlFor="registrationOpensAt" error={fields.registrationOpensAt}>
            <TextInput
              id="registrationOpensAt"
              type="datetime-local"
              value={values.registrationOpensAt}
              error={fields.registrationOpensAt}
              onChange={(e) => set("registrationOpensAt", e.target.value)}
            />
          </Field>
          <Field label="Registration closes" htmlFor="registrationClosesAt" error={fields.registrationClosesAt}>
            <TextInput
              id="registrationClosesAt"
              type="datetime-local"
              value={values.registrationClosesAt}
              error={fields.registrationClosesAt}
              onChange={(e) => set("registrationClosesAt", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status" error={fields.status} required>
            <Select id="status" value={values.status} error={fields.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
              {Object.values(EventStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Capacity"
            htmlFor="capacity"
            error={fields.capacity}
            hint={
              issuedTickets > 0
                ? `Cannot go below ${issuedTickets} ticket(s) already issued. Leave blank for unlimited.`
                : "Leave blank for unlimited."
            }
          >
            <TextInput
              id="capacity"
              type="number"
              min={issuedTickets || 1}
              value={values.capacity}
              error={fields.capacity}
              onChange={(e) => set("capacity", e.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create event"}
        </Button>
      </form>
    </Card>
  );
}
