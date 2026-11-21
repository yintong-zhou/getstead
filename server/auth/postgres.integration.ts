import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { afterEach, before } from "node:test";
import { generate } from "otplib";
import QRCode from "qrcode";
import { getProfile, updateTotp } from "../profile/service.ts";
import { encryptionKey, localPostgresUrl } from "./config.ts";
import { digestRateLimitSubject, totpEnrollmentUri } from "./crypto.ts";
import { db, disconnectDb } from "./database.ts";
import { reserveAttempt } from "./limits.ts";
import { createOwner, resetOwner } from "./owner.ts";
import { readChallenge, readSession, signIn, signOut, verifyMfa } from "./service.ts";

before(() => {
  const url = localPostgresUrl(process.env.DATABASE_URL);
  assert.equal(url.pathname, "/stead_auth_test", "Use the dedicated synthetic-test database.");
  assert.equal(url.search, "", "Use the test database connection URL without overrides.");
});

afterEach(disconnectDb);

test("a new account signs in with its password alone", async () => {
  const email = `test-${randomUUID()}@example.test`;
  const password = "synthetic login password";
  await createOwner(email, password);
  const result = await signIn(email, password);
  assert.equal(result.status, "ok");
  assert.ok(await readSession(result.token));
  assert.deepEqual(await readChallenge(result.token), { status: "anonymous" });
});

test("profile TOTP enrollment controls whether sign-in requires a code", async () => {
  const email = `test-${randomUUID()}@example.test`;
  const password = "synthetic login password";
  const now = Math.floor(Date.now() / 30_000) * 30 + 1;
  await createOwner(email, password);
  const first = await signIn(email, password);
  assert.equal(first.status, "ok");
  const other = await signIn(email, password);
  assert.equal(other.status, "ok");
  const session = await readSession(first.token);
  assert.ok(session);
  const { userId } = session;
  assert.equal((await getProfile(userId)).totpEnabled, false);

  const setup = await updateTotp(userId, first.token, { action: "begin", currentPassword: password });
  assert.ok(setup.secret && setup.enrollmentToken);
  const expectedSvg = await QRCode.toString(totpEnrollmentUri(setup.secret, email), { type: "svg", margin: 4 });
  assert.equal(setup.qrCode, `data:image/svg+xml;base64,${Buffer.from(expectedSvg).toString("base64")}`);
  assert.deepEqual(await readChallenge(setup.enrollmentToken), { status: "anonymous" });
  assert.equal((await getProfile(userId)).totpEnabled, false);
  const code = await generate({ secret: setup.secret, epoch: now });
  const confirmation = { action: "enable", enrollmentToken: setup.enrollmentToken, code };
  assert.deepEqual(await verifyMfa(setup.enrollmentToken, code, now), { status: "expired" });
  await assert.rejects(updateTotp(userId, other.token, confirmation, now), { code: "enrollment_expired" });
  await assert.rejects(updateTotp(userId, first.token, { ...confirmation, code: code === "000000" ? "999999" : "000000" }, now), { code: "invalid_code" });
  assert.deepEqual(await updateTotp(userId, first.token, confirmation, now), { totpEnabled: true });
  assert.equal(await readSession(other.token), null);
  assert.ok(await readSession(first.token));

  await db().authLimit.updateMany({ where: { subjectDigest: digestRateLimitSubject(encryptionKey(), userId) }, data: { windowUntil: new Date(0) } });
  const pending = await signIn(email, password);
  assert.equal(pending.status, "mfa");
  assert.deepEqual(await readChallenge(pending.token), { status: "verify" });
  assert.equal(await readSession(pending.token), null);
  assert.deepEqual(await verifyMfa(pending.token, code, now), { status: "invalid" });
  const nextCode = await generate({ secret: setup.secret, epoch: now + 30 });
  const race = await Promise.all([verifyMfa(pending.token, nextCode, now + 30), verifyMfa(pending.token, nextCode, now + 30)]);
  const success = race.find((result) => result.status === "ok");
  assert.ok(success);
  assert.equal(race.filter((result) => result.status === "ok").length, 1);

  const stale = await signIn(email, password);
  assert.equal(stale.status, "mfa");
  const disable = { action: "disable", currentPassword: password, code: await generate({ secret: setup.secret, epoch: now + 60 }) };
  assert.deepEqual(await updateTotp(userId, success.token, disable, now + 60), { totpEnabled: false });
  assert.equal(await readSession(first.token), null);
  assert.deepEqual(await verifyMfa(stale.token, disable.code, now + 60), { status: "expired" });
  const passwordOnly = await signIn(email, password);
  assert.equal(passwordOnly.status, "ok");
  await signOut(success.token, undefined);
  assert.equal(await readSession(success.token), null);
  const resetPassword = "new synthetic login password";
  assert.equal(await resetOwner(email, resetPassword), true);
  assert.equal(await readSession(passwordOnly.token), null);
  assert.deepEqual(await signIn(email, password), { status: "invalid" });
  assert.equal((await signIn(email, resetPassword)).status, "ok");
});

test("concurrent attempts share one budget and an expired window resets it", async () => {
  const subject = randomUUID();
  const attempts = await Promise.all(Array.from({ length: 10 }, () => reserveAttempt("password", subject)));
  assert.equal(attempts.filter(Boolean).length, 5);

  const id = { phase: "password", subjectDigest: digestRateLimitSubject(encryptionKey(), subject) };
  await db().authLimit.update({ where: { phase_subjectDigest: id }, data: { windowUntil: new Date(0) } });
  assert.equal(await reserveAttempt("password", subject), true);
  const limit = await db().authLimit.findUniqueOrThrow({ where: { phase_subjectDigest: id } });
  assert.equal(limit.attempts, 1);
  assert.ok(limit.windowUntil.getTime() > Date.now());
});

test("an unavailable PostgreSQL connection cannot authenticate a request", async () => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://unused@127.0.0.1:1/stead_auth_test";
  try {
    await assert.rejects(signIn("unavailable@example.test", "synthetic login password"));
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
});
