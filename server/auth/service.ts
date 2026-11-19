import { generateSecret, verify } from "otplib";
import type { Prisma, User } from "../../db/generated/client.ts";
import { encryptionKey } from "./config.ts";
import { decryptSecret, digestToken, encryptSecret, newToken, verifyPassword } from "./crypto.ts";
import { db } from "./database.ts";
import { reserveAttempt } from "./limits.ts";

async function lockUser(tx: Prisma.TransactionClient, id: string) {
  // The row lock serializes password changes, MFA enrollment, and TOTP verification.
  const [user] = await tx.$queryRaw<Pick<User, "passwordHash" | "totpSecret" | "lastTotpStep">[]>`
    SELECT password_hash AS "passwordHash", totp_secret AS "totpSecret", last_totp_step AS "lastTotpStep"
    FROM stead_users WHERE user_id = ${id}::uuid FOR NO KEY UPDATE
  `;
  return user;
}

export async function signIn(email: string, password: string) {
  const user = await db().user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });

  // Unknown addresses share a budget and cannot create unbounded limiter rows.
  if (!await reserveAttempt("password", user?.id ?? "unknown-account")) {
    return { status: "limited" } as const;
  }

  if (!await verifyPassword(password, user?.passwordHash ?? null) || !user) {
    return { status: "invalid" } as const;
  }

  return db().$transaction(async (tx) => {
    const current = await lockUser(tx, user.id);
    if (!current || current.passwordHash !== user.passwordHash) return { status: "invalid" } as const;

    const token = newToken();
    const pendingSecret = current.totpSecret
      ? null
      : encryptSecret(encryptionKey(), user.id, generateSecret());
    await tx.loginChallenge.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
    await tx.loginChallenge.create({
      data: {
        tokenDigest: digestToken(token)!,
        userId: user.id,
        pendingSecret,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    return { status: "ok", token } as const;
  });
}

export async function readChallenge(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return { status: "anonymous" } as const;

  const challenge = await db().loginChallenge.findUnique({
    where: { tokenDigest: digest, expiresAt: { gt: new Date() } },
    select: { userId: true, pendingSecret: true, user: { select: { totpSecret: true } } },
  });
  if (!challenge) return { status: "anonymous" } as const;
  if (challenge.user.totpSecret) return { status: "verify" } as const;
  if (!challenge.pendingSecret) throw new Error("Missing enrollment key.");
  return {
    status: "enroll",
    secret: decryptSecret(encryptionKey(), challenge.userId, challenge.pendingSecret),
  } as const;
}

export async function verifyMfa(token: string | undefined, code: string, epoch = Date.now() / 1000) {
  const digest = digestToken(token);
  if (!digest) return { status: "expired" } as const;

  const active = await db().loginChallenge.findUnique({
    where: { tokenDigest: digest, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  if (!active) return { status: "expired" } as const;
  if (!await reserveAttempt("mfa", active.userId)) return { status: "limited" } as const;

  return db().$transaction(async (tx) => {
    const { userId } = active;
    const user = await lockUser(tx, userId);
    const challenge = await tx.loginChallenge.findUnique({
      where: { tokenDigest: digest, userId, expiresAt: { gt: new Date() } },
      select: { pendingSecret: true },
    });
    if (!user || !challenge) return { status: "expired" } as const;

    const secret = user.totpSecret ?? challenge.pendingSecret;
    if (!secret) throw new Error("Missing MFA key.");
    const result = await verify({
      secret: decryptSecret(encryptionKey(), userId, secret),
      token: code,
      epoch,
      epochTolerance: [5, 0],
      afterTimeStep: user.lastTotpStep ?? undefined,
    });
    if (!result.valid) return { status: "invalid" } as const;
    if (!("timeStep" in result)) throw new Error("Expected TOTP verification.");

    const session = newToken();
    await tx.user.update({ where: { id: userId }, data: { totpSecret: secret, lastTotpStep: result.timeStep } });
    await tx.loginChallenge.deleteMany({ where: user.totpSecret ? { tokenDigest: digest, userId } : { userId } });
    await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    await tx.session.create({
      data: {
        tokenDigest: digestToken(session)!,
        userId,
        expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
      },
    });

    return { status: "ok", token: session } as const;
  });
}

export async function readSession(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return null;
  return db().session.findUnique({
    where: { tokenDigest: digest, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
}

export async function signOut(sessionToken: string | undefined, challengeToken: string | undefined) {
  const session = digestToken(sessionToken);
  const challenge = digestToken(challengeToken);
  if (!session && !challenge) return;

  await db().$transaction(async (tx) => {
    if (session) await tx.session.deleteMany({ where: { tokenDigest: session } });
    if (challenge) await tx.loginChallenge.deleteMany({ where: { tokenDigest: challenge } });
  });
}
