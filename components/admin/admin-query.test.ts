import assert from "node:assert/strict";
import test from "node:test";
import { eventCode, routePattern } from "../../server/admin/logs.ts";
import { temporaryPassword } from "../../server/admin/users.ts";
import { logsHref, parseLogsQuery, parseUsersQuery, usersHref } from "./admin-query.ts";

test("users query sanitises the URL and drops defaults from links", () => {
  assert.deepEqual(parseUsersQuery({ q: "  Ann@Example.TEST ", status: "disabled", page: "3" }), { q: "ann@example.test", status: "disabled", page: 3 });
  assert.deepEqual(parseUsersQuery({ status: "root", page: "0" }), { q: "", status: "all", page: 1 });
  assert.deepEqual(parseUsersQuery({ q: ["a", "b"], page: "9999999" }), { q: "", status: "all", page: 1 });
  assert.equal(usersHref("en", { q: "", status: "all", page: 1 }), "/en/admin");
  assert.equal(usersHref("it", { q: "ann", status: "active", page: 2 }), "/it/admin?q=ann&status=active&page=2");
});

test("logs query keeps only valid filters", () => {
  assert.deepEqual(parseLogsQuery({ kind: "SECURITY", code: "login_limited", email: "A@x.test", from: "2026-11-01", to: "2026-11-30", page: "2" }),
    { kind: "SECURITY", code: "login_limited", email: "a@x.test", from: "2026-11-01", to: "2026-11-30", page: 2 });
  assert.deepEqual(parseLogsQuery({ kind: "DEBUG", code: "drop table;", from: "2026-13-45", to: "yesterday" }),
    { kind: "all", code: "", email: "", from: "", to: "", page: 1 });
  assert.equal(logsHref("en", { kind: "ERROR", page: 1 }), "/en/admin/logs?kind=ERROR");
});

test("logged codes keep a safe charset and routes drop ids", () => {
  assert.equal(eventCode("someone@example.test"), "someoneexample.test");
  assert.equal(eventCode("bad code with spaces and ü"), "badcodewithspacesand");
  assert.equal(eventCode("@@@"), "unknown");
  assert.equal(eventCode("x".repeat(100)).length, 64);
  assert.equal(routePattern("/api/cash-flow/movements/0b6f7a1e-3c2d-4e5f-9a8b-7c6d5e4f3a2b/void"), "/api/cash-flow/movements/:id/void");
});

test("temporary passwords are long, url-safe and unique", () => {
  const passwords = new Set(Array.from({ length: 50 }, temporaryPassword));
  assert.equal(passwords.size, 50);
  for (const password of passwords) assert.match(password, /^[A-Za-z0-9_-]{24}$/);
});
