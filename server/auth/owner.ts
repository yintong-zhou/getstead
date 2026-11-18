import { randomUUID } from "node:crypto";
import { encryptionKey } from "./config.ts";
import { digestRateLimitSubject, hashPassword } from "./crypto.ts";
import { inTransaction, one } from "./database.ts";
import { normalizeEmail, validPasswordInput } from "./inputs.ts";

function validatedOwner(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  if (!email || !validPasswordInput(password) || [...password].length < 15) {
    throw new Error("Enter a valid email and a password of at least 15 characters and at most 512 bytes.");
  }
  return email;
}

export async function createOwner(emailInput: string, password: string) {
  const email = validatedOwner(emailInput, password);
  const hash = await hashPassword(password);
  return inTransaction(async (connection) => {
    await connection.execute(`
      INSERT INTO stead_users (user_id, email, password_hash) VALUES (:id, :email, :hash)
    `, { id: randomUUID(), email, hash });
  });
}

export async function resetOwner(emailInput: string, password: string) {
  const email = validatedOwner(emailInput, password);
  const hash = await hashPassword(password);
  const key = encryptionKey();
  return inTransaction(async (connection) => {
    const owner = await one<{ USER_ID: string }>(connection,
      "SELECT user_id FROM stead_users WHERE email = :email FOR UPDATE", { email });
    if (!owner) return false;

    const id = owner.USER_ID;
    await connection.execute(`
      UPDATE stead_users SET password_hash = :hash, totp_secret = NULL, last_totp_step = NULL
      WHERE user_id = :id
    `, { id, hash });
    await connection.execute("DELETE FROM stead_login_challenges WHERE user_id = :id", { id });
    await connection.execute("DELETE FROM stead_sessions WHERE user_id = :id", { id });
    await connection.execute(`
      DELETE FROM stead_auth_limits WHERE subject_digest = :subject
    `, { subject: digestRateLimitSubject(key, id) });
    return true;
  });
}
