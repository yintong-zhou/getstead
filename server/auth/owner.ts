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

export async function resetOwner(emailInput: string, password: string) {
  const email = validatedOwner(emailInput, password);
  const hash = await hashPassword(password);
  const key = encryptionKey();
  return db().$transaction(async (tx) => {
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
