import { digestToken, hashPassword, verifyPassword } from "../auth/crypto.ts";
import { db } from "../auth/database.ts";
import { normalizeEmail, validNewPassword, validPasswordInput } from "../auth/inputs.ts";
import { reserveAttempt } from "../auth/limits.ts";
import { lockUser } from "../auth/service.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { normalizeDisplayName } from "./inputs.ts";

export type Profile = { email: string; displayName: string | null };
const profileFields = { email: true, displayName: true } as const;
const invalidCredential = () => new ApiError(403, "invalid");

export async function getProfile(userId: string): Promise<Profile> {
  return db().user.findUniqueOrThrow({ where: { id: userId }, select: profileFields });
}

export async function updateDisplayName(userId: string, input: unknown): Promise<Profile> {
  const displayName = normalizeDisplayName(input);
  return db().user.update({ where: { id: userId }, data: { displayName }, select: profileFields });
}

async function verifiedHash(userId: string, password: unknown) {
  if (!validPasswordInput(password)) throw new ApiError(422, "validation", "currentPassword");
  if (!await reserveAttempt("password", userId)) throw new ApiError(429, "limited");
  const user = await db().user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!await verifyPassword(password, user?.passwordHash ?? null) || !user) throw invalidCredential();
  return user.passwordHash;
}

export async function changeEmail(userId: string, input: { currentPassword?: unknown; email?: unknown }) {
  const email = normalizeEmail(input.email);
  if (!email) throw new ApiError(422, "validation", "email");
  const passwordHash = await verifiedHash(userId, input.currentPassword);
  try {
    return await db().$transaction(async (tx) => {
      const current = await lockUser(tx, userId);
      if (!current || current.passwordHash !== passwordHash) throw invalidCredential();
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      if (user.email === email) return { email };
      return tx.user.update({ where: { id: userId }, data: { email }, select: { email: true } });
    });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "P2002") throw new ApiError(409, "conflict");
    throw error;
  }
}

export async function changePassword(
  userId: string,
  input: { currentPassword?: unknown; newPassword?: unknown },
  keepSessionToken: string | undefined,
) {
  if (!validNewPassword(input.newPassword)) throw new ApiError(422, "validation", "newPassword");
  const passwordHash = await verifiedHash(userId, input.currentPassword);
  if (input.newPassword === input.currentPassword) throw new ApiError(422, "same_password", "newPassword");
  const tokenDigest = digestToken(keepSessionToken);
  if (!tokenDigest) throw new ApiError(401, "unauthenticated");
  const nextHash = await hashPassword(input.newPassword);
  await db().$transaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (!current || current.passwordHash !== passwordHash) throw invalidCredential();
    const session = await tx.session.findUnique({
      where: { tokenDigest, userId, expiresAt: { gt: new Date() } }, select: { userId: true },
    });
    if (!session) throw new ApiError(401, "unauthenticated");
    await tx.user.update({ where: { id: userId }, data: { passwordHash: nextHash }, select: { id: true } });
    await tx.session.deleteMany({ where: { userId, tokenDigest: { not: tokenDigest } } });
    await tx.loginChallenge.deleteMany({ where: { userId } });
  });
}
