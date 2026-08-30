"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, TextInput, PasswordInput } from "./form";
import { Alert, Button } from "./ui";

type ApiErrorBody = { error?: string; message?: string; fields?: Record<string, string> };

/** POST JSON and normalise the error shape our API routes return. */
async function submit(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true as const };
  const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return {
    ok: false as const,
    message: data.message ?? "Something went wrong. Please try again.",
    fields: data.fields ?? {},
  };
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const data = new FormData(formEvent.currentTarget);
    const result = await submit("/api/auth/login", {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });

    if (result.ok) {
      router.push(next);
      router.refresh();
      return;
    }

    setMessage(result.message);
    setFields(result.fields);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message ? <Alert>{message}</Alert> : null}

      <Field label="Email" htmlFor="email" error={fields.email} required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fields.email}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={fields.password} required>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          error={fields.password}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const data = new FormData(formEvent.currentTarget);
    const result = await submit("/api/auth/register", {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      fullName: String(data.get("fullName") ?? ""),
      rollNumber: String(data.get("rollNumber") ?? ""),
      department: String(data.get("department") ?? ""),
    });

    if (result.ok) {
      router.push(next);
      router.refresh();
      return;
    }

    setMessage(result.message);
    setFields(result.fields);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message ? <Alert>{message}</Alert> : null}

      <Field label="Full name" htmlFor="fullName" error={fields.fullName} required>
        <TextInput id="fullName" name="fullName" autoComplete="name" required error={fields.fullName} />
      </Field>

      <Field label="Email" htmlFor="email" error={fields.email} required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fields.email}
          placeholder="you@example.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={fields.password}
        hint="At least 10 characters, including a letter and a number."
        required
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          error={fields.password}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Roll number" htmlFor="rollNumber" error={fields.rollNumber} hint="Required for student-only events.">
          <TextInput id="rollNumber" name="rollNumber" error={fields.rollNumber} />
        </Field>
        <Field label="Department" htmlFor="department" error={fields.department}>
          <TextInput id="department" name="department" error={fields.department} />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
