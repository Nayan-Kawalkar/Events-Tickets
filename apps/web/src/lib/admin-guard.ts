import "server-only";
import { NextResponse } from "next/server";
import { prisma, Role } from "@ct/db";
import { getCurrentUser, type SessionUser } from "./auth";
import { forbidden, unauthorized } from "./api";

/** Require an ADMIN for an API route. */
export async function requireAdminApi(): Promise<
  { ok: true; value: SessionUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: unauthorized() };
  if (user.role !== Role.ADMIN) return { ok: false, response: forbidden() };
  return { ok: true, value: user };
}

/**
 * Guard rails that stop an admin locking everyone out of the application.
 *
 * These are not paranoia: a single mis-click that demotes the only admin leaves
 * the system with no way to promote anyone back, because role changes are
 * admin-only by design.
 */
export async function countAdmins() {
  return prisma.user.count({ where: { role: Role.ADMIN } });
}

export type AdminGuardFailure =
  | "CANNOT_TARGET_SELF"
  | "LAST_ADMIN"
  | "USER_NOT_FOUND";

export const ADMIN_GUARD_MESSAGES: Record<AdminGuardFailure, string> = {
  CANNOT_TARGET_SELF: "You cannot change or remove your own account here.",
  LAST_ADMIN: "This is the last admin account. Promote another admin first.",
  USER_NOT_FOUND: "That user no longer exists.",
};

/** Validate a change to another user's account. */
export async function checkUserMutation(params: {
  actor: SessionUser;
  targetUserId: string;
  /** The role the target will end up with, if this is a role change. */
  nextRole?: Role;
  removing?: boolean;
}): Promise<{ ok: true; target: { id: string; email: string; role: Role } } | { ok: false; reason: AdminGuardFailure }> {
  const { actor, targetUserId, nextRole, removing } = params;

  // Self-service role changes are how privilege escalation bugs happen, and
  // self-demotion is how lockouts happen. Neither is allowed.
  if (targetUserId === actor.id) return { ok: false, reason: "CANNOT_TARGET_SELF" };

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return { ok: false, reason: "USER_NOT_FOUND" };

  const losesAdmin =
    target.role === Role.ADMIN && (removing === true || (nextRole !== undefined && nextRole !== Role.ADMIN));

  if (losesAdmin && (await countAdmins()) <= 1) {
    return { ok: false, reason: "LAST_ADMIN" };
  }

  return { ok: true, target };
}
