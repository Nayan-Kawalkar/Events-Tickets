import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { allowedEmailDomains } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-slate-600">
        {allowedEmailDomains.length > 0
          ? `Sign up with an email on ${allowedEmailDomains.join(" or ")}.`
          : "Any email address works. Use one you can access — tickets are sent there."}
      </p>

      <Card>
        <RegisterForm />
      </Card>

      <p className="mt-4 text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-700 underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
