import { prisma } from "@ct/db";
import { fakePasswordCheck, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError, tooManyRequests } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

const INVALID = "Email or password is incorrect.";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const ip = await clientIp();
  const parsed = await parseJson(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

  // Limit per IP and per account, so one attacker cannot lock out everyone and
  // a distributed attack cannot grind a single account.
  const byIp = rateLimit(`login:ip:${ip}`, 10, 15 * 60);
  const byAccount = rateLimit(`login:acct:${email}`, 8, 15 * 60);
  if (!byIp.ok || !byAccount.ok) {
    return tooManyRequests(Math.max(byIp.retryAfter, byAccount.retryAfter));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, role: true, passwordHash: true },
    });

    if (!user) {
      await fakePasswordCheck();
      await audit({ entityType: "User", entityId: email, action: "USER_LOGIN_FAILED", metadata: { reason: "NO_SUCH_USER" } });
      return fail(401, "INVALID_CREDENTIALS", INVALID);
    }

    // A Google-only account has no password to check. Same generic answer as
    // a wrong password, and the same work done, so the response cannot be used
    // to discover which accounts use Google.
    if (!user.passwordHash) {
      await fakePasswordCheck();
      await audit({
        actorUserId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "USER_LOGIN_FAILED",
        metadata: { reason: "NO_PASSWORD_SET" },
      });
      return fail(401, "INVALID_CREDENTIALS", INVALID);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await audit({
        actorUserId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "USER_LOGIN_FAILED",
        metadata: { reason: "BAD_PASSWORD" },
      });
      return fail(401, "INVALID_CREDENTIALS", INVALID);
    }

    await setSessionCookie(user.id);
    await audit({
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "USER_LOGIN_SUCCEEDED",
    });

    return ok({
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    return serverError("login", err);
  }
}
