"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Field, TextInput } from "./form";
import { HostAvatar } from "./host-avatar";
import { ImageUpload } from "./image-upload";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export type HostRow = {
  id: string;
  name: string;
  title: string | null;
  avatarUploadId: string | null;
  email: string | null;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
};

/** People credited as running the event, listed on the public page. */
export function HostsEditor({ eventId, hosts }: { eventId: string; hosts: HostRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(hosts.length === 0);
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  // Uploaded before the host is saved, so it lives outside the form's own data.
  const [avatar, setAvatar] = useState("");

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const form = e.currentTarget;
    const data = new FormData(form);
    const result = await apiRequest(`/api/organizer/events/${eventId}/hosts`, "POST", {
      name: String(data.get("name") ?? ""),
      title: String(data.get("title") ?? ""),
      email: String(data.get("email") ?? ""),
      avatarUploadId: avatar,
      instagram: String(data.get("instagram") ?? ""),
      twitter: String(data.get("twitter") ?? ""),
      linkedin: String(data.get("linkedin") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", "Host added.");
    form.reset();
    setAvatar("");
    setAdding(false);
    router.refresh();
  }

  async function remove(host: HostRow) {
    if (!confirm(`Remove ${host.name} from the hosts list?`)) return;
    setPending(true);
    const result = await apiRequest(`/api/organizer/hosts/${host.id}`, "DELETE");
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "Host removed.");
    router.refresh();
  }

  return (
    <section aria-labelledby="hosts-heading" className="space-y-4">
      <div>
        <h2 id="hosts-heading" className="text-display text-slate-900">
          Hosts
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Shown on the public event page so attendees know who is running it.
        </p>
      </div>

      {hosts.length > 0 ? (
        <ul className="space-y-2">
          {hosts.map((host) => (
            <li key={host.id}>
              <Card glow={false} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <HostAvatar name={host.name} uploadId={host.avatarUploadId} />

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{host.name}</p>
                  {host.title ? <p className="text-sm text-slate-600">{host.title}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[host.email, host.instagram, host.twitter, host.linkedin]
                      .filter(Boolean)
                      .join(" · ") || "No contact links"}
                  </p>
                </div>
                <Button variant="danger" disabled={pending} onClick={() => remove(host)}>
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <Card>
          <form onSubmit={add} className="space-y-4" noValidate>
            {message ? <Alert>{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="host-name" error={fields.name} required>
                <TextInput id="host-name" name="name" required error={fields.name} />
              </Field>
              <Field
                label="Role"
                htmlFor="host-title"
                error={fields.title}
                hint="e.g. Event Lead, Data Engineer"
              >
                <TextInput id="host-title" name="title" error={fields.title} />
              </Field>
              <Field label="Email" htmlFor="host-email" error={fields.email}>
                <TextInput id="host-email" name="email" type="email" error={fields.email} />
              </Field>
              <Field label="Instagram" htmlFor="host-instagram" error={fields.instagram}>
                <TextInput id="host-instagram" name="instagram" placeholder="@handle or URL" error={fields.instagram} />
              </Field>
              <Field label="X / Twitter" htmlFor="host-twitter" error={fields.twitter}>
                <TextInput id="host-twitter" name="twitter" placeholder="@handle or URL" error={fields.twitter} />
              </Field>
              <Field label="LinkedIn" htmlFor="host-linkedin" error={fields.linkedin}>
                <TextInput id="host-linkedin" name="linkedin" placeholder="Profile URL" error={fields.linkedin} />
              </Field>
            </div>

            <ImageUpload
              kind="HOST_AVATAR"
              uploadId={avatar}
              onUploaded={setAvatar}
              label="Photo"
              hint="Optional. A square headshot works best."
              previewClassName="h-24 w-24 rounded-full"
            />

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add host"}
              </Button>
              {hosts.length > 0 ? (
                <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={pending}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add host
        </Button>
      )}
    </section>
  );
}
