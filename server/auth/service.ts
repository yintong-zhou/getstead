import type { Connection } from "oracledb";
import { generateSecret, verify } from "otplib";
import { encryptionKey } from "./config.ts";
import { decryptSecret, digestToken, encryptSecret, newToken, verifyPassword } from "./crypto.ts";
import { inTransaction, one, withConnection } from "./database.ts";
import { reserveAttempt } from "./limits.ts";

type User = {
  USER_ID: string;
  PASSWORD_HASH: string;
  TOTP_SECRET: Buffer | null;
  LAST_TOTP_STEP: number | null;
};
type Challenge = { USER_ID: string; PENDING_SECRET: Buffer | null };

function getUserById(connection: Connection, id: string) {
  return one<User>(connection, `
    SELECT user_id, password_hash, totp_secret, last_totp_step FROM stead_users
    WHERE user_id = :id FOR UPDATE
  `, { id });
}

function getChallenge(connection: Connection, digest: Buffer) {
  return one<Challenge>(connection, `
    SELECT user_id, pending_secret FROM stead_login_challenges
    WHERE token_digest = :digest AND expires_at > SYSTIMESTAMP
  `, { digest });
}

export async function signIn(email: string, password: string) {
  const user = await withConnection((connection) => one<Pick<User, "USER_ID" | "PASSWORD_HASH">>(connection, `
    SELECT user_id, password_hash FROM stead_users WHERE email = :email
  `, { email }));

  // Unknown addresses share a budget and cannot create unbounded limiter rows.
  if (!await reserveAttempt("password", user?.USER_ID ?? "unknown-account")) {
    return { status: "limited" } as const;
  }

  if (!await verifyPassword(password, user?.PASSWORD_HASH ?? null) || !user) {
    return { status: "invalid" } as const;
  }

  return inTransaction(async (connection) => {
    const current = await getUserById(connection, user.USER_ID);
    if (!current || current.PASSWORD_HASH !== user.PASSWORD_HASH) return { status: "invalid" } as const;

    const token = newToken();
    const pending = current.TOTP_SECRET
      ? null
      : encryptSecret(encryptionKey(), user.USER_ID, generateSecret());
    await connection.execute(`
      DELETE FROM stead_login_challenges WHERE user_id = :id AND expires_at <= SYSTIMESTAMP
    `, { id: user.USER_ID });
    await connection.execute(`
      INSERT INTO stead_login_challenges (token_digest, user_id, pending_secret, expires_at)
      VALUES (:digest, :id, :pending, SYSTIMESTAMP + INTERVAL '5' MINUTE)
    `, { digest: digestToken(token), id: user.USER_ID, pending });

    return { status: "ok", token } as const;
  });
}

export async function readChallenge(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return { status: "anonymous" } as const;

  return withConnection(async (connection) => {
    const challenge = await one<Challenge & { TOTP_SECRET: Buffer | null }>(connection, `
      SELECT c.user_id, c.pending_secret, u.totp_secret
      FROM stead_login_challenges c JOIN stead_users u ON u.user_id = c.user_id
      WHERE c.token_digest = :digest AND c.expires_at > SYSTIMESTAMP
    `, { digest });
    if (!challenge) return { status: "anonymous" } as const;
    if (challenge.TOTP_SECRET) return { status: "verify" } as const;
    if (!challenge.PENDING_SECRET) throw new Error("Missing enrollment key.");
    return {
      status: "enroll",
      secret: decryptSecret(encryptionKey(), challenge.USER_ID, challenge.PENDING_SECRET),
    } as const;
  });
}

export async function verifyMfa(token: string | undefined, code: string, epoch = Date.now() / 1000) {
  const digest = digestToken(token);
  if (!digest) return { status: "expired" } as const;

  const active = await withConnection((connection) => getChallenge(connection, digest));
  if (!active) return { status: "expired" } as const;
  if (!await reserveAttempt("mfa", active.USER_ID)) return { status: "limited" } as const;

  return inTransaction(async (connection) => {
    // The user lock serializes successful verifications, enrollment, and owner recovery.
    const user = await getUserById(connection, active.USER_ID);
    const challenge = await getChallenge(connection, digest);
    if (!user || !challenge) return { status: "expired" } as const;

    const secret = user.TOTP_SECRET ?? challenge.PENDING_SECRET;
    if (!secret) throw new Error("Missing MFA key.");
    const result = await verify({
      secret: decryptSecret(encryptionKey(), user.USER_ID, secret),
      token: code,
      epoch,
      epochTolerance: [5, 0],
      afterTimeStep: user.LAST_TOTP_STEP ?? undefined,
    });
    if (!result.valid) return { status: "invalid" } as const;
    if (!("timeStep" in result)) throw new Error("Expected TOTP verification.");

    const session = newToken();
    await connection.execute(`
      UPDATE stead_users SET totp_secret = :secret, last_totp_step = :step WHERE user_id = :id
    `, { secret, step: result.timeStep, id: user.USER_ID });
    if (user.TOTP_SECRET) {
      await connection.execute("DELETE FROM stead_login_challenges WHERE token_digest = :digest", { digest });
    } else {
      await connection.execute("DELETE FROM stead_login_challenges WHERE user_id = :id", { id: user.USER_ID });
    }
    await connection.execute(`
      DELETE FROM stead_sessions WHERE user_id = :id AND expires_at <= SYSTIMESTAMP
    `, { id: user.USER_ID });
    await connection.execute(`
      INSERT INTO stead_sessions (token_digest, user_id, expires_at)
      VALUES (:digest, :id, SYSTIMESTAMP + INTERVAL '8' HOUR)
    `, { digest: digestToken(session), id: user.USER_ID });

    return { status: "ok", token: session } as const;
  });
}

export async function readSession(token: string | undefined) {
  const digest = digestToken(token);
  if (!digest) return null;
  const session = await withConnection((connection) => one<{ USER_ID: string }>(connection, `
    SELECT user_id FROM stead_sessions WHERE token_digest = :digest AND expires_at > SYSTIMESTAMP
  `, { digest }));
  return session ? { userId: session.USER_ID } : null;
}

export async function signOut(sessionToken: string | undefined, challengeToken: string | undefined) {
  const session = digestToken(sessionToken);
  const challenge = digestToken(challengeToken);
  if (!session && !challenge) return;

  await inTransaction(async (connection) => {
    if (session) {
      await connection.execute("DELETE FROM stead_sessions WHERE token_digest = :digest", { digest: session });
    }
    if (challenge) {
      await connection.execute("DELETE FROM stead_login_challenges WHERE token_digest = :digest", { digest: challenge });
    }
  });
}
