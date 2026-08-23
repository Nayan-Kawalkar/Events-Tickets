import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";
import { GOOGLE_ERRORS, GoogleButton } from "@/components/google-button";
import { Alert, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/nav";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string; signedOut?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="mb-6 font-display text-3xl font-normal tracking-tight">Sign in</h1>

      {params.error ? (
        <div className="mb-4">
          <Alert tone="error">
            {GOOGLE_ERRORS[params.error] ?? "Sign-in failed. Please try again."}
          </Alert>
        </div>
      ) : null}

      {params.signedOut ? (
        <div className="mb-4">
          <Alert tone="success">You have been signed out.</Alert>
        </div>
      ) : null}

      <Card>
        <LoginForm next={next} />
        <GoogleButton next={next} />
      </Card>

      <p className="mt-4 text-sm text-slate-600">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-brand-400 underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
