import assert from "node:assert/strict";
import test, { before } from "node:test";
import { decryptText, encryptText, movementContext } from "./text-crypto.ts";

before(() => {
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("a description is stored as authenticated ciphertext that round-trips", () => {
  const text = "Synthetic rent payment – caffè";
  const stored = encryptText(user, movementContext("row-1"), text);
  assert.equal(stored[0], 1);
  assert.ok(!stored.toString("utf8").includes("rent"));
  assert.notDeepEqual(stored, encryptText(user, movementContext("row-1"), text), "a fresh IV each time");
  assert.equal(decryptText(user, movementContext("row-1"), stored), text);
});

test("ciphertext is bound to its user and row and detects modification", () => {
  const stored = encryptText(user, movementContext("row-1"), "synthetic");
  assert.throws(() => decryptText(other, movementContext("row-1"), stored));
  assert.throws(() => decryptText(user, movementContext("row-2"), stored));
  const tampered = Buffer.from(stored);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptText(user, movementContext("row-1"), tampered));
});
