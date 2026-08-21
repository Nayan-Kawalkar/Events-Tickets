"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Field, TextInput } from "./form";
import { Alert, Button, Card } from "./ui";
import { useToast } from "./toast";

export function ProfileForm({
  initial,
}: {
  initial: { fullName: string; rollNumber: string; department: string; email: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set(key: "fullName" | "rollNumber" | "department", value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const result = await apiRequest("/api/me", "PATCH", {
      fullName: values.fullName,
      rollNumber: values.rollNumber,
      department: values.department,
    });

    setPending(false);

    if (!result.ok) {
      setMessage(result.message);
      setFields(result.fields);
      toast.push("error", result.message);
      return;
    }

    toast.push("success", "Profile saved.");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {message ? <Alert>{message}</Alert> : null}

        <Field label="Email" htmlFor="email" hint="Your email cannot be changed here.">
          <TextInput id="email" value={values.email} disabled readOnly />
        </Field>

        <Field label="Full name" htmlFor="fullName" error={fields.fullName} required>
          <TextInput
            id="fullName"
            value={values.fullName}
            error={fields.fullName}
            required
            onChange={(e) => set("fullName", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Roll number"
            htmlFor="rollNumber"
            error={fields.rollNumber}
            hint="Required for student-only tickets."
          >
            <TextInput
              id="rollNumber"
              value={values.rollNumber}
              error={fields.rollNumber}
              onChange={(e) => set("rollNumber", e.target.value)}
            />
          </Field>

          <Field label="Department" htmlFor="department" error={fields.department}>
            <TextInput
              id="department"
              value={values.department}
              error={fields.department}
              onChange={(e) => set("department", e.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}
