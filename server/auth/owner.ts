import { encryptionKey } from "./config.ts";
import { digestRateLimitSubject, hashPassword } from "./crypto.ts";
import { db } from "./database.ts";
import { normalizeEmail, validNewPassword } from "./inputs.ts";

function validatedOwner(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  if (!email || !validNewPassword(password)) {
    throw new Error("Enter a valid email and a password of at least 15 characters and at most 512 bytes.");
  }
  return email;
}

export async function createOwner(emailInput: string, password: string) {
  const email = validatedOwner(emailInput, password);
  const hash = await hashPassword(password);
  await db().user.create({ data: { email, passwordHash: hash }, select: { id: true } });
}

/** Makes an existing account an admin. Only possible on the admin connection: the runtime role cannot write `role`. */
export async function promoteOwner(emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!email) throw new Error("Enter a valid email.");
  const { count } = await db().user.updateMany({ where: { email }, data: { role: "ADMIN" } });
  return count === 1;
}

/**
 * Owner-only: it clears the rate limits, and the runtime role cannot DELETE from stead_auth_limits.
 * The CLI runs it on the admin connection through db(); tests pass their own owner client.
 */
export async function resetOwner(emailInput: string, password: string, client = db()) {
  const email = validatedOwner(emailInput, password);
  const hash = await hashPassword(password);
  const key = encryptionKey();
  return client.$transaction(async (tx) => {
    const [owner] = await tx.user.updateManyAndReturn({
      where: { email },
      data: { passwordHash: hash, totpSecret: null, lastTotpStep: null },
      select: { id: true },
    });
    if (!owner) return false;

    const { id: userId } = owner;
    await tx.loginChallenge.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.authLimit.deleteMany({ where: { subjectDigest: digestRateLimitSubject(key, userId) } });
    return true;
  });
}
