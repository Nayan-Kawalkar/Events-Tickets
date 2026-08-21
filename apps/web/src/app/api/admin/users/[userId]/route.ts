import { z } from "zod";
import { prisma, Role } from "@ct/db";
import { hashPassword, invalidateUserCache } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { ADMIN_GUARD_MESSAGES, checkUserMutation, requireAdminApi } from "@/lib/admin-guard";
import { passwordSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const patchSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("SET_ROLE"), role: z.nativeEnum(Role) }).strict(),
    z.object({ action: z.literal("RESET_PASSWORD"), password: passwordSchema }).strict(),
  ]);

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const idResult = uuidSchema.safeParse((await params).userId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid user id.");

  const parsed = await parseJson(request, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const check = await checkUserMutation({
    actor: admin,
    targetUserId: idResult.data,
    nextRole: body.action === "SET_ROLE" ? body.role : undefined,
  });
  if (!check.ok) return fail(409, check.reason, ADMIN_GUARD_MESSAGES[check.reason]);

  try {
    if (body.action === "SET_ROLE") {
      const updated = await prisma.user.update({
        where: { id: check.target.id },
        data: { role: body.role },
        select: { id: true, email: true, role: true },
      });

      // The session cache would otherwise keep the old role for a few seconds.
      invalidateUserCache(updated.id);

      await audit({
        actorUserId: admin.id,
        entityType: "User",
        entityId: updated.id,
        action: "ADMIN_USER_ROLE_CHANGED",
        metadata: { email: updated.email, from: check.target.role, to: updated.role },
      });

      return ok({ user: updated });
    }

    await prisma.user.update({
      where: { id: check.target.id },
      data: { passwordHash: await hashPassword(body.password) },
    });

    invalidateUserCache(check.target.id);

    await audit({
      actorUserId: admin.id,
      entityType: "User",
      entityId: check.target.id,
      action: "ADMIN_USER_PASSWORD_RESET",
      metadata: { email: check.target.email },
    });

    return ok({ reset: true });
  } catch (err) {
    return serverError("admin update user", err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const idResult = uuidSchema.safeParse((await params).userId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid user id.");

  const check = await checkUserMutation({
    actor: admin,
    targetUserId: idResult.data,
    removing: true,
  });
  if (!check.ok) return fail(409, check.reason, ADMIN_GUARD_MESSAGES[check.reason]);

  try {
    // Tickets, events and payments reference users with onDelete: Restrict, so
    // a user with history cannot be deleted without destroying the audit trail.
    const [tickets, events, payments] = await Promise.all([
      prisma.ticket.count({ where: { ownerUserId: check.target.id } }),
      prisma.event.count({ where: { createdById: check.target.id } }),
      prisma.manualPayment.count({ where: { userId: check.target.id } }),
    ]);

    if (tickets + events + payments > 0) {
      return fail(
        409,
        "HAS_HISTORY",
        `Cannot delete: this account has ${tickets} ticket(s), ${events} event(s) and ${payments} payment(s). Change the role to STUDENT to revoke access instead.`,
      );
    }

    await prisma.user.delete({ where: { id: check.target.id } });
    invalidateUserCache(check.target.id);

    await audit({
      actorUserId: admin.id,
      entityType: "User",
      entityId: check.target.id,
      action: "ADMIN_USER_DELETED",
      metadata: { email: check.target.email, role: check.target.role },
    });

    return ok({ deleted: true });
  } catch (err) {
    return serverError("admin delete user", err);
  }
}
