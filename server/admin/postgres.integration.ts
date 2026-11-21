// M5 admin against the synthetic test database, through the least-privilege runtime role.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server.js";
import { generate, generateSecret } from "otplib";
import { PrismaClient } from "../../db/generated/client.ts";
import { encryptionKey, localPostgresUrl } from "../auth/config.ts";
import { digestToken, encryptSecret, hashPassword, newToken } from "../auth/crypto.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { sessionCookie } from "../auth/http.ts";
import { readSession, signIn, verifyMfa } from "../auth/service.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { api } from "../cash-flow/http.ts";
import { changePassword } from "../profile/service.ts";
import { listEvents, pruneEvents, recordEvent } from "./logs.ts";
import { adminOverview, createUser, listUsers, resetUserPassword, setUserDisabled } from "./users.ts";

let owner: PrismaClient;
const password = "synthetic admin test password";

before(() => {
  const url = localPostgresUrl(process.env.DATABASE_URL);
  assert.equal(url.pathname, "/stead_auth_test", "Use the dedicated synthetic-test database.");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});

after(async () => {
  await owner.$disconnect();
  await disconnectDb();
});

async function user({ admin = false, totp = false } = {}) {
  const email = `m5-${randomUUID()}@example.test`;
  const { id } = await owner.user.create({
    data: { email, passwordHash: await hashPassword(password), role: admin ? "ADMIN" : "USER" },
    select: { id: true },
  });
  const secret = generateSecret();
  if (totp) await owner.user.update({ where: { id }, data: { totpSecret: encryptSecret(encryptionKey(), id, secret) } });
  return { id, email, secret };
}

async function session(userId: string) {
  const token = newToken();
  await db().session.create({ data: { userId, tokenDigest: digestToken(token)!, expiresAt: new Date(Date.now() + 60_000) } });
  return token;
}

async function rejectsApi(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error) => error instanceof ApiError && error.status === status && error.code === code);
}

type Handler = (request: NextRequest, route: { params: Promise<Record<string, never>> }) => Promise<Response>;

function call(handler: Handler, token: string, method = "GET", path = "/api/admin/x") {
  const headers: Record<string, string> = { cookie: `${sessionCookie}=${token}`, origin: new URL(process.env.APP_ORIGIN!).origin };
  return handler(new NextRequest(`http://127.0.0.1${path}`, { method, headers }), { params: Promise.resolve({}) });
}

test("the runtime role can neither insert nor update a role", async () => {
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_users (user_id, email, password_hash, role)
    VALUES (${randomUUID()}::uuid, ${`m5-${randomUUID()}@example.test`}, 'x', 'ADMIN')`);
  const { id } = await user();
  await assert.rejects(db().user.update({ where: { id }, data: { role: "ADMIN" } }));
  assert.equal((await owner.user.findUniqueOrThrow({ where: { id } })).role, "USER");
});

test("admin routes need the admin role and two-step verification", async () => {
  const handler = api(async () => ({ ok: true }), { admin: true });
  const plain = await user();
  const noTotp = await user({ admin: true });
  const full = await user({ admin: true, totp: true });
  assert.equal((await call(handler, await session(plain.id))).status, 403);
  assert.equal((await call(handler, await session(noTotp.id))).status, 403);
  assert.equal((await call(handler, await session(full.id))).status, 200);
});

test("a created user signs in with the temporary password and is locked to the password change", async () => {
  const actor = await user({ admin: true, totp: true });
  const email = `m5-${randomUUID()}@example.test`;
  const created = await createUser(actor.id, { email: email.toUpperCase(), displayName: " Synthetic " });
  // The api() wrapper maps P2002 to 409 conflict.
  await assert.rejects(createUser(actor.id, { email }), { code: "P2002" });
  const row = await owner.user.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.email, email);
  assert.equal(row.displayName, "Synthetic");
  assert.equal(row.role, "USER");
  assert.equal(row.mustChangePassword, true);

  const login = await signIn(email, created.temporaryPassword);
  assert.equal(login.status, "ok");
  assert.ok((await owner.user.findUniqueOrThrow({ where: { id: created.id } })).lastLoginAt);

  const other = api(async () => ({ ok: true }));
  const passwordRoute = api(async () => ({ ok: true }), { allowPasswordChange: true });
  assert.equal((await call(other, login.token)).status, 403);
  assert.equal((await call(passwordRoute, login.token)).status, 200);

  await changePassword(created.id, { currentPassword: created.temporaryPassword, newPassword: "synthetic chosen password" }, login.token);
  assert.equal((await owner.user.findUniqueOrThrow({ where: { id: created.id } })).mustChangePassword, false);
  assert.equal((await call(other, login.token)).status, 200);
});

test("reset clears sessions and 2FA, and an admin cannot act on their own account", async () => {
  const actor = await user({ admin: true, totp: true });
  const target = await user({ totp: true });
  const token = await session(target.id);
  const { temporaryPassword } = await resetUserPassword(actor.id, target.id);
  assert.equal(await readSession(token), null);
  const row = await owner.user.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(row.totpSecret, null);
  assert.equal(row.mustChangePassword, true);
  assert.equal((await signIn(target.email, temporaryPassword)).status, "ok");

  await rejectsApi(resetUserPassword(actor.id, actor.id), 422, "self_action");
  await rejectsApi(setUserDisabled(actor.id, actor.id, true), 422, "self_action");
  await rejectsApi(resetUserPassword(actor.id, randomUUID()), 404, "not_found");
});

test("a disabled account loses its sessions and pending challenges and cannot sign in until enabled", async () => {
  const actor = await user({ admin: true, totp: true });
  const target = await user({ totp: true });
  const token = await session(target.id);
  const now = Math.floor(Date.now() / 30_000) * 30 + 1;
  const pending = await signIn(target.email, password);
  assert.equal(pending.status, "mfa");

  await setUserDisabled(actor.id, target.id, true);
  assert.equal(await readSession(token), null);
  assert.equal(await db().loginChallenge.count({ where: { userId: target.id } }), 0);
  assert.deepEqual(await verifyMfa(pending.token, await generate({ secret: target.secret, epoch: now }), now), { status: "expired" });
  assert.equal((await signIn(target.email, password)).status, "disabled");
  assert.equal((await signIn(target.email, "wrong synthetic password")).status, "invalid", "a wrong password does not reveal the state");

  // A session row created behind the service's back is still refused while disabled.
  const sneaky = await session(target.id);
  assert.equal(await readSession(sneaky), null);

  await setUserDisabled(actor.id, target.id, false);
  assert.ok(await readSession(sneaky));
  assert.equal((await signIn(target.email, password)).status, "mfa");

  const events = await listEvents(new URLSearchParams({ kind: "SECURITY", userId: target.id }));
  assert.deepEqual(events.events.map((event) => event.code).sort(), ["admin_user_disabled", "admin_user_enabled"]);
  assert.equal(events.events[0].actorEmail, actor.email);
});

test("users list and overview read metadata with filters and pagination", async () => {
  const marker = randomUUID().slice(0, 8);
  const ids = [];
  for (let index = 0; index < 27; index++) {
    ids.push((await owner.user.create({ data: { email: `m5-${marker}-${index}@example.test`, passwordHash: "x" }, select: { id: true } })).id);
  }
  const actor = await user({ admin: true, totp: true });
  await setUserDisabled(actor.id, ids[0], true);
  const first = await listUsers(new URLSearchParams({ q: marker }));
  assert.equal(first.users.length, 25);
  assert.equal(first.hasMore, true);
  const second = await listUsers(new URLSearchParams({ q: marker, page: "2" }));
  assert.equal(second.users.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.users, ...second.users].map((row) => row.id)).size, 27, "pages never overlap");
  const disabled = await listUsers(new URLSearchParams({ q: marker, status: "disabled" }));
  assert.deepEqual(disabled.users.map((row) => row.id), [ids[0]]);
  assert.deepEqual(Object.keys(first.users[0]).sort(),
    ["admin", "createdAt", "disabledAt", "displayName", "email", "id", "lastLoginAt", "mustChangePassword", "totpEnabled"]);
  await rejectsApi(listUsers(new URLSearchParams({ status: "root" })), 422, "validation");

  const overview = await adminOverview();
  assert.ok(overview.total >= 28 && overview.disabled >= 1 && overview.admins >= 1);
});

test("events: 500s are logged without the message, limited logins once per window, old rows pruned", async () => {
  const target = await user();
  const token = await session(target.id);
  const crash = api(async () => { throw new Error(`secret ${target.email} 12345.67`); });
  const route = `/api/cash-flow/movements/${randomUUID()}`;
  assert.equal((await call(crash, token, "GET", route)).status, 500);
  const [error] = (await listEvents(new URLSearchParams({ kind: "ERROR", userId: target.id }))).events;
  assert.equal(error.code, "Error");
  assert.equal(error.route, "/api/cash-flow/movements/:id");
  const stored = JSON.stringify(await owner.eventLog.findMany({ where: { userId: target.id } }));
  assert.ok(!stored.includes(target.email.split("@")[0]) && !stored.includes("12345"), "no message, email or amount is stored");

  for (let index = 0; index < 3; index++) {
    await recordEvent({ kind: "SECURITY", code: "login_limited", userId: target.id }, 15 * 60_000);
  }
  assert.equal(await owner.eventLog.count({ where: { userId: target.id, code: "login_limited" } }), 1);

  const old = await owner.eventLog.create({ data: { kind: "SECURITY", code: "old_event", createdAt: new Date(Date.now() - 31 * 86_400_000) } });
  await pruneEvents();
  assert.equal(await owner.eventLog.count({ where: { id: old.id } }), 0);

  const byEmail = await listEvents(new URLSearchParams({ email: target.email }));
  assert.ok(byEmail.events.length >= 2 && byEmail.events.every((event) => event.userEmail === target.email));
  await rejectsApi(listEvents(new URLSearchParams({ from: "2026-02-30x" })), 422, "validation");
});
