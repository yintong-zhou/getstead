// Authenticated encryption for free-text fields (movement and template descriptions).
//
// Layout: 1 version byte | 12-byte IV | 16-byte GCM tag | ciphertext. The key is derived from the
// application key with HKDF, so it is distinct from the key that protects authenticator secrets.
// The user and a row context are bound as additional authenticated data: a value copied to another
// user's row, or to another row, fails to decrypt.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { encryptionKey } from "../auth/config.ts";

const VERSION = 1;

function textKey() {
  return Buffer.from(hkdfSync("sha256", encryptionKey(), Buffer.alloc(0), "stead-text-encryption-v1", 32));
}

function additionalData(userId: string, context: string) {
  return Buffer.from(`stead-text-v${VERSION}\0${userId}\0${context}`);
}

export function encryptText(userId: string, context: string, text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", textKey(), iv);
  cipher.setAAD(additionalData(userId, context));
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptText(userId: string, context: string, encrypted: Uint8Array) {
  if (encrypted[0] !== VERSION) throw new Error("Unsupported text envelope.");
  const decipher = createDecipheriv("aes-256-gcm", textKey(), encrypted.subarray(1, 13));
  decipher.setAAD(additionalData(userId, context));
  decipher.setAuthTag(encrypted.subarray(13, 29));
  return Buffer.concat([decipher.update(encrypted.subarray(29)), decipher.final()]).toString("utf8");
}

export const movementContext = (id: string) => `movement:${id}`;
export const templateContext = (id: string) => `template:${id}`;
export const chargeContext = (id: string) => `charge:${id}`;
