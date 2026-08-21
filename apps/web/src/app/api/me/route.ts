import { z } from "zod";
import { prisma } from "@ct/db";
import { getCurrentUser, invalidateUserCache } from "@/lib/auth";
import { ok, fail, parseJson, sameOrigin, serverError, unauthorized } from "@/lib/api";

export const runtime = "nodejs";

// Email and role are deliberately not editable here: email identifies the
// account, and role changes are an administrative action.
const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    rollNumber: z.string().trim().max(40).optional().or(z.literal("")),
    department: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return ok({ user });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const parsed = await parseJson(request, profileSchema);
  if (!parsed.ok) return parsed.response;
  const { fullName, rollNumber, department } = parsed.data;

  try {
    const updated = await prisma.user.update({
      // Always the session's own user — the id never comes from the request.
      where: { id: user.id },
      data: {
        fullName,
        rollNumber: rollNumber || null,
        department: department || null,
      },
      select: { id: true, email: true, fullName: true, rollNumber: true, department: true, role: true },
    });

    invalidateUserCache(user.id);
    return ok({ user: updated });
  } catch (err) {
    return serverError("update profile", err);
  }
}
