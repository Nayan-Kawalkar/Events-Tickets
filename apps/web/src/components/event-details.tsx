// Lucide dropped brand logos in v1, so social links use generic marks with an
// explicit accessible label naming the network.
import { AtSign, CalendarDays, Globe, Link2, Mail, MapPin, Phone } from "lucide-react";
import { HostAvatar } from "./host-avatar";
import { Card } from "./ui";

export type EventLocation = {
  venue: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type EventContact = {
  contactEmail: string | null;
  contactPhone: string | null;
};

export type HostEntry = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
  avatarUploadId: string | null;
};

/**
 * Google Maps link.
 *
 * Coordinates win when present because an address string can resolve to the
 * wrong place; the text address is the fallback.
 */
function mapsUrl(location: EventLocation) {
  if (location.latitude !== null && location.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }
  const query = [location.venue, location.addressLine].filter(Boolean).join(", ");
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Turn "@handle" or a bare handle into a full profile URL. */
function socialUrl(base: string, value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${base}${trimmed.replace(/^@/, "")}`;
}

export function LocationCard({ location }: { location: EventLocation }) {
  const url = mapsUrl(location);
  if (!location.venue && !location.addressLine) return null;

  return (
    <Card className="space-y-3">
      <h2 className="text-eyebrow">Location</h2>

      <div className="flex gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0">
          {location.venue ? <p className="font-medium text-slate-900">{location.venue}</p> : null}
          {location.addressLine ? (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{location.addressLine}</p>
          ) : null}
        </div>
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/12 px-4 text-sm font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300"
        >
          <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Open in Google Maps
        </a>
      ) : null}
    </Card>
  );
}

export function ContactCard({ contact }: { contact: EventContact }) {
  if (!contact.contactEmail && !contact.contactPhone) return null;

  return (
    <Card className="space-y-3">
      <h2 className="text-eyebrow">Contact</h2>
      <ul className="space-y-2 text-sm">
        {contact.contactEmail ? (
          <li>
            <a
              href={`mailto:${contact.contactEmail}`}
              className="inline-flex items-center gap-2 text-slate-700 transition-colors hover:text-brand-300"
            >
              <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {contact.contactEmail}
            </a>
          </li>
        ) : null}
        {contact.contactPhone ? (
          <li>
            <a
              href={`tel:${contact.contactPhone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-2 text-slate-700 transition-colors hover:text-brand-300"
            >
              <Phone className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {contact.contactPhone}
            </a>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

export function HostsSection({ hosts }: { hosts: HostEntry[] }) {
  if (hosts.length === 0) return null;

  return (
    <section aria-labelledby="hosts">
      <h2 id="hosts" className="text-display mb-4 text-slate-900">
        Hosts
      </h2>

      <ul className="divide-y divide-white/6 rounded-xl border border-white/8 bg-[#09201e]/90">
        {hosts.map((host) => (
          <li key={host.id} className="row-hover flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <HostAvatar name={host.name} uploadId={host.avatarUploadId} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{host.name}</p>
                {host.title ? <p className="truncate text-xs text-slate-500">{host.title}</p> : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3 text-slate-600">
              {host.email ? (
                <a
                  href={`mailto:${host.email}`}
                  className="transition-colors hover:text-brand-300"
                  aria-label={`Email ${host.name}`}
                >
                  <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ) : null}
              {host.instagram ? (
                <a
                  href={socialUrl("https://instagram.com/", host.instagram)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="transition-colors hover:text-brand-300"
                  aria-label={`${host.name} on Instagram`}
                >
                  <AtSign className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ) : null}
              {host.twitter ? (
                <a
                  href={socialUrl("https://x.com/", host.twitter)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="transition-colors hover:text-brand-300"
                  aria-label={`${host.name} on X`}
                >
                  <Globe className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ) : null}
              {host.linkedin ? (
                <a
                  href={socialUrl("https://linkedin.com/in/", host.linkedin)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="transition-colors hover:text-brand-300"
                  aria-label={`${host.name} on LinkedIn`}
                >
                  <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Add to calendar" via a Google Calendar template link. */
export function AddToCalendar({
  title,
  startsAt,
  endsAt,
  location,
  details,
}: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  details?: string;
}) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const url =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${stamp(startsAt)}/${stamp(endsAt)}` +
    `&location=${encodeURIComponent(location)}` +
    (details ? `&details=${encodeURIComponent(details.slice(0, 500))}` : "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/12 px-4 text-sm font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300"
    >
      <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      Add to calendar
    </a>
  );
}
