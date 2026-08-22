"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Role } from "@/lib/enums";
import { Field, Select, TextInput } from "./form";
import { Alert, Button, Card, cx } from "./ui";
import { useToast } from "./toast";

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  department: string | null;
  counts: { tickets: number; events: number };
  isSelf: boolean;
};

const roleStyles: Record<Role, string> = {
  ADMIN: "bg-brand-500/12 text-brand-300 ring-brand-500/40",
  SCANNER: "bg-amber-400/12 text-amber-300 ring-amber-400/40",
  ORGANIZER: "bg-sky-400/12 text-sky-300 ring-sky-400/40",
  STUDENT: "bg-slate-200/50 text-slate-700 ring-white/10",
};

/** Create a staff account. Public sign-up can only ever produce a STUDENT. */
export function CreateUserForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const data = new FormData(e.currentTarget);
    const result = await apiRequest("/api/admin/users", "POST", {
      email: String(data.get("email") ?? ""),
      fullName: String(data.get("fullName") ?? ""),
      password: String(data.get("password") ?? ""),
      role: String(data.get("role") ?? Role.ORGANIZER),
      department: String(data.get("department") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", "Account created. Share the password privately.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Create staff account</Button>;
  }

  return (
    <Card className="mb-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {message ? <Alert>{message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="new-name" error={fields.fullName} required>
            <TextInput id="new-name" name="fullName" required error={fields.fullName} />
          </Field>
          <Field label="Email" htmlFor="new-email" error={fields.email} required>
            <TextInput id="new-email" name="email" type="email" required error={fields.email} />
          </Field>
          <Field
            label="Temporary password"
            htmlFor="new-password"
            error={fields.password}
            hint="At least 10 characters with a letter and a number. Share it privately."
            required
          >
            <TextInput id="new-password" name="password" type="text" required error={fields.password} />
          </Field>
          <Field label="Role" htmlFor="new-role" error={fields.role} required>
            <Select id="new-role" name="role" defaultValue={Role.ORGANIZER} error={fields.role}>
              <option value={Role.ORGANIZER}>Organizer</option>
              <option value={Role.SCANNER}>Scanner (gate volunteer)</option>
              <option value={Role.ADMIN}>Admin</option>
              <option value={Role.STUDENT}>Student</option>
            </Select>
          </Field>
        </div>

        <Field label="Department / club" htmlFor="new-dept" error={fields.department}>
          <TextInput id="new-dept" name="department" error={fields.department} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function UserRow({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");

  async function act(body: unknown, method: "PATCH" | "DELETE", success: string) {
    setPending(true);
    const result = await apiRequest(`/api/admin/users/${user.id}`, method, body);
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", success);
    setResetting(false);
    setPassword("");
    router.refresh();
  }

  return (
    <Card glow={false} className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {user.fullName}
            {user.isSelf ? <span className="ml-2 text-xs text-slate-500">(you)</span> : null}
          </p>
          <p className="truncate text-sm text-slate-600">{user.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            {user.counts.events} event(s) · {user.counts.tickets} ticket(s)
            {user.department ? ` · ${user.department}` : ""}
          </p>
        </div>
        <span
          className={cx(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
            roleStyles[user.role],
          )}
        >
          {user.role.toLowerCase()}
        </span>
      </div>

      {/* An admin cannot change or delete their own account here: that is how
          lockouts and accidental self-demotion happen. */}
      {user.isSelf ? (
        <p className="text-xs text-slate-500">
          Manage your own account from Settings. Another admin can change this role.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
          <label htmlFor={`role-${user.id}`} className="sr-only">
            Role for {user.fullName}
          </label>
          <select
            id={`role-${user.id}`}
            defaultValue={user.role}
            disabled={pending}
            onChange={(e) => act({ action: "SET_ROLE", role: e.target.value }, "PATCH", "Role updated.")}
            className="min-h-11 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 [&>option]:bg-[#0b2a27]"
          >
            <option value={Role.STUDENT}>Student</option>
            <option value={Role.SCANNER}>Scanner</option>
            <option value={Role.ORGANIZER}>Organizer</option>
            <option value={Role.ADMIN}>Admin</option>
          </select>

          <Button variant="secondary" disabled={pending} onClick={() => setResetting((v) => !v)}>
            Reset password
          </Button>

          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete ${user.email}? This cannot be undone.`)) {
                void act(undefined, "DELETE", "Account deleted.");
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}

      {resetting ? (
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`pw-${user.id}`} className="sr-only">
            New password for {user.fullName}
          </label>
          <input
            id={`pw-${user.id}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New temporary password"
            className="min-h-11 flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500"
          />
          <Button
            disabled={pending || password.length < 10}
            onClick={() => act({ action: "RESET_PASSWORD", password }, "PATCH", "Password reset.")}
          >
            Save
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
