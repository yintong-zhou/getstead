import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { generateURI } from "otplib";

// Allow one step of clock drift each way; afterTimeStep / lastTotpStep still block replay.
export const TOTP_EPOCH_TOLERANCE: [number, number] = [30, 30];

export function totpEnrollmentUri(secret: string, email: string) {
  return generateURI({ issuer: "getstead", label: email, secret });
}

const scryptOptions = { N: 65_536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 };
const dummyHash = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(64)}`;

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = await derivePassword(password, salt);
  return `scrypt-v1:${salt.toString("hex")}:${digest.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string | null) {
  const hash = storedHash && /^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{64}$/.test(storedHash)
    ? storedHash
    : null;
  const [, salt, digest] = (hash ?? dummyHash).split(":");
  const derived = await derivePassword(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(derived, Buffer.from(digest, "hex")) && hash !== null;
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string | undefined) {
  return token && /^[a-zA-Z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest()
    : null;
}

export function digestRateLimitSubject(key: Buffer, subject: string) {
  return createHmac("sha256", key).update("stead-auth-rate-v1\0").update(subject).digest();
}

export function encryptSecret(key: Buffer, userId: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptSecret(key: Buffer, userId: string, encrypted: Uint8Array) {
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8");
}
