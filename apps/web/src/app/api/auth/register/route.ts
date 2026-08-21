import { prisma, Role } from "@ct/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allowedEmailDomains } from "@/lib/env";
import { ok, fail, parseJson, sameOrigin, serverError, tooManyRequests } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const ip = await clientIp();
  const limit = rateLimit(`register:${ip}`, 5, 15 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = await parseJson(request, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, fullName, rollNumber, department } = parsed.data;

  // Any email address is accepted unless ALLOWED_EMAIL_DOMAINS narrows it.
  const domain = email.split("@")[1] ?? "";
  if (allowedEmailDomains.length > 0 && !allowedEmailDomains.includes(domain)) {
    return fail(422, "VALIDATION_FAILED", "This email domain is not allowed for sign-up.", {
      email: `Use an email on: ${allowedEmailDomains.join(", ")}`,
    });
  }

  try {
    const passwordHash = await hashPassword(password);

    // New accounts are always STUDENT. Elevating a role is an admin action.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        rollNumber: rollNumber || null,
        department: department || null,
        role: Role.STUDENT,
      },
      select: { id: true, email: true, fullName: true, role: true },
    });

    await audit({
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "USER_REGISTERED",
    });

    await setSessionCookie(user.id);
    return ok({ user }, 201);
  } catch (err) {
    // Unique constraint on email — do not confirm which addresses are registered.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "EMAIL_TAKEN", "That email cannot be registered. Try signing in instead.");
    }
    return serverError("register", err);
  }
}
