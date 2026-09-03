import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  QR_SIGNING_SECRET: z.string().min(32, "QR_SIGNING_SECRET must be at least 32 characters"),
  // How long a ticket's QR stays valid after the event ends (default 6 hours).
  QR_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 6),
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),
  // Both required together to switch Google sign-in on; absent means the
  // feature is simply off, never a boot failure.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

/**
 * Public origin of this deployment.
 *
 * `APP_URL` wins, because a custom domain is the only thing that survives
 * a redeploy. Failing that, Vercel's stable production domain is a far
 * better guess than localhost: OAuth redirect URIs and emailed ticket links
 * both break silently when the app believes it lives on port 3000.
 */
function resolveAppUrl(explicit?: string) {
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const env = {
  ...parsed.data,
  APP_URL: resolveAppUrl(parsed.data.APP_URL),
};

/** Domains a new account's email must belong to. Empty array = any domain allowed. */
export const allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS.split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
