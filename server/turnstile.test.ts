import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { verifyTurnstile } from "./turnstile.ts";

const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

function mock(body: object, ok = true) {
  globalThis.fetch = (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

test("skips outside production without a secret, fails closed in production", async () => {
  delete process.env.TURNSTILE_SECRET;
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.equal(await verifyTurnstile(undefined, "waitlist", "1.1.1.1"), true);
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal(await verifyTurnstile("tok", "waitlist", "1.1.1.1"), false);
});

test("accepts only success for the waitlist action on this hostname", async () => {
  process.env.TURNSTILE_SECRET = "s";
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  mock({ success: true, action: "waitlist", hostname: "127.0.0.1" });
  assert.equal(await verifyTurnstile("tok", "waitlist", "1.1.1.1"), true);
  mock({ success: true, action: "login", hostname: "127.0.0.1" });
  assert.equal(await verifyTurnstile("tok", "waitlist", "1.1.1.1"), false);
  mock({ success: true, action: "waitlist", hostname: "evil.example" });
  assert.equal(await verifyTurnstile("tok", "waitlist", "1.1.1.1"), false);
  mock({ success: false });
  assert.equal(await verifyTurnstile("tok", "waitlist", "1.1.1.1"), false);
  assert.equal(await verifyTurnstile("", "waitlist", "1.1.1.1"), false);
  assert.equal(await verifyTurnstile(undefined, "waitlist", "1.1.1.1"), false);
});

test("throws when Cloudflare is unreachable so the caller can answer 503", async () => {
  process.env.TURNSTILE_SECRET = "s";
  mock({}, false);
  await assert.rejects(verifyTurnstile("tok", "waitlist", "1.1.1.1"));
});
