import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress, parseWaitlist } from "./service.ts";

test("accepts a valid sign-up and normalizes the email", () => {
  assert.deepEqual(parseWaitlist({ email: "  Ada@Example.COM ", consent: true, locale: "it", website: "" }), {
    status: "ok",
    email: "ada@example.com",
    locale: "it",
  });
});

test("rejects a missing body, a bad email, no consent and an unknown language", () => {
  assert.equal(parseWaitlist(null).status, "invalid");
  assert.equal(parseWaitlist({ email: "not-an-email", consent: true, locale: "en" }).status, "invalid");
  assert.equal(parseWaitlist({ email: "a@example.com", consent: false, locale: "en" }).status, "invalid");
  assert.equal(parseWaitlist({ email: "a@example.com", consent: "on", locale: "en" }).status, "invalid");
  assert.equal(parseWaitlist({ email: "a@example.com", consent: true, locale: "fr" }).status, "invalid");
});

test("flags a filled honeypot as a bot before looking at anything else", () => {
  assert.equal(parseWaitlist({ email: "a@example.com", consent: true, locale: "en", website: "http://spam.example" }).status, "bot");
  assert.equal(parseWaitlist({ website: "x" }).status, "bot");
});

test("takes the first forwarded address", () => {
  assert.equal(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientAddress(new Headers()), "unknown-client");
});
