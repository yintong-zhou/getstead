import { generateSecret, verify } from "otplib";
import QRCode from "qrcode";
import { encryptionKey } from "../auth/config.ts";
import { decryptSecret, digestToken, encryptSecret, hashPassword, newToken, totpEnrollmentUri, verifyPassword } from "../auth/crypto.ts";
import type { Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { normalizeEmail, validNewPassword, validPasswordInput, validTotpCode } from "../auth/inputs.ts";
import { reserveAttempt } from "../auth/limits.ts";
import { lockUser } from "../auth/service.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { normalizeDisplayName } from "./inputs.ts";

export type Profile = { email: string; displayName: string | null; totpEnabled: boolean; admin: boolean; mustChangePassword: boolean };
const profileFields = { email: true, displayName: true, totpSecret: true, role: true, mustChangePassword: true } as const;
const invalidCredential = () => new ApiError(403, "invalid");

function profileResult({ email, displayName, totpSecret, role, mustChangePassword }: {
  email: string; displayName: string | null; totpSecret: Uint8Array | null; role: string; mustChangePassword: boolean;
}): Profile {
  return { email, displayName, totpEnabled: totpSecret !== null, admin: role === "ADMIN", mustChangePassword };
}

export async function getProfile(userId: string): Promise<Profile> {
  return profileResult(await db().user.findUniqueOrThrow({ where: { id: userId }, select: profileFields }));
}

export async function updateDisplayName(userId: string, input: unknown): Promise<Profile> {
  const displayName = normalizeDisplayName(input);
  return profileResult(await db().user.update({ where: { id: userId }, data: { displayName }, select: profileFields }));
}

async function verifiedHash(userId: string, password: unknown) {
  if (!validPasswordInput(password)) throw new ApiError(422, "validation", "currentPassword");
  if (!await reserveAttempt("password", userId)) throw new ApiError(429, "limited");
  const user = await db().user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!await verifyPassword(password, user?.passwordHash ?? null) || !user) throw invalidCredential();
  return user.passwordHash;
}

async function activeSessionDigest(tx: Prisma.TransactionClient, userId: string, token: string) {
  const tokenDigest = digestToken(token);
  if (!tokenDigest || !await tx.session.findUnique({
    where: { tokenDigest, userId, expiresAt: { gt: new Date() } }, select: { userId: true },
  })) throw new ApiError(401, "unauthenticated");
  return tokenDigest;
}

export async function updateTotp(userId: string, sessionToken: string, input: Record<string, unknown>, epoch = Date.now() / 1000) {
  const { action, enrollmentToken } = input;
  const code = validTotpCode(input.code) ? input.code : undefined;
  if (action !== "begin" && action !== "enable" && action !== "disable") throw new ApiError(422, "validation");
  if (action !== "begin" && !code) throw new ApiError(422, "invalid_code");
  const passwordHash = action === "enable" ? undefined : await verifiedHash(userId, input.currentPassword);
  if (action !== "begin" && !await reserveAttempt("mfa", userId)) throw new ApiError(429, "limited");

  return db().$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user || (passwordHash !== undefined && user.passwordHash !== passwordHash)) throw invalidCredential();
    const tokenDigest = await activeSessionDigest(tx, userId, sessionToken);
    if (Boolean(user.totpSecret) !== (action === "disable")) throw new ApiError(409, "totp_state");
    const key = encryptionKey();
    const enrollmentContext = `totp-enrollment:${userId}:${tokenDigest.toString("hex")}`;

    if (action === "begin") {
      const secret = generateSecret();
      const token = newToken();
      const { email } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      const svg = await QRCode.toString(totpEnrollmentUri(secret, email), { type: "svg", margin: 4 });
      await tx.loginChallenge.deleteMany({ where: { userId, pendingSecret: { not: null } } });
      await tx.loginChallenge.create({ data: {
        tokenDigest: digestToken(token)!, userId, expiresAt: new Date(Date.now() + 300_000),
        pendingSecret: encryptSecret(key, enrollmentContext, secret),
      } });
      return { secret, enrollmentToken: token, qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
    }

    let secret: string;
    if (action === "enable") {
      const digest = typeof enrollmentToken === "string" ? digestToken(enrollmentToken) : null;
      const challenge = digest && await tx.loginChallenge.findUnique({
        where: { tokenDigest: digest, userId, expiresAt: { gt: new Date() } }, select: { pendingSecret: true },
      });
      if (!challenge || !challenge.pendingSecret) throw new ApiError(410, "enrollment_expired");
      try {
        secret = decryptSecret(key, enrollmentContext, challenge.pendingSecret);
      } catch {
        throw new ApiError(410, "enrollment_expired");
      }
    } else {
      secret = decryptSecret(key, userId, user.totpSecret!);
    }

    if (!code) throw new ApiError(422, "invalid_code");
    const result = await verify({ secret, token: code, epoch, epochTolerance: [5, 0],
      afterTimeStep: action === "disable" ? user.lastTotpStep ?? undefined : undefined,
    });
    if (!result.valid || !("timeStep" in result)) throw new ApiError(422, "invalid_code");
    const totpEnabled = action === "enable";
    await tx.user.update({ where: { id: userId }, data: {
      totpSecret: totpEnabled ? encryptSecret(key, userId, secret) : null,
      lastTotpStep: totpEnabled ? result.timeStep : null,
    }, select: { id: true } });
    await tx.loginChallenge.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId, tokenDigest: { not: tokenDigest } } });
    return { totpEnabled };
  });
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
    await tx.user.update({ where: { id: userId }, data: { passwordHash: nextHash, mustChangePassword: false }, select: { id: true } });
    await tx.session.deleteMany({ where: { userId, tokenDigest: { not: tokenDigest } } });
    await tx.loginChallenge.deleteMany({ where: { userId } });
  });
}
