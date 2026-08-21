import { z } from "zod";
import { prisma, Role } from "@ct/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { emailSchema, passwordSchema } from "@/lib/validation";

export const runtime = "nodejs";

const createSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().min(2, "Enter a full name").max(120),
    password: passwordSchema,
    role: z.nativeEnum(Role),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    rollNumber: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .strict();

/**
 * Create a staff account.
 *
 * Public sign-up always produces a STUDENT; this is the only path to an
 * ORGANIZER or ADMIN account, and it is admin-only. That is deliberate — an
 * organizer can read every attendee's contact details for their events.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const parsed = await parseJson(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        department: input.department || null,
        rollNumber: input.rollNumber || null,
        isEmailVerified: true,
      },
      select: { id: true, email: true, fullName: true, role: true },
    });

    await audit({
      actorUserId: admin.id,
      entityType: "User",
      entityId: user.id,
      action: "ADMIN_USER_CREATED",
      metadata: { email: user.email, role: user.role },
    });

    return ok({ user }, 201);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "EMAIL_TAKEN", "An account with that email already exists.", {
        email: "Already registered",
      });
    }
    return serverError("admin create user", err);
  }
}
