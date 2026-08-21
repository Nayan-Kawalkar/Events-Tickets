import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";
import { Alert, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string; signedOut?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  // Only accept relative paths, so ?next= cannot be used as an open redirect.
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>

      {params.signedOut ? (
        <div className="mb-4">
          <Alert tone="success">You have been signed out.</Alert>
        </div>
      ) : null}

      <Card>
        <LoginForm next={next} />
      </Card>

      <p className="mt-4 text-sm text-slate-600">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand-700 underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
