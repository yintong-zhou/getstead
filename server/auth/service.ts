import { verify } from "otplib";
import type { Prisma, User } from "../../db/generated/client.ts";
import { encryptionKey } from "./config.ts";
import { decryptSecret, digestToken, newToken, verifyPassword } from "./crypto.ts";
import { db } from "./database.ts";
import { reserveAttempt } from "./limits.ts";

export async function lockUser(tx: Prisma.TransactionClient, id: string) {
  // The row lock serializes password changes, MFA enrollment, and TOTP verification.
  const [user] = await tx.$queryRaw<Pick<User, "passwordHash" | "totpSecret" | "lastTotpStep" | "disabledAt">[]>`
    SELECT password_hash AS "passwordHash", totp_secret AS "totpSecret", last_totp_step AS "lastTotpStep",
      disabled_at AS "disabledAt"
    FROM stead_users WHERE user_id = ${id}::uuid FOR NO KEY UPDATE
  `;
  return user;
}

async function createSession(tx: Prisma.TransactionClient, userId: string) {
  const token = newToken();
  await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
  await tx.session.create({ data: {
    tokenDigest: digestToken(token)!, userId, expiresAt: new Date(Date.now() + 28_800_000),
  } });
  await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() }, select: { id: true } });
  return token;
}

export async function signIn(email: string, password: string) {
  const user = await db().user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });

  // Unknown addresses share a budget and cannot create unbounded limiter rows.
  if (!await reserveAttempt("password", user?.id ?? "unknown-account")) {
    return { status: "limited", userId: user?.id ?? null } as const;
  }

  if (!await verifyPassword(password, user?.passwordHash ?? null) || !user) {
    return { status: "invalid" } as const;
  }

  return db().$transaction(async (tx) => {
    const current = await lockUser(tx, user.id);
    if (!current || current.passwordHash !== user.passwordHash) return { status: "invalid" } as const;
    // Checked only after the password, so a disabled account is not revealed to someone without it.
    if (current.disabledAt) return { status: "disabled", userId: user.id } as const;
    if (!current.totpSecret) return { status: "ok", token: await createSession(tx, user.id) } as const;

    const token = newToken();
    await tx.loginChallenge.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
    await tx.loginChallenge.create({
      data: {
        tokenDigest: digestToken(token)!,
        userId: user.id,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    return { status: "mfa", token } as const;
  });
}

export async function readChallenge(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return { status: "anonymous" } as const;

  const challenge = await db().loginChallenge.findUnique({
    where: { tokenDigest: digest, pendingSecret: null, expiresAt: { gt: new Date() } },
    select: { user: { select: { totpSecret: true } } },
  });
  return challenge?.user.totpSecret ? { status: "verify" } as const : { status: "anonymous" } as const;
}

export async function verifyMfa(token: string | undefined, code: string, epoch = Date.now() / 1000) {
  const digest = digestToken(token);
  if (!digest) return { status: "expired" } as const;

  const active = await db().loginChallenge.findUnique({
    where: { tokenDigest: digest, pendingSecret: null, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  if (!active) return { status: "expired" } as const;
  if (!await reserveAttempt("mfa", active.userId)) return { status: "limited", userId: active.userId } as const;

  return db().$transaction(async (tx) => {
    const { userId } = active;
    const user = await lockUser(tx, userId);
    const challenge = await tx.loginChallenge.findUnique({
      where: { tokenDigest: digest, userId, pendingSecret: null, expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    if (!user?.totpSecret || !challenge || user.disabledAt) return { status: "expired" } as const;

    const result = await verify({
      secret: decryptSecret(encryptionKey(), userId, user.totpSecret),
      token: code,
      epoch,
      epochTolerance: [5, 0],
      afterTimeStep: user.lastTotpStep ?? undefined,
    });
    if (!result.valid) return { status: "invalid" } as const;
    if (!("timeStep" in result)) throw new Error("Expected TOTP verification.");

    await tx.user.update({ where: { id: userId }, data: { lastTotpStep: result.timeStep } });
    await tx.loginChallenge.deleteMany({ where: { tokenDigest: digest, userId } });
    return { status: "ok", token: await createSession(tx, userId) } as const;
  });
}

/**
 * The live session behind a token, or null. This is the single choke point for every page and API
 * route: a disabled account has no session, whatever cookie it still holds.
 */
export async function readSession(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return null;
  const session = await db().session.findUnique({
    where: { tokenDigest: digest, expiresAt: { gt: new Date() }, user: { disabledAt: null } },
    select: { userId: true, user: { select: { role: true, mustChangePassword: true, totpSecret: true } } },
  });
  if (!session) return null;
  const { role, mustChangePassword, totpSecret } = session.user;
  return { userId: session.userId, admin: role === "ADMIN", mustChangePassword, hasTotp: totpSecret !== null };
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
