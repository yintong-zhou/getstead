import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { afterEach, before } from "node:test";
import { generate } from "otplib";
import { encryptionKey, localPostgresUrl } from "./config.ts";
import { digestRateLimitSubject, digestToken } from "./crypto.ts";
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

test("the PostgreSQL login lifecycle requires and consumes MFA, enforces limits, and revokes sessions", async () => {
  const email = `test-${randomUUID()}@example.test`;
  const password = "synthetic login password";
  const now = Math.floor(Date.now() / 30_000) * 30 + 1;

  async function challenge(currentPassword: string) {
    const result = await signIn(email, currentPassword);
    assert.equal(result.status, "ok");
    return result.token;
  }

  await createOwner(email, password);
  assert.deepEqual(await signIn(email, "wrong test password"), { status: "invalid" });
  await db().authLimit.updateMany({
    where: { phase: "password", subjectDigest: digestRateLimitSubject(encryptionKey(), "unknown-account") },
    data: { windowUntil: new Date(0) },
  });
  assert.deepEqual(await signIn(`absent-${email}`, password), { status: "invalid" });

  const expired = await challenge(password);
  await db().loginChallenge.update({
    where: { tokenDigest: digestToken(expired)! },
    data: { expiresAt: new Date(0) },
  });
  assert.deepEqual(await readChallenge(expired), { status: "anonymous" });
  assert.deepEqual(await verifyMfa(expired, "123456", now), { status: "expired" });

  const first = await challenge(password);
  const enrollment = await readChallenge(first);
  assert.equal(enrollment.status, "enroll");
  assert.equal(await readSession(first), null);
  const initialCode = await generate({ secret: enrollment.secret, epoch: now });
  const wrongCode = initialCode === "000000" ? "999999" : "000000";
  assert.deepEqual(await verifyMfa(first, wrongCode, now), { status: "invalid" });
  const race = await Promise.all([verifyMfa(first, initialCode, now), verifyMfa(first, initialCode, now)]);
  const success = race.find((result) => result.status === "ok");
  assert.ok(success);
  assert.equal(race.filter((result) => result.status === "ok").length, 1);
  assert.ok(await readSession(success.token));

  const next = await challenge(password);
  assert.deepEqual(await readChallenge(next), { status: "verify" });
  assert.deepEqual(await verifyMfa(next, initialCode, now), { status: "invalid" });
  const nextCode = await generate({ secret: enrollment.secret, epoch: now + 30 });
  const nextSession = await verifyMfa(next, nextCode, now + 30);
  assert.equal(nextSession.status, "ok");
  await signOut(success.token, undefined);
  assert.equal(await readSession(success.token), null);
  assert.ok(await readSession(nextSession.token));

  const pending = await challenge(password);
  assert.deepEqual(await signIn(email, password), { status: "limited" });
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.notEqual((await verifyMfa(pending, nextCode, now + 30)).status, "ok");
  }
  assert.deepEqual(await verifyMfa(pending, nextCode, now + 30), { status: "limited" });
  const resetPassword = "new synthetic login password";
  assert.equal(await resetOwner(email, resetPassword), true);
  assert.equal(await readSession(nextSession.token), null);
  assert.deepEqual(await readChallenge(pending), { status: "anonymous" });
  assert.deepEqual(await signIn(email, password), { status: "invalid" });
  assert.equal((await readChallenge(await challenge(resetPassword))).status, "enroll");
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
