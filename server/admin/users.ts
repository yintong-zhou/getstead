// Admin user management. Only account metadata is read here: never balances, movements or any
// other financial data. Every caller is an admin already checked by the api() wrapper.

import { randomBytes } from "node:crypto";
import type { Prisma } from "../../db/generated/client.ts";
import { encryptionKey } from "../auth/config.ts";
import { digestRateLimitSubject, hashPassword } from "../auth/crypto.ts";
import { db } from "../auth/database.ts";
import { normalizeEmail } from "../auth/inputs.ts";
import { ApiError, notFound } from "../cash-flow/errors.ts";
import { integerParam } from "../cash-flow/movements.ts";
import { normalizeDisplayName } from "../profile/inputs.ts";
import { recordEvent } from "./logs.ts";

export const USER_PAGE_SIZE = 25;
const DAY = 86_400_000;
export const ACTIVE_DAYS = 30;

/** 24 base64url characters (144 random bits), above the 15-character minimum for new passwords. */
export function temporaryPassword() {
  return randomBytes(18).toString("base64url");
}

export async function adminOverview(now = Date.now()) {
  const users = db().user;
  const events = db().eventLog;
  const dayAgo = new Date(now - DAY);
  const [total, active, disabled, withTotp, admins, errors24h, security24h] = await Promise.all([
    users.count(),
    users.count({ where: { disabledAt: null, lastLoginAt: { gte: new Date(now - ACTIVE_DAYS * DAY) } } }),
    users.count({ where: { disabledAt: { not: null } } }),
    users.count({ where: { totpSecret: { not: null } } }),
    users.count({ where: { role: "ADMIN" } }),
    events.count({ where: { kind: "ERROR", createdAt: { gte: dayAgo } } }),
    events.count({ where: { kind: "SECURITY", createdAt: { gte: dayAgo } } }),
  ]);
  return { total, active, disabled, withTotp, admins, errors24h, security24h };
}

export type AdminUserDto = {
  id: string; email: string; displayName: string | null; admin: boolean; totpEnabled: boolean;
  mustChangePassword: boolean; createdAt: string; lastLoginAt: string | null; disabledAt: string | null;
};

/** One page of users, newest first. Filters: q (email substring), status (active | disabled). */
export async function listUsers(params: URLSearchParams) {
  const page = integerParam(params, "page", 1, 1, 100_000);
  const q = params.get("q")?.trim().toLowerCase();
  if (q && q.length > 254) throw new ApiError(422, "validation", "q");
  const status = params.get("status");
  if (status && status !== "active" && status !== "disabled") throw new ApiError(422, "validation", "status");

  const where: Prisma.UserWhereInput = {
    ...(q ? { email: { contains: q } } : {}),
    ...(status ? { disabledAt: status === "disabled" ? { not: null } : null } : {}),
  };
  const rows = await db().user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: USER_PAGE_SIZE + 1,
    skip: (page - 1) * USER_PAGE_SIZE,
    select: {
      id: true, email: true, displayName: true, role: true, totpSecret: true, mustChangePassword: true,
      createdAt: true, lastLoginAt: true, disabledAt: true,
    },
  });
  return {
    page,
    hasMore: rows.length > USER_PAGE_SIZE,
    users: rows.slice(0, USER_PAGE_SIZE).map((row): AdminUserDto => ({
      id: row.id, email: row.email, displayName: row.displayName, admin: row.role === "ADMIN",
      totpEnabled: row.totpSecret !== null, mustChangePassword: row.mustChangePassword,
      createdAt: row.createdAt.toISOString(), lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      disabledAt: row.disabledAt?.toISOString() ?? null,
    })),
  };
}

const route = (path: string) => ({ route: `/api/admin/${path}`, method: "POST" });

/** Creates a user with a temporary password, returned once and never stored in clear. */
export async function createUser(actorId: string, input: Record<string, unknown>) {
  const email = normalizeEmail(input.email);
  if (!email) throw new ApiError(422, "validation", "email");
  const displayName = input.displayName === undefined || input.displayName === "" ? null : normalizeDisplayName(input.displayName);
  const password = temporaryPassword();
  const user = await db().user.create({
    data: { email, displayName, passwordHash: await hashPassword(password), mustChangePassword: true },
    select: { id: true },
  });
  await recordEvent({ kind: "SECURITY", code: "admin_user_created", ...route("users"), userId: user.id, actorId });
  return { id: user.id, temporaryPassword: password };
}

function notSelf(actorId: string, userId: string) {
  if (actorId === userId) throw new ApiError(422, "self_action");
}

/**
 * Replaces the password with a temporary one (returned once), clears two-step verification and
 * signs the user out everywhere, like the owner CLI reset. The user must choose a new password next.
 */
export async function resetUserPassword(actorId: string, userId: string) {
  notSelf(actorId, userId);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await db().$transaction(async (tx) => {
    const [user] = await tx.user.updateManyAndReturn({
      where: { id: userId },
      data: { passwordHash, totpSecret: null, lastTotpStep: null, mustChangePassword: true },
      select: { id: true },
    });
    if (!user) throw notFound();
    await tx.loginChallenge.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    // The runtime role cannot delete limiter rows; an expired window has the same effect.
    await tx.authLimit.updateMany({
      where: { subjectDigest: digestRateLimitSubject(encryptionKey(), userId) },
      data: { windowUntil: new Date(0) },
    });
  });
  await recordEvent({ kind: "SECURITY", code: "admin_password_reset", ...route("users/:id/reset-password"), userId, actorId });
  return { temporaryPassword: password };
}

/** Disabling keeps every row but ends all sessions and pending sign-ins; enabling only lifts the block. */
export async function setUserDisabled(actorId: string, userId: string, disabled: boolean) {
  notSelf(actorId, userId);
  await db().$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
    if (count === 0) throw notFound();
    if (disabled) {
      await tx.session.deleteMany({ where: { userId } });
      await tx.loginChallenge.deleteMany({ where: { userId } });
    }
  });
  const path = disabled ? "disable" : "enable";
  await recordEvent({ kind: "SECURITY", code: `admin_user_${path}d`, ...route(`users/:id/${path}`), userId, actorId });
}
