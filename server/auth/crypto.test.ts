import assert from "node:assert/strict";
import test from "node:test";
import { generate, verify } from "otplib";
import { encryptSecret, decryptSecret, hashPassword, verifyPassword, digestToken, newToken, totpEnrollmentUri, TOTP_EPOCH_TOLERANCE } from "./crypto.ts";

test("the authenticator enrollment URI preserves the account and the TOTP settings", () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const uri = new URL(totpEnrollmentUri(secret, "owner+test@example.com"));
  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.hostname, "totp");
  assert.equal(decodeURIComponent(uri.pathname), "/getstead:owner+test@example.com");
  assert.equal(uri.searchParams.get("issuer"), "getstead");
  assert.equal(uri.searchParams.get("secret"), secret);
  assert.equal(uri.searchParams.get("algorithm") ?? "SHA1", "SHA1");
  assert.equal(uri.searchParams.get("digits") ?? "6", "6");
  assert.equal(uri.searchParams.get("period") ?? "30", "30");
});

test("TOTP accepts adjacent steps, rejects distant steps, and blocks replay", async () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const epoch = 1_700_000_025;
  const epochTolerance = TOTP_EPOCH_TOLERANCE;

  for (const offset of [-30, 30]) {
    const token = await generate({ secret, epoch: epoch + offset });
    assert.equal((await verify({ secret, token, epoch, epochTolerance })).valid, true);
  }
  for (const offset of [-60, 60]) {
    const token = await generate({ secret, epoch: epoch + offset });
    assert.equal((await verify({ secret, token, epoch, epochTolerance })).valid, false);
  }
  const token = await generate({ secret, epoch });
  assert.equal((await verify({
    secret, token, epoch, epochTolerance, afterTimeStep: Math.floor(epoch / 30),
  })).valid, false);
});

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
