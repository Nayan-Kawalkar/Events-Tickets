import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clearSessionCookie } from "@/lib/session";
import { fail, ok, sameOrigin } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  await clearSessionCookie();

  if (user) {
    await audit({
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "USER_LOGGED_OUT",
    });
  }

  // Plain form posts (no JS) get a redirect; fetch callers get JSON.
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json")) redirect("/login?signedOut=1");
  return ok({ signedOut: true });
}
