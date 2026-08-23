import { isProduction } from "@/lib/env";
import { googleEnabled } from "@/lib/google-auth";

/**
 * Google sign-in entry point.
 *
 * A plain link, not a form or a client component: starting the handshake is a
 * GET that only mints state and redirects, so there is nothing to hydrate.
 * Unconfigured it renders nothing in production, and a disabled hint in
 * development so a missing credential is visible rather than silent.
 */
export function GoogleButton({ next, label }: { next: string; label?: string }) {
  // Unconfigured: students must never see a button that cannot work. In
  // development, show it greyed out instead of nothing at all — an absent
  // button looks identical to a broken one, which is a bad way to find out
  // the credentials are missing.
  if (!googleEnabled()) {
    if (isProduction) return null;
    return (
      <div className="mt-5">
        <Divider />
        <div
          aria-disabled="true"
          className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/40 grayscale"
        >
          <GoogleMark />
          {label ?? "Continue with Google"}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          Set <code className="font-mono text-white/65">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono text-white/65">GOOGLE_CLIENT_SECRET</code> in{" "}
          <code className="font-mono text-white/65">.env</code> to enable this. Shown in development only.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <Divider />

      <a
        href={`/api/auth/google?returnTo=${encodeURIComponent(next)}`}
        className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#041413]"
      >
        <GoogleMark />
        {label ?? "Continue with Google"}
      </a>
    </div>
  );
}

/** "or" rule separating the password form from the provider button. */
function Divider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-xs uppercase tracking-wide text-white/45">or</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/** Google's mark, inline so the page makes no third-party request for it. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Why a sign-in attempt bounced back. Deliberately vague where being specific
 * would confirm whether an account exists.
 */
export const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in is not available right now. Use your email and password.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  expired: "That sign-in took too long. Please try again.",
  bad_state: "That sign-in could not be verified. Please try again.",
  no_code: "Google did not complete the sign-in. Please try again.",
  google_failed: "Google could not confirm your account. Please try again.",
  google_unreachable: "We could not reach Google just now. Please try again in a moment.",
  conflict: "That account was being created at the same time. Please try signing in again.",
  email_unverified: "Your Google email address is not verified, so it cannot be used to sign in.",
  domain_not_allowed: "That email domain is not allowed here.",
  already_linked: "Another account is already linked to that Google profile.",
  server_error: "Something went wrong signing you in. Please try again.",
};
