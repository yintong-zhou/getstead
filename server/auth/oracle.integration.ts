import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generate } from "otplib";
import { digestToken } from "./crypto.ts";
import { closePool, inTransaction } from "./database.ts";
import { createOwner, resetOwner } from "./owner.ts";
import { readChallenge, readSession, signIn, signOut, verifyMfa } from "./service.ts";

test("the Oracle login lifecycle requires and consumes MFA, enforces limits, and revokes sessions", async () => {
  assert.match(process.env.ORACLE_USER ?? "", /^stead_auth_test$/i, "Use the dedicated synthetic-test schema.");
  assert.match(process.env.ORACLE_CONNECT_STRING ?? "", /^127\.0\.0\.1:\d+\/XEPDB1$/i, "Use the local Oracle service.");
  const email = `test-${randomUUID()}@example.test`;
  const password = "synthetic login password";
  const now = Math.floor(Date.now() / 30_000) * 30 + 1;

  async function challenge(currentPassword: string) {
    const result = await signIn(email, currentPassword);
    assert.equal(result.status, "ok");
    return result.token;
  }

  try {
    await createOwner(email, password);
    assert.deepEqual(await signIn(email, "wrong test password"), { status: "invalid" });
    assert.deepEqual(await signIn(`absent-${email}`, password), { status: "invalid" });

    const expired = await challenge(password);
    await inTransaction((connection) => connection.execute(
      "UPDATE stead_login_challenges SET expires_at = SYSTIMESTAMP - INTERVAL '1' SECOND WHERE token_digest = :token",
      { token: digestToken(expired) },
    ));
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
  } finally {
    await closePool();
  }
});

test("an unavailable Oracle connection cannot authenticate a request", async () => {
  const originalConnectString = process.env.ORACLE_CONNECT_STRING;
  process.env.ORACLE_CONNECT_STRING = "127.0.0.1:1/XEPDB1";
  try {
    await assert.rejects(signIn("unavailable@example.test", "synthetic login password"));
  } finally {
    await closePool();
    if (originalConnectString === undefined) delete process.env.ORACLE_CONNECT_STRING;
    else process.env.ORACLE_CONNECT_STRING = originalConnectString;
  }
});
