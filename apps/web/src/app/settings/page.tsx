import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/settings");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Account and notification preferences." />

      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-normal text-slate-900">Account</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Email</dt>
              <dd className="text-slate-900">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Role</dt>
              <dd className="text-slate-900">{user.role.toLowerCase()}</dd>
            </div>
          </dl>
          <ButtonLink href="/profile" variant="secondary">
            Edit profile
          </ButtonLink>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-display text-xl font-normal text-slate-900">Appearance</h2>
          <p className="text-sm text-slate-600">
            CampusPass currently uses a single dark theme. A light-mode toggle is planned.
          </p>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-display text-xl font-normal text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-600">
            Ticket confirmations and payment updates are sent to {user.email}. Per-event
            notification controls are not available yet.
          </p>
        </Card>
      </div>
    </div>
  );
}
