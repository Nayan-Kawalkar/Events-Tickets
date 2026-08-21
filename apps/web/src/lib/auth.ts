import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma, Role } from "@ct/db";
import { readSession } from "./session";

const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  rollNumber: string | null;
  department: string | null;
  role: Role;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * A bcrypt comparison against a dummy hash, used on unknown-email logins so the
 * response time does not reveal whether an account exists.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.ONO9M2ZlbKzuMkPFHNL8gU8xNfKm8Ae";
export async function fakePasswordCheck() {
  await bcrypt.compare("dummy-password", DUMMY_HASH);
}

/**
 * Short-lived cross-request cache of the signed-in user.
 *
 * `cache()` alone dedupes within one request; a gate scanning hundreds of
 * tickets would still pay a user lookup per scan. Fifteen seconds keeps that
 * off the critical path while bounding how long a role change or a deletion
 * takes to bite — the same trade-off the scanner makes for the event row.
 */
type CachedUser = { user: SessionUser | null; cachedAt: number };
const USER_CACHE_MS = 15_000;
const userCache = new Map<string, CachedUser>();

/** Current user, or null. Cached per request, and briefly across requests. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const hit = userCache.get(session.sub);
  if (hit && Date.now() - hit.cachedAt < USER_CACHE_MS) return hit.user;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      rollNumber: true,
      department: true,
      role: true,
    },
  });

  userCache.set(session.sub, { user: user ?? null, cachedAt: Date.now() });
  return user ?? null;
});

/** Drop a user from the cache so a change applies on the very next request. */
export function invalidateUserCache(userId: string) {
  userCache.delete(userId);
}

/** Require a signed-in user in a page/layout, else redirect to login. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/login${next}`);
  }
  return user;
}

/** Require one of the given roles in a page/layout, else redirect. */
export async function requireRole(roles: Role[], returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!roles.includes(user.role)) redirect("/dashboard?error=forbidden");
  return user;
}
