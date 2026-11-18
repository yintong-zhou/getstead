import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret, decryptSecret, hashPassword, verifyPassword, digestToken, newToken } from "./crypto.ts";

test("password hashes are salted and only the original password verifies", async () => {
  const password = "synthetic test password";
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("a different password", hash), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("an encrypted authenticator key is bound to its account and detects modification", () => {
  const key = Buffer.alloc(32, 7);
  const secret = "synthetic-secret";
  const encrypted = encryptSecret(key, "test-owner", secret);
  assert.notEqual(encrypted.toString(), secret);
  assert.equal(decryptSecret(key, "test-owner", encrypted), secret);
  assert.throws(() => decryptSecret(key, "another-account", encrypted));
  encrypted[0] ^= 1;
  assert.throws(() => decryptSecret(key, "test-owner", encrypted));
});

test("session and challenge tokens are opaque and only valid shapes can be looked up", () => {
  const token = newToken();
  assert.match(token, /^[a-zA-Z0-9_-]{43}$/);
  assert.notEqual(token, newToken());
  assert.equal(digestToken(token)?.length, 32);
  assert.equal(digestToken(token + "="), null);
  assert.equal(digestToken(undefined), null);
});
