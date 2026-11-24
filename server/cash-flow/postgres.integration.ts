// Integration tests against a local, disposable PostgreSQL database with synthetic users only.
// Services run through DATABASE_URL (use the least-privilege runtime role to exercise the grants);
// users are provisioned through DATABASE_ADMIN_URL because the runtime role cannot create them.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest, NextResponse } from "next/server.js";
import sharp from "sharp";
import { PrismaClient } from "../../db/generated/client.ts";
import { encryptionKey, localPostgresUrl } from "../auth/config.ts";
import { digestRateLimitSubject, digestToken, hashPassword, newToken, verifyPassword } from "../auth/crypto.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { sessionCookie } from "../auth/http.ts";
import { getBudget, setLimit, clearOverride } from "./budget.ts";
import { updateCashReporting } from "./cash-settings.ts";
import {
  addStarterCategories, createAccount, createAccountType, createCategory, deleteAccountType, listAccounts, listAccountTypes, listCategories,
  updateAccount, updateAccountType, updateCategory,
} from "./catalog.ts";
import { getDashboard } from "./dashboard.ts";
import { findAccountLogo, readAccountLogo, removeAccountLogo } from "./account-logo-service.ts";
import { addDays, toDate } from "./dates.ts";
import { ApiError } from "./errors.ts";
import { api } from "./http.ts";
import {
  createMovement, createTransfer, getMovement, listMovements, listMovementsPage, pairMovements, transferCandidates,
  unpairTransfer, updateMovement,
  type MovementDto,
} from "./movements.ts";
import { createTemplate, deleteTemplate, listRecurring, occurrenceCandidates, resolveOccurrence, updateTemplate } from "./recurring.ts";
import { monthSummary } from "./reports.ts";
import { createRule, deleteRule, listRules, suggestForDescription } from "./rules.ts";
import { deleteCheck, getNetWorth, listChecks, listPensions, recordCheck } from "../net-worth/service.ts";
import { changeEmail, changePassword, getProfile, updateDisplayName } from "../profile/service.ts";

let admin: PrismaClient;

before(() => {
  const url = localPostgresUrl(process.env.DATABASE_URL);
  assert.equal(url.pathname, "/stead_auth_test", "Use the dedicated synthetic-test database.");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});

after(async () => {
  await admin.$disconnect();
  await disconnectDb();
});

async function newUser() {
  const user = await admin.user.create({
    data: { email: `m1-${randomUUID()}@example.test`, passwordHash: "synthetic-not-a-password-hash" },
    select: { id: true },
  });
  return user.id;
}

test("cash reporting setting excludes cash from reports and budgets without changing balances, and is reversible and user-scoped", async () => {
  const [user, other] = [await newUser(), await newUser()];
  const cash = await createAccount(user, { name: "Cash", type: "CASH" });
  const bank = await createAccount(user, { name: "Bank", type: "CHECKING" });
  const category = await createCategory(user, { name: "Food", kind: "EXPENSE" });
  await createMovement(user, { accountId: cash.id, bookingDate: "2026-11-05", description: "Cash income", amountCents: 5000 });
  await createMovement(user, { accountId: cash.id, bookingDate: "2026-11-06", description: "Cash expense", amountCents: -1200, categoryId: category.id });
  await createMovement(user, { accountId: bank.id, bookingDate: "2026-11-07", description: "Bank expense", amountCents: -800, categoryId: category.id });
  const original = await monthSummary(user, "2026-11");
  const worth = await getNetWorth(user, new Date("2026-11-24T12:00:00Z"));
  assert.deepEqual(original, { month: "2026-11", incomeCents: 5000, expenseCents: 2000, netCents: 3000 });
  assert.equal((await getBudget(user, "2026-11")).rows[0].spentCents, 2000);
  await updateCashReporting(user, { excludeCash: true });
  assert.deepEqual(await monthSummary(user, "2026-11"), { month: "2026-11", incomeCents: 0, expenseCents: 800, netCents: -800 });
  assert.equal((await getBudget(user, "2026-11")).rows[0].spentCents, 800);
  assert.deepEqual(await getNetWorth(user, new Date("2026-11-24T12:00:00Z")), worth);
  assert.equal((await db().user.findUniqueOrThrow({ where: { id: other }, select: { excludeCash: true } })).excludeCash, false);
  await updateCashReporting(user, { excludeCash: false });
  assert.deepEqual(await monthSummary(user, "2026-11"), original);
  await assert.rejects(updateCashReporting(user, { excludeCash: "true" }), { code: "validation" });
});

test("checking account logos are private, optional, encrypted and removable by the runtime role", async () => {
  const [owner, other] = [await newUser(), await newUser()];
  const checking = await createAccount(owner, { name: "Synthetic household", type: "CHECKING" });
  const cash = await createAccount(owner, { name: "Synthetic cash", type: "CASH" });
  const choose = { provider: "directa" };
  const key = { userId: owner, accountId: checking.id };

  await rejectsApi(findAccountLogo(owner, checking.id, { lookup: true }), 422, "logo_not_found");
  assert.equal((await listAccounts(owner)).find(({ id }) => id === checking.id)?.hasLogo, false);
  await rejectsApi(findAccountLogo(other, cash.id, choose), 404, "not_found");
  await findAccountLogo(owner, cash.id, choose);
  assert.equal((await listAccounts(owner)).find(({ id }) => id === cash.id)?.hasLogo, true, "every account type can carry a logo");
  const card = await createAccount(owner, { name: "Synthetic Amex Gold", type: "CARD" });
  await findAccountLogo(owner, card.id, { lookup: true });
  assert.equal((await listAccounts(owner)).find(({ id }) => id === card.id)?.hasLogo, true);
  await rejectsApi(findAccountLogo(other, checking.id, choose), 404, "not_found");
  await findAccountLogo(owner, checking.id, choose);
  const bytes = await readAccountLogo(owner, checking.id);
  assert.equal((await sharp(bytes).metadata()).format, "webp");
  const stored = await admin.accountLogo.findUniqueOrThrow({ where: { userId_accountId: key } });
  assert.notDeepEqual(Buffer.from(stored.image), bytes);
  assert.equal((await listAccounts(owner)).find(({ id }) => id === checking.id)?.hasLogo, true);
  await rejectsApi(readAccountLogo(other, checking.id), 404, "not_found");
  await rejectsApi(findAccountLogo(other, checking.id, { lookup: true }), 404, "not_found");
  await rejectsApi(removeAccountLogo(other, checking.id), 404, "not_found");
  await assert.rejects(admin.accountLogo.create({ data: { ...key, userId: other, image: stored.image } }), { code: "P2003" });
  await assert.rejects(db().$executeRaw`UPDATE stead_account_logos SET user_id = user_id WHERE account_id = ${checking.id}::uuid`, /permission denied/i);
  await findAccountLogo(owner, checking.id, choose);
  await removeAccountLogo(owner, checking.id);
  await rejectsApi(readAccountLogo(owner, checking.id), 404, "not_found");
});

test("brokerage logos can be matched by name and replaced with a catalog choice", async () => {
  const [owner, other] = [await newUser(), await newUser()];
  const broker = await createAccount(owner, { name: "Synthetic IBKR portfolio", type: "BROKERAGE" });
  await rejectsApi(findAccountLogo(other, broker.id, { provider: "directa" }), 404, "not_found");
  await rejectsApi(findAccountLogo(owner, broker.id, { provider: "invalid-provider" }), 422, "logo_not_found");
  await findAccountLogo(owner, broker.id, { lookup: true });
  const automatic = await readAccountLogo(owner, broker.id);
  assert.equal((await sharp(automatic).metadata()).format, "webp");
  assert.equal((await listAccounts(owner))[0].hasLogo, true);
  await findAccountLogo(owner, broker.id, { provider: "directa" });
  const selected = await readAccountLogo(owner, broker.id);
  assert.notDeepEqual(selected, automatic);
  await findAccountLogo(owner, broker.id, { lookup: true });
  assert.deepEqual(await readAccountLogo(owner, broker.id), selected);
  await removeAccountLogo(owner, broker.id);
  assert.equal((await listAccounts(owner))[0].hasLogo, false);
});

const profilePassword = "synthetic current password";
async function profileUser() {
  const id = await newUser();
  await admin.user.update({ where: { id }, data: { passwordHash: await hashPassword(profilePassword) } });
  return id;
}

async function profileSession(userId: string) {
  const token = newToken();
  await db().session.create({ data: { userId, tokenDigest: digestToken(token)!, expiresAt: new Date(Date.now() + 60_000) } });
  return token;
}

test("profile display names set, normalize, clear and enforce limits under column-only runtime grants", async () => {
  const [a, b] = [await newUser(), await newUser()];
  const beforeB = await getProfile(b);
  assert.equal((await updateDisplayName(a, "  Jose\u0301  ")).displayName, "Jos\u00e9");
  assert.equal((await getProfile(a)).displayName, "Jos\u00e9");
  assert.equal((await updateDisplayName(a, "\ud83d\ude00".repeat(60))).displayName, "\ud83d\ude00".repeat(60));
  await rejectsApi(updateDisplayName(a, "x".repeat(61)), 422, "validation");
  await rejectsApi(updateDisplayName(a, "a\nb"), 422, "validation");
  assert.equal((await updateDisplayName(a, "  ")).displayName, null);
  assert.deepEqual(await getProfile(b), beforeB);
  await assert.rejects(db().$executeRaw`UPDATE stead_users SET display_name = ' ' WHERE user_id = ${a}::uuid`, /check constraint|violates/i);
  await assert.rejects(db().$executeRaw`UPDATE stead_users SET display_name = repeat('x', 61) WHERE user_id = ${a}::uuid`, /too long|varying/i);
  await db().$executeRaw`UPDATE stead_users SET totp_secret = NULL, last_totp_step = NULL WHERE user_id = ${a}::uuid`;
  await assert.rejects(db().$executeRaw`UPDATE stead_users SET user_id = user_id WHERE user_id = ${a}::uuid`, /permission denied/i);
  const [rights] = await db().$queryRaw<{ can_insert: boolean; can_delete: boolean; can_update_table: boolean }[]>`
    SELECT has_table_privilege(current_user, 'stead_users', 'INSERT') AS can_insert,
      has_table_privilege(current_user, 'stead_users', 'DELETE') AS can_delete,
      has_table_privilege(current_user, 'stead_users', 'UPDATE') AS can_update_table
  `;
  assert.deepEqual(rights, { can_insert: false, can_delete: false, can_update_table: false });
});

test("profile email changes normalize, allow same-email success, and map duplicates to conflict without changing another user", async () => {
  const [a, b] = [await profileUser(), await newUser()];
  const beforeB = await getProfile(b);
  const email = `profile-${randomUUID()}@example.test`;
  await rejectsApi(changeEmail(a, { currentPassword: profilePassword, email: "invalid" }), 422, "validation");
  assert.deepEqual(await changeEmail(a, { currentPassword: profilePassword, email: ` ${email.toUpperCase()} ` }), { email });
  assert.deepEqual(await changeEmail(a, { currentPassword: profilePassword, email }), { email });
  await rejectsApi(changeEmail(a, { currentPassword: profilePassword, email: beforeB.email }), 409, "conflict");
  assert.equal((await getProfile(a)).email, email);
  assert.deepEqual(await getProfile(b), beforeB);
});

test("profile wrong passwords share the auth limiter across email and password changes and stop at five attempts", async () => {
  const a = await profileUser();
  const before = await getProfile(a);
  for (let index = 0; index < 5; index++) {
    const request = index % 2 === 0
      ? changeEmail(a, { currentPassword: "wrong password", email: "synthetic@example.test" })
      : changePassword(a, { currentPassword: "wrong password", newPassword: "synthetic replacement password" }, newToken());
    await rejectsApi(request, 403, "invalid");
  }
  const limit = await admin.authLimit.findUniqueOrThrow({
    where: { phase_subjectDigest: { phase: "password", subjectDigest: digestRateLimitSubject(encryptionKey(), a) } },
  });
  assert.equal(limit.attempts, 5);
  await rejectsApi(changeEmail(a, { currentPassword: profilePassword, email: before.email }), 429, "limited");
  await rejectsApi(changePassword(a, { currentPassword: profilePassword, newPassword: "synthetic replacement password" }, newToken()), 429, "limited");
  assert.deepEqual(await getProfile(a), before);
});

test("profile password change rejects reuse, keeps the active session, revokes other sessions and challenges, and isolates users", async () => {
  const [a, b] = [await profileUser(), await profileUser()];
  const beforeB = await admin.user.findUniqueOrThrow({ where: { id: b } });
  const keep = await profileSession(a);
  await profileSession(a);
  const other = await profileSession(b);
  for (const userId of [a, b]) await db().loginChallenge.create({
    data: { userId, tokenDigest: digestToken(newToken())!, expiresAt: new Date(Date.now() + 60_000) },
  });
  await rejectsApi(changePassword(a, { currentPassword: profilePassword, newPassword: profilePassword }, keep), 422, "same_password");
  await rejectsApi(changePassword(a, { currentPassword: profilePassword, newPassword: "short" }, keep), 422, "validation");
  await rejectsApi(changePassword(a, { currentPassword: profilePassword, newPassword: "synthetic replacement password" }, other), 401, "unauthenticated");
  assert.equal(await db().session.count({ where: { userId: a } }), 2);
  assert.equal(await db().loginChallenge.count({ where: { userId: a } }), 1);
  await changePassword(a, { currentPassword: profilePassword, newPassword: "synthetic replacement password" }, keep);
  const changed = await admin.user.findUniqueOrThrow({ where: { id: a } });
  assert.equal(await verifyPassword("synthetic replacement password", changed.passwordHash), true);
  assert.equal(await verifyPassword(profilePassword, changed.passwordHash), false);
  const sessions = await db().session.findMany({ where: { userId: a } });
  assert.equal(sessions.length, 1);
  assert.deepEqual(Buffer.from(sessions[0].tokenDigest), digestToken(keep));
  assert.equal(await db().loginChallenge.count({ where: { userId: a } }), 0);
  assert.deepEqual(await admin.user.findUniqueOrThrow({ where: { id: b } }), beforeB);
  assert.equal(await db().session.count({ where: { userId: b } }), 1);
  assert.equal(await db().loginChallenge.count({ where: { userId: b } }), 1);
});

test("profile concurrent password changes cannot both authorize with the old hash", async () => {
  const a = await profileUser();
  const tokens = [await profileSession(a), await profileSession(a)];
  const results = await Promise.allSettled(tokens.map((token) => changePassword(a, {
    currentPassword: profilePassword, newPassword: "synthetic concurrent password",
  }, token)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected")!;
  assert.ok(rejected.reason instanceof ApiError && rejected.reason.status === 403);
  assert.equal(await db().session.count({ where: { userId: a } }), 1);
});

test("profile API context preserves the cookie token, 512-byte passwords fit the wrapper, and password success is no-store 204", async () => {
  const a = await profileUser();
  const token = await profileSession(a);
  const handler = api(async ({ userId, sessionToken, body }) => changePassword(userId, await body(), sessionToken));
  const response = await handler(new NextRequest("http://127.0.0.1/api/profile/password", {
    method: "POST",
    headers: { origin: process.env.APP_ORIGIN!, cookie: `${sessionCookie}=${token}`, "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: profilePassword, newPassword: "\u0000".repeat(512) }),
  }), { params: Promise.resolve({}) });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
  const changed = await admin.user.findUniqueOrThrow({ where: { id: a } });
  assert.equal(await verifyPassword("\u0000".repeat(512), changed.passwordHash), true);
});

const account = (userId: string, name = "Synthetic checking", type = "CHECKING") => createAccount(userId, { name, type });
const category = (userId: string, name: string, kind = "EXPENSE") => createCategory(userId, { name, kind });
const movement = (userId: string, accountId: string, bookingDate: string, amountCents: number, extra: Record<string, unknown> = {}) =>
  createMovement(userId, { accountId, bookingDate, description: "Synthetic movement", amountCents, categoryId: null, ...extra });

async function rejectsApi(promise: Promise<unknown>, status: number, code?: string) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

/** Another user's row looks exactly like a missing one. */
async function rejectsMissing(promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => {
    const code = (error as { code?: string }).code;
    return (error instanceof ApiError && error.status === 404) || code === "P2025";
  });
}

test("unused accounts can be deleted only by their owner, including their logo", async () => {
  const { deleteAccount } = await import("./catalog.ts");
  assert.equal(typeof deleteAccount, "function", "The catalog must support account deletion");
  const [owner, other] = [await newUser(), await newUser()];
  const unused = await account(owner, "Synthetic Directa", "BROKERAGE");
  await findAccountLogo(owner, unused.id, { provider: "directa" });
  await updateAccount(owner, unused.id, { archived: true });

  await rejectsApi(deleteAccount(other, unused.id), 404, "not_found");
  assert.equal((await listAccounts(owner, true))[0]?.hasLogo, true);
  await deleteAccount(owner, unused.id);
  assert.deepEqual(await listAccounts(owner, true), []);
  assert.equal(await admin.accountLogo.count({ where: { userId: owner, accountId: unused.id } }), 0);
  await rejectsApi(deleteAccount(owner, unused.id), 404, "not_found");
});

test("unused categories are deleted with their rules and limits, and only by their owner; used ones are refused", async () => {
  const { deleteCategory } = await import("./catalog.ts");
  const [owner, other] = [await newUser(), await newUser()];
  const unused = await category(owner, "Synthetic unused");
  const used = await category(owner, "Synthetic used");
  await createRule(owner, { phrase: "synthetic phrase", categoryId: unused.id });
  await setLimit(owner, { categoryId: unused.id, limitCents: 5_000 }, new Date("2026-11-10T12:00:00Z"));
  const checking = await account(owner);
  await movement(owner, checking.id, "2026-11-03", -100, { categoryId: used.id });

  await rejectsApi(deleteCategory(other, unused.id), 404, "not_found");
  await rejectsApi(deleteCategory(owner, used.id), 409, "category_in_use");
  assert.equal((await listCategories(owner, true)).length, 2);
  await deleteCategory(owner, unused.id);
  assert.deepEqual((await listCategories(owner, true)).map((row) => row.id), [used.id]);
  assert.equal(await admin.categoryRule.count({ where: { userId: owner } }), 0);
  assert.equal(await admin.budgetLimit.count({ where: { userId: owner } }), 0);
  await rejectsApi(deleteCategory(owner, unused.id), 404, "not_found");
});

test("accounts with a movement or a balance check cannot be deleted", async () => {
  const { deleteAccount } = await import("./catalog.ts");
  assert.equal(typeof deleteAccount, "function", "The catalog must support account deletion");
  const owner = await newUser();
  const checking = await account(owner);
  const cash = await account(owner, "Synthetic cash", "CASH");
  const booked = await movement(owner, checking.id, "2026-11-03", -100);
  const { check } = await recordCheck(
    owner, { accountId: cash.id, asOf: "2026-11-03", balanceCents: 100 }, new Date("2026-11-04T00:00:00Z"),
  );

  await rejectsApi(deleteAccount(owner, checking.id), 409, "account_in_use");
  await rejectsApi(deleteAccount(owner, cash.id), 409, "account_in_use");
  assert.equal((await getMovement(owner, booked.id)).accountId, checking.id);
  assert.equal((await listChecks(owner))[0]?.id, check.id);
});

test("an account created with an opening balance starts at that balance without a movement", async () => {
  const user = await newUser();
  const now = new Date("2026-11-19T10:00:00Z");
  const checking = await createAccount(user, { name: "Synthetic opening", type: "CHECKING", openingBalanceCents: 125_000 }, now);
  const card = await createAccount(user, { name: "Synthetic opening card", type: "CARD", openingBalanceCents: -4_000 }, now);
  const plain = await createAccount(user, { name: "Synthetic no balance", type: "CASH" }, now);
  const checks = await listChecks(user);
  assert.deepEqual(checks.map(({ accountId, asOf, balanceCents }) => [accountId, asOf, balanceCents]).sort(),
    [[checking.id, "2026-11-18", 125_000], [card.id, "2026-11-18", -4_000]].sort());
  assert.equal(await db().movement.count({ where: { userId: user } }), 0);
  assert.equal(checks.some(({ accountId }) => accountId === plain.id), false);
  await rejectsApi(createAccount(user, { name: "Synthetic bad", type: "CASH", openingBalanceCents: 1.5 }, now), 422, "validation");
  assert.equal((await listAccounts(user)).some(({ name }) => name === "Synthetic bad"), false);
});

test("custom account types: create, rename, archive, delete only while unused, and only by their owner", async () => {
  const [owner, other] = [await newUser(), await newUser()];
  const savings = await createAccountType(owner, { name: "Synthetic savings", baseType: "CHECKING" });
  assert.deepEqual({ ...savings, id: undefined }, { id: undefined, name: "Synthetic savings", baseType: "CHECKING", archived: false });
  await rejectsApi(createAccountType(owner, { name: "Synthetic bad base", baseType: "MORTGAGE" }), 422, "validation");
  await rejectsApi(updateAccountType(owner, savings.id, { baseType: "CASH" }), 422, "validation");
  await assert.rejects(createAccountType(owner, { name: "Synthetic savings", baseType: "CASH" }), (error) => (error as { code?: string }).code === "P2002");
  await createAccountType(other, { name: "Synthetic savings", baseType: "CASH" });

  assert.equal((await updateAccountType(owner, savings.id, { name: "Synthetic deposit" })).name, "Synthetic deposit");
  await rejectsMissing(updateAccountType(other, savings.id, { name: "Intrusion" }));
  await rejectsApi(deleteAccountType(other, savings.id), 404, "not_found");
  assert.deepEqual((await listAccountTypes(other)).map(({ name }) => name), ["Synthetic savings"]);

  const used = await createAccount(owner, { name: "Synthetic deposit account", customTypeId: savings.id });
  assert.deepEqual([used.type, used.customTypeId], ["CHECKING", savings.id]);
  await rejectsApi(deleteAccountType(owner, savings.id), 409, "account_type_in_use");

  await updateAccountType(owner, savings.id, { archived: true });
  await rejectsApi(createAccount(owner, { name: "Synthetic late", customTypeId: savings.id }), 409, "account_type_archived");
  assert.equal((await updateAccount(owner, used.id, { name: "Synthetic kept", customTypeId: savings.id })).customTypeId, savings.id,
    "an account may keep the archived type it already carries");
  await updateAccount(owner, used.id, { type: "CHECKING" });
  await deleteAccountType(owner, savings.id);
  assert.equal((await listAccountTypes(owner)).length, 0);
});

test("account type changes keep balances and history, stay in the owner's types, and keep base kinds consistent", async () => {
  const [owner, other] = [await newUser(), await newUser()];
  const now = new Date("2026-11-19T10:00:00Z");
  const mine = await createAccountType(owner, { name: "Synthetic wallet", baseType: "CASH" });
  const theirs = await createAccountType(other, { name: "Synthetic foreign", baseType: "CASH" });
  const checking = await createAccount(owner, { name: "Synthetic retyped", type: "CHECKING", openingBalanceCents: 50_000 }, now);
  await movement(owner, checking.id, "2026-11-19", -1_000);
  const before = (await getNetWorth(owner, now)).perAccount.find(({ id }) => id === checking.id)!;

  await rejectsApi(createAccount(owner, { name: "Synthetic both", type: "CASH", customTypeId: mine.id }), 422, "validation");
  await rejectsApi(createAccount(owner, { name: "Synthetic none" }), 422, "validation");
  await rejectsApi(createAccount(owner, { name: "Synthetic foreign type", customTypeId: theirs.id }), 422, "validation");
  await rejectsApi(updateAccount(owner, checking.id, { customTypeId: theirs.id }), 422, "validation");
  await rejectsApi(updateAccount(other, checking.id, { customTypeId: theirs.id }), 404, "not_found");

  const retyped = await updateAccount(owner, checking.id, { customTypeId: mine.id });
  assert.deepEqual([retyped.type, retyped.customTypeId], ["CASH", mine.id], "the base kind follows the custom type");
  const after = (await getNetWorth(owner, now)).perAccount.find(({ id }) => id === checking.id)!;
  assert.equal(after.balanceCents, before.balanceCents);
  assert.equal(after.lastCheckDate, before.lastCheckDate);
  assert.equal(after.customTypeName, "Synthetic wallet");
  assert.equal(await db().movement.count({ where: { userId: owner, accountId: checking.id } }), 1);
  // The base is immutable: no UPDATE grant for the runtime role, and ON UPDATE RESTRICT while an account uses the type.
  await assert.rejects(db().$executeRaw`UPDATE stead_custom_account_types SET base_type = 'DEBT' WHERE type_id = ${mine.id}::uuid`, /permission denied|foreign key/i);

  const back = await updateAccount(owner, checking.id, { type: "PENSION" });
  assert.deepEqual([back.type, back.customTypeId], ["PENSION", null], "a built-in type clears the custom label");

  // The three-column key refuses a custom label on the wrong base or of another user, even without the service.
  await assert.rejects(db().$executeRaw`UPDATE stead_accounts SET custom_type_id = ${mine.id}::uuid WHERE account_id = ${checking.id}::uuid`, /foreign key/i);
  await assert.rejects(db().$executeRaw`UPDATE stead_accounts SET type = 'CASH', custom_type_id = ${theirs.id}::uuid WHERE account_id = ${checking.id}::uuid`, /foreign key/i);
});

test("pension accounts are tracked by balance checks and listed with their balance and last check", async () => {
  const user = await newUser();
  const now = new Date("2026-11-19T10:00:00Z");
  const pension = await createAccount(user, { name: "Synthetic pension", type: "PENSION" });
  await createAccount(user, { name: "Synthetic checking for pension", type: "CHECKING", openingBalanceCents: 10_000 }, now);
  await recordCheck(user, { accountId: pension.id, asOf: "2026-06-30", balanceCents: 1_200_000 }, now);
  await recordCheck(user, { accountId: pension.id, asOf: "2026-09-30", balanceCents: 1_350_000 }, now);
  const [listed] = await listPensions(user, now);
  assert.deepEqual({ ...listed }, { id: pension.id, name: "Synthetic pension", type: "PENSION", customTypeName: null, archived: false, balanceCents: 1_350_000, lastCheckDate: "2026-09-30" });
  const worth = await getNetWorth(user, now);
  assert.equal(worth.assetsCents, 1_360_000, "the pension counts once, next to the checking balance");
  assert.equal(worth.holdingsCents, 0);
  assert.deepEqual(await listPensions(await newUser(), now), []);
});

test("balance checks upsert and delete under the runtime role, with user isolation and database constraints", async () => {
  const [a, b] = [await newUser(), await newUser()];
  const checking = await account(a);
  const other = await account(b);
  const now = new Date("2026-11-19T10:00:00Z");
  const input = { accountId: checking.id, asOf: "2026-11-18", balanceCents: 10_000 };
  const first = await recordCheck(a, input, now);
  const updated = await recordCheck(a, { ...input, balanceCents: -20_000 }, now);
  assert.equal(first.created, true);
  assert.equal(updated.created, false);
  assert.equal(updated.check.id, first.check.id, "same account and date replaces the existing check");
  assert.equal((await listChecks(a)).length, 1);
  assert.equal((await listChecks(a))[0].balanceCents, -20_000);
  assert.deepEqual(await listChecks(b), []);
  const empty = await getNetWorth(b, now);
  assert.deepEqual([empty.assetsCents, empty.liabilitiesCents, empty.netCents], [0, 0, 0]);
  assert.ok(empty.series.every((point) => point.netCents === 0));
  await rejectsApi(recordCheck(b, input, now), 409, "conflict");
  await rejectsMissing(deleteCheck(b, first.check.id));
  assert.equal((await listChecks(a)).length, 1);

  const insert = (userId: string, accountId: string, cents: number) => db().$executeRaw`
    INSERT INTO stead_balance_checks (check_id, user_id, account_id, as_of, balance_cents)
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${accountId}::uuid, DATE '2026-11-01', ${cents})
  `;
  await assert.rejects(insert(b, checking.id, 0), /foreign key|violates/i);
  await assert.rejects(insert(b, other.id, 1_000_000_001), /check constraint|violates/i);
  await assert.rejects(insert(b, other.id, -1_000_000_001), /check constraint|violates/i);
  const role = await db().$queryRaw<{ can_rekey: boolean }[]>`
    SELECT has_column_privilege(current_user, 'stead_balance_checks', 'account_id', 'UPDATE') AS can_rekey
  `;
  assert.equal(role[0].can_rekey, false, "runtime cannot change a check's ownership or account");
  await deleteCheck(a, first.check.id);
  assert.deepEqual(await listChecks(a), []);
  await recordCheck(a, { ...input, balanceCents: 0 }, now);
  assert.equal((await listChecks(a))[0].balanceCents, 0);
});

test("concurrent balance checks report exactly one creation for the same account and date", async () => {
  const user = await newUser();
  const checking = await account(user);
  const input = { accountId: checking.id, asOf: "2026-11-18", balanceCents: 100 };
  const results = await Promise.all(Array.from({ length: 4 }, () => recordCheck(user, input, new Date("2026-11-19T10:00:00Z"))));
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(new Set(results.map((result) => result.check.id)).size, 1);
  assert.equal((await listChecks(user)).length, 1);
});

test("balance check history is limited to the newest 100 checks in date and id order", async () => {
  const [user, otherUser] = [await newUser(), await newUser()];
  const checking = await account(user);
  const second = await account(user, "Synthetic savings");
  const other = await account(otherUser);
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: randomUUID(), userId: user, accountId: checking.id,
    asOf: toDate(addDays("2026-01-01", index)), balanceCents: index,
  }));
  rows.push({ id: randomUUID(), userId: user, accountId: second.id, asOf: rows.at(-1)!.asOf, balanceCents: 0 });
  await db().balanceCheck.createMany({ data: rows });
  await recordCheck(otherUser, { accountId: other.id, asOf: "2026-11-18", balanceCents: 0 }, new Date("2026-11-19T10:00:00Z"));
  const listed = await listChecks(user);
  const expected = [...rows].sort((a, b) => b.asOf.getTime() - a.asOf.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, 100);
  assert.equal(listed.length, 100);
  assert.deepEqual(listed.map((row) => row.id), expected.map((row) => row.id));
});

test("net worth recalculates history from checks and movements, including archived balances and transfers", async () => {
  const user = await newUser();
  const checking = await account(user);
  const card = await account(user, "Synthetic card", "CARD");
  const now = new Date("2026-11-19T10:00:00Z");
  const { check } = await recordCheck(user, { accountId: checking.id, asOf: "2026-09-30", balanceCents: 10_000 }, now);
  await movement(user, checking.id, "2026-09-30", 99_999);
  const expense = await movement(user, checking.id, "2026-10-31", -1_000);
  const voided = await movement(user, checking.id, "2026-11-01", -2_000);
  await updateMovement(user, voided.id, { voided: true });
  await movement(user, checking.id, "2026-11-20", 99_999);
  await createTransfer(user, { fromAccountId: checking.id, toAccountId: card.id, amountCents: 500, bookingDate: "2026-11-03", description: "Synthetic transfer" });
  await recordCheck(user, { accountId: card.id, asOf: "2026-11-01", balanceCents: -3_000 }, now);
  await updateAccount(user, card.id, { archived: true });

  let data = await getNetWorth(user, now);
  assert.deepEqual([data.assetsCents, data.liabilitiesCents, data.netCents, data.changeCents], [8_500, 2_500, 6_000, -3_000]);
  assert.equal(data.series.length, 12);
  assert.equal(data.series.at(-2)?.netCents, 9_000);
  assert.equal(data.trend, undefined, "the dashboard and API skip the period chart");
  const { trend } = await getNetWorth(user, now, { trend: true });
  assert.ok(trend && Object.values(trend).every((points) => points.at(-1)?.valueCents === data.netCents));
  assert.equal(trend["1M"].at(-1)!.gainCents - trend["1M"][0].gainCents, data.netCents - trend["1M"][0].valueCents);
  const archived = data.perAccount.find((row) => row.id === card.id)!;
  assert.deepEqual([archived.archived, archived.balanceCents, archived.lastCheckDate], [true, -2_500, "2026-11-01"]);
  assert.equal((await getDashboard(user, now)).netWorthCents, data.netCents);
  await updateMovement(user, expense.id, { amountCents: -2_000 });
  data = await getNetWorth(user, now);
  assert.equal(data.series.at(-2)?.netCents, 8_000, "editing an old movement fixes historical month ends");
  await recordCheck(user, { accountId: checking.id, asOf: check.asOf, balanceCents: 20_000 }, now);
  assert.equal((await getNetWorth(user, now)).series.at(-2)?.netCents, 18_000);
  await recordCheck(user, { accountId: checking.id, asOf: "2026-11-18", balanceCents: 0 }, now);
  assert.equal((await getNetWorth(user, now)).netCents, -2_500);
  await deleteCheck(user, check.id);
  assert.equal((await getNetWorth(user, now)).series.at(-2)?.netCents, 97_999, "deleting a check also recomputes history");
  await updateAccount(user, checking.id, { archived: true });
  const dashboard = await getDashboard(user, now);
  assert.equal(dashboard.hasAccounts, false);
  assert.equal(dashboard.showNetWorth, true, "archived accounts with balances keep the net worth card visible");
});

test("balance validation uses Rome today, permits signed zero, and rejects extra or invalid fields", async () => {
  const user = await newUser();
  const checking = await account(user);
  const now = new Date("2026-11-18T23:30:00Z"); // Already 19 November in Rome.
  const input = { accountId: checking.id, asOf: "2026-11-19", balanceCents: 0 };
  assert.equal((await recordCheck(user, input, now)).check.asOf, "2026-11-19");
  assert.equal((await getNetWorth(user, now)).today, "2026-11-19");
  for (const extra of [
    { asOf: "2026-11-20" }, { asOf: "2026-02-30" }, { asOf: "1999-12-31" },
    { balanceCents: 0.1 }, { balanceCents: "0" }, { balanceCents: 1_000_000_001 },
    { accountId: "invalid" }, { userId: user },
  ]) await rejectsApi(recordCheck(user, { ...input, ...extra }, now), 422, "validation");
});

test("every read and write is scoped to the authenticated user", async () => {
  const [a, b] = [await newUser(), await newUser()];
  const checking = await account(a);
  const savings = await account(a, "Synthetic savings", "CASH");
  const food = await category(a, "Food");
  const pay = await category(a, "Pay", "INCOME");
  const first = await movement(a, checking.id, "2026-11-03", -4_200, { categoryId: food.id });
  const out = await movement(a, checking.id, "2026-11-04", -10_000);
  const into = await movement(a, savings.id, "2026-11-04", 10_000);
  const transfer = await pairMovements(a, { movementIds: [out.id, into.id] });
  const rule = await createRule(a, { phrase: "synthetic market", categoryId: food.id });
  const template = await createTemplate(a, { accountId: checking.id, description: "Synthetic gym", amountCents: 3_000, frequency: "MONTHLY", startDate: "2026-10-05" });
  await setLimit(a, { categoryId: food.id, limitCents: 20_000 }, new Date("2026-11-10T12:00:00Z"));

  // B sees nothing of A's data in any listing.
  assert.deepEqual(await listAccounts(b, true), []);
  assert.deepEqual(await listCategories(b, true), []);
  assert.deepEqual(await listMovements(b, new URLSearchParams()), []);
  assert.deepEqual(await listRules(b), []);
  assert.deepEqual((await listRecurring(b, new URLSearchParams(), new Date("2026-11-20T12:00:00Z"))).templates, []);
  assert.deepEqual(await monthSummary(b, "2026-11"), { month: "2026-11", incomeCents: 0, expenseCents: 0, netCents: 0 });
  assert.deepEqual((await getBudget(b, "2026-11")).rows, []);
  const empty = await getDashboard(b, new Date("2026-11-20T12:00:00Z"));
  assert.equal(empty.hasAccounts, false);
  assert.equal(empty.showNetWorth, false);
  assert.equal(empty.latest.length, 0);

  // B cannot read or change A's rows by id.
  await rejectsMissing(getMovement(b, first.id));
  await rejectsMissing(updateMovement(b, first.id, { description: "hijack" }));
  await rejectsMissing(updateMovement(b, first.id, { voided: true }));
  await rejectsMissing(updateAccount(b, checking.id, { name: "hijack" }));
  await rejectsMissing(updateCategory(b, food.id, { name: "hijack" }));
  await rejectsMissing(updateTemplate(b, template.id, { description: "hijack" }));
  await rejectsMissing(deleteRule(b, rule.id));
  await rejectsMissing(unpairTransfer(b, transfer.id));
  await rejectsMissing(pairMovements(b, { movementIds: [first.id, out.id] }));
  await rejectsMissing(occurrenceCandidates(b, new URLSearchParams({ templateId: template.id, dueDate: "2026-11-05" })));
  await rejectsMissing(resolveOccurrence(b, { action: "skip", templateId: template.id, dueDate: "2026-11-05" }, new Date("2026-11-20T12:00:00Z")));

  // B cannot attach its own rows to A's account, category or movement.
  const mine = await account(b, "Synthetic checking");
  await rejectsApi(movement(b, checking.id, "2026-11-03", -100), 422, "validation");
  await rejectsApi(movement(b, mine.id, "2026-11-03", -100, { categoryId: food.id }), 422, "validation");
  await rejectsApi(createRule(b, { phrase: "x", categoryId: food.id }), 422, "validation");
  await rejectsApi(createTemplate(b, { accountId: checking.id, description: "x", amountCents: 100, frequency: "WEEKLY", startDate: "2026-11-01" }), 422, "validation");
  await rejectsApi(setLimit(b, { categoryId: food.id, limitCents: 100 }, new Date("2026-11-10T12:00:00Z")), 422, "validation");
  const bOwn = await movement(b, mine.id, "2026-11-03", -100);
  await rejectsApi(updateMovement(b, bOwn.id, { categoryId: pay.id }), 422, "validation");
  await rejectsApi(updateMovement(b, bOwn.id, { accountId: checking.id }), 422, "validation");

  // Names are unique per user, not globally.
  assert.equal((await account(b, "Synthetic savings")).name, "Synthetic savings");

  // A still has everything, untouched.
  assert.equal((await getMovement(a, first.id)).description, "Synthetic movement");
  assert.equal((await listMovements(a, new URLSearchParams())).length, 3);
});

test("the database refuses cross-user links and invalid rows even without the service checks", async () => {
  const [a, b] = [await newUser(), await newUser()];
  const accountA = await account(a);
  const accountB = await account(b);
  const blob = Buffer.alloc(40, 1);
  const insert = (userId: string, accountId: string, cents: number) => db().$executeRaw`
    INSERT INTO stead_movements (movement_id, user_id, account_id, booking_date, description_enc, amount_cents)
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${accountId}::uuid, DATE '2026-11-01', ${blob}, ${cents})
  `;

  await assert.rejects(insert(b, accountA.id, -100), /foreign key|violates/i, "B movement on A account");
  await assert.rejects(insert(b, accountB.id, 0), /check constraint|violates/i, "zero amount");
  await insert(b, accountB.id, -100);

  // Same-user links are enforced for every child table, not only movements.
  const categoryA = await category(a, "Food");
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_category_rules (rule_id, user_id, phrase, category_id)
    VALUES (${randomUUID()}::uuid, ${b}::uuid, 'x', ${categoryA.id}::uuid)
  `, /foreign key|violates/i);
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_budget_limits (limit_id, user_id, category_id, month, kind, limit_cents)
    VALUES (${randomUUID()}::uuid, ${b}::uuid, ${categoryA.id}::uuid, DATE '2026-11-01', 'BASE', 100)
  `, /foreign key|violates/i);

  // A transfer leg must carry the matching sign.
  const transfer = await admin.transfer.create({ data: { userId: b }, select: { id: true } });
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_movements (movement_id, user_id, account_id, booking_date, description_enc, amount_cents, transfer_id, transfer_leg)
    VALUES (${randomUUID()}::uuid, ${b}::uuid, ${accountB.id}::uuid, DATE '2026-11-01', ${blob}, 500, ${transfer.id}::uuid, 'OUT')
  `, /check constraint|violates/i);

  // A paired row must name its leg. With a NULL leg the sign test is SQL UNKNOWN, which a CHECK would
  // accept, so this pins the explicit NOT NULL requirement, on insert and on update.
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_movements (movement_id, user_id, account_id, booking_date, description_enc, amount_cents, transfer_id)
    VALUES (${randomUUID()}::uuid, ${b}::uuid, ${accountB.id}::uuid, DATE '2026-11-01', ${blob}, 500, ${transfer.id}::uuid)
  `, /check constraint|violates/i, "transfer_id without transfer_leg");
  await assert.rejects(db().$executeRaw`
    INSERT INTO stead_movements (movement_id, user_id, account_id, booking_date, description_enc, amount_cents, transfer_leg)
    VALUES (${randomUUID()}::uuid, ${b}::uuid, ${accountB.id}::uuid, DATE '2026-11-01', ${blob}, 500, 'IN')
  `, /check constraint|violates/i, "transfer_leg without transfer_id");
  const free = await movement(b, accountB.id, "2026-11-02", 700);
  await assert.rejects(
    db().$executeRaw`UPDATE stead_movements SET transfer_id = ${transfer.id}::uuid WHERE movement_id = ${free.id}::uuid`,
    /check constraint|violates/i,
    "pairing by setting only transfer_id",
  );
  await db().$executeRaw`
    UPDATE stead_movements SET transfer_id = ${transfer.id}::uuid, transfer_leg = 'IN' WHERE movement_id = ${free.id}::uuid
  `;
});

test("the runtime role has no DELETE on history tables and cannot rewrite ownership", async (t) => {
  const [{ owner }] = await db().$queryRaw<{ owner: boolean }[]>`
    SELECT has_table_privilege(current_user, 'stead_movements', 'DELETE') AS owner
  `;
  if (owner) {
    t.skip("DATABASE_URL is a privileged role; point it at the runtime role to check the grants");
    return;
  }
  const rejected = /permission denied/i;
  await assert.rejects(db().$executeRaw`DELETE FROM stead_movements`, rejected);
  // Accounts are DELETE-able only while unreferenced: the RESTRICT foreign keys refuse the rest (see the deletion tests).
  await assert.rejects(db().$executeRaw`TRUNCATE stead_movements`, rejected);
  await assert.rejects(db().$executeRaw`UPDATE stead_movements SET user_id = user_id`, rejected);
  await assert.rejects(db().$executeRaw`UPDATE stead_accounts SET user_id = user_id`, rejected);
});

test("descriptions are encrypted at rest, bound to their row, and never need plaintext columns", async () => {
  const user = await newUser();
  const checking = await account(user);
  const secret = "Synthetic landlord Rossi payment";
  const first = await movement(user, checking.id, "2026-11-01", -50_000, { description: secret });
  const second = await movement(user, checking.id, "2026-11-02", -1_000, { description: "other text" });

  const [row] = await db().$queryRaw<{ description_enc: Uint8Array }[]>`
    SELECT description_enc FROM stead_movements WHERE movement_id = ${first.id}::uuid
  `;
  const stored = Buffer.from(row.description_enc);
  assert.ok(!stored.toString("latin1").includes("landlord"));
  assert.ok(!stored.toString("utf8").includes("Rossi"));
  assert.equal((await getMovement(user, first.id)).description, secret);

  // Moving the ciphertext to another row breaks authentication instead of leaking text.
  await db().$executeRaw`UPDATE stead_movements SET description_enc = ${stored} WHERE movement_id = ${second.id}::uuid`;
  await assert.rejects(getMovement(user, second.id));
});

test("register directions partition history by category, isolate users, and keep refunds in expenses", async () => {
  const user = await newUser();
  const stranger = await newUser();
  const checking = await account(user);
  const savings = await account(user, "Synthetic savings");
  const other = await account(stranger);
  const income = await category(user, "Synthetic income", "INCOME");
  const expense = await category(user, "Synthetic expense");
  const salary = await movement(user, checking.id, "2026-11-01", 100_000, { categoryId: income.id });
  const reversal = await movement(user, checking.id, "2026-11-02", -1_000, { categoryId: income.id });
  const purchase = await movement(user, checking.id, "2026-11-03", -5_000, { categoryId: expense.id });
  const refund = await movement(user, checking.id, "2026-11-04", 2_000, { categoryId: expense.id });
  const positive = await movement(user, checking.id, "2026-11-05", 3_000);
  const negative = await movement(user, checking.id, "2026-11-06", -4_000);
  const voided = await movement(user, checking.id, "2026-11-07", -9_000);
  await updateMovement(user, voided.id, { voided: true });
  await createTransfer(user, {
    fromAccountId: checking.id, toAccountId: savings.id, amountCents: 6_000,
    bookingDate: "2026-11-08", description: "Synthetic transfer",
  });
  const foreign = await movement(stranger, other.id, "2026-11-01", 7_000);
  await movement(user, checking.id, "2026-10-31", 8_000);
  const query = (direction?: string) => new URLSearchParams({ month: "2026-11", ...(direction === undefined ? {} : { direction }) });
  const full = await listMovementsPage(user, query());
  const incoming = await listMovementsPage(user, query("in"));
  const outgoing = await listMovementsPage(user, query("out"));
  const transfers = await listMovementsPage(user, query("transfers"));
  const ids = (rows: MovementDto[]) => rows.map((row) => row.id).sort();
  assert.deepEqual(ids(incoming.movements), [salary.id, reversal.id, positive.id].sort());
  assert.deepEqual(ids(outgoing.movements), [purchase.id, refund.id, negative.id, voided.id].sort());
  assert.equal(transfers.movements.length, 2);
  assert.ok(transfers.movements.every((row) => row.transferId !== null));
  const combined = [...incoming.movements, ...outgoing.movements, ...transfers.movements];
  assert.equal(new Set(ids(combined)).size, combined.length, "directions never overlap");
  assert.deepEqual(ids(combined), ids(full.movements), "directions cover the entire register, including voided rows");
  assert.ok(!combined.some((row) => row.id === foreign.id));
  const totals = await monthSummary(user, "2026-11");
  const sum = (rows: MovementDto[]) => rows.filter((row) => !row.voided).reduce((total, row) => total + row.amountCents, 0);
  assert.equal(sum(incoming.movements), totals.incomeCents);
  assert.equal(-sum(outgoing.movements), totals.expenseCents);
  const filtered = await listMovementsPage(user, new URLSearchParams({ ...Object.fromEntries(query("out")), categoryId: expense.id, accountId: checking.id }));
  assert.deepEqual(ids(filtered.movements), [purchase.id, refund.id].sort());
  for (const direction of ["invalid", "", "IN", "toString"]) {
    await assert.rejects(listMovementsPage(user, query(direction)), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 422);
      assert.equal(error.field, "direction");
      return true;
    });
  }
});

test("registering, editing and voiding movements, with listing by month, account and category", async () => {
  const user = await newUser();
  const checking = await account(user);
  const card = await account(user, "Synthetic card", "CARD");
  const food = await category(user, "Food");
  const salary = await category(user, "Salary", "INCOME");
  const m1 = await movement(user, checking.id, "2026-10-31", -2_000, { categoryId: food.id });
  const m2 = await movement(user, checking.id, "2026-11-01", 200_000, { categoryId: salary.id });
  const m3 = await movement(user, card.id, "2026-11-05", -1_050, { categoryId: food.id });

  const list = (query: Record<string, string>) => listMovements(user, new URLSearchParams(query)).then((rows) => rows.map((row) => row.id));
  assert.deepEqual(await list({ month: "2026-11" }), [m3.id, m2.id]);
  assert.deepEqual(await list({ month: "2026-10" }), [m1.id]);
  assert.deepEqual(await list({ month: "2026-11", accountId: card.id }), [m3.id]);
  assert.deepEqual(await list({ categoryId: food.id }), [m3.id, m1.id]);
  assert.deepEqual(await list({ month: "2026-11", categoryId: salary.id, accountId: checking.id }), [m2.id]);

  const edited = await updateMovement(user, m3.id, { description: "Synthetic edited", amountCents: -1_250, bookingDate: "2026-11-06", categoryId: null });
  assert.deepEqual(
    [edited.description, edited.amountCents, edited.bookingDate, edited.categoryId],
    ["Synthetic edited", -1_250, "2026-11-06", null],
  );

  assert.equal((await monthSummary(user, "2026-11")).expenseCents, 1_250);
  const voided = await updateMovement(user, m3.id, { voided: true });
  assert.equal(voided.voided, true);
  assert.equal((await monthSummary(user, "2026-11")).expenseCents, 0, "a voided movement leaves every total");
  assert.equal((await list({ month: "2026-11" })).includes(m3.id), true, "but stays in the register");
  await rejectsApi(updateMovement(user, m3.id, { description: "no edits while voided" }), 409, "voided");
  assert.equal((await updateMovement(user, m3.id, { voided: false })).voided, false);
  assert.equal((await monthSummary(user, "2026-11")).expenseCents, 1_250, "restoring is fully reversible");

  // Input discipline: amounts are integer cents, dates are real, unknown fields are rejected.
  for (const amountCents of [1.5, "10", 0, 1_000_000_001, Number.NaN]) {
    await rejectsApi(movement(user, checking.id, "2026-11-01", amountCents as number), 422, "validation");
  }
  await rejectsApi(movement(user, checking.id, "2026-02-30", -100), 422, "validation");
  await rejectsApi(createMovement(user, { accountId: checking.id, bookingDate: "2026-11-01", description: "x", amountCents: -1, userId: randomUUID() }), 422, "validation");
  await rejectsApi(movement(user, checking.id, "2026-11-01", -100, { description: "  " }), 422, "validation");
});

test("archiving accounts and categories keeps history and blocks new use", async () => {
  const user = await newUser();
  const checking = await account(user);
  const spare = await account(user, "Synthetic spare");
  const food = await category(user, "Food");
  const old = await movement(user, checking.id, "2026-11-02", -3_000, { categoryId: food.id });

  await updateAccount(user, checking.id, { archived: true });
  await updateCategory(user, food.id, { archived: true });
  assert.deepEqual((await listAccounts(user)).map((item) => item.id), [spare.id]);
  assert.equal((await listAccounts(user, true)).length, 2);
  assert.equal((await listCategories(user)).length, 0);

  const kept = await getMovement(user, old.id);
  assert.equal(kept.accountId, checking.id);
  assert.equal(kept.categoryId, food.id);
  assert.equal((await updateMovement(user, old.id, { description: "Synthetic touched up" })).accountId, checking.id);
  await rejectsApi(movement(user, checking.id, "2026-11-03", -1), 409, "archived");
  await rejectsApi(movement(user, spare.id, "2026-11-03", -1, { categoryId: food.id }), 409, "archived");
  const retired = await account(user, "Synthetic retired");
  await updateAccount(user, retired.id, { archived: true });
  await rejectsApi(updateMovement(user, old.id, { accountId: retired.id }), 409, "archived");

  // The archived category still explains the month's spending in the budget view.
  const row = (await getBudget(user, "2026-11")).rows.find((item) => item.categoryId === food.id);
  assert.equal(row?.spentCents, 3_000);
  assert.equal(row?.archived, true);
  await updateAccount(user, checking.id, { archived: false });
  assert.equal((await listAccounts(user)).length, 2);
});

test("category rules: explicit choice wins, then the longest phrase, with a stable tie-break", async () => {
  const user = await newUser();
  const checking = await account(user);
  const food = await category(user, "Food");
  const health = await category(user, "Health");
  const fun = await category(user, "Fun");
  const old = await category(user, "Retired");

  const byDescription = async (description: string, extra: Record<string, unknown> = {}) =>
    (await createMovement(user, { accountId: checking.id, bookingDate: "2026-11-02", description, amountCents: -500, ...extra })).categoryId;

  await createRule(user, { phrase: "Coop", categoryId: food.id });
  await createRule(user, { phrase: "coop pharmacy", categoryId: health.id });
  assert.equal(await byDescription("COOP Pharmacy via Roma"), health.id, "longest phrase wins");
  assert.equal(await byDescription("Coop checkout"), food.id);
  assert.equal(await byDescription("Cooperative bank"), null, "whole words only");

  assert.equal(await byDescription("COOP Pharmacy", { categoryId: fun.id }), fun.id, "explicit category beats every rule");
  assert.equal(await byDescription("COOP Pharmacy", { categoryId: null }), null, "explicit no-category beats every rule");
  assert.deepEqual((await suggestForDescription(user, { description: "coop pharmacy" })).categoryId, health.id);

  // Remembering a phrase while assigning a category; then it suggests for later movements.
  assert.equal(await byDescription("Dinner at Trattoria Sole", { categoryId: fun.id, rememberPhrase: "Trattoria  Sole" }), fun.id);
  assert.equal(await byDescription("trattoria sole again"), fun.id);
  assert.equal((await listRules(user)).filter((rule) => rule.phrase === "trattoria sole").length, 1);
  await rejectsApi(createMovement(user, { accountId: checking.id, bookingDate: "2026-11-02", description: "x", amountCents: -1, categoryId: null, rememberPhrase: "x" }), 422, "validation");

  // Equal-length matches choose the alphabetically first phrase, whatever the insertion order.
  await createRule(user, { phrase: "zeta gym", categoryId: health.id });
  await createRule(user, { phrase: "alfa bar", categoryId: food.id });
  assert.equal(await byDescription("zeta gym and alfa bar"), food.id);

  // Re-pointing a phrase updates the same rule; an archived category is never suggested.
  await createRule(user, { phrase: "alfa bar", categoryId: old.id });
  assert.equal(await byDescription("alfa bar"), old.id);
  await updateCategory(user, old.id, { archived: true });
  assert.equal(await byDescription("alfa bar"), null);
  await rejectsApi(createRule(user, { phrase: "new phrase", categoryId: old.id }), 422, "validation");
});

test("transfers pair across accounts and months, are excluded from totals, and unpair atomically", async () => {
  const user = await newUser();
  const checking = await account(user);
  const savings = await account(user, "Synthetic savings", "CASH");
  const other = await account(user, "Synthetic card", "CARD");
  const food = await category(user, "Food");

  await movement(user, checking.id, "2026-10-12", -2_500, { categoryId: food.id });
  const out = await movement(user, checking.id, "2026-10-31", -30_000);
  const into = await movement(user, savings.id, "2026-11-03", 30_000);
  const before = { oct: await monthSummary(user, "2026-10"), nov: await monthSummary(user, "2026-11") };
  assert.equal(before.oct.expenseCents, 32_500);
  assert.equal(before.nov.incomeCents, 30_000, "unpaired, the incoming leg looks like income");

  const transfer = await pairMovements(user, { movementIds: [into.id, out.id] });
  assert.equal(transfer.out.id, out.id);
  assert.equal(transfer.in.id, into.id);
  assert.equal((await monthSummary(user, "2026-10")).expenseCents, 2_500);
  assert.equal((await monthSummary(user, "2026-11")).incomeCents, 0);
  assert.equal((await listMovements(user, new URLSearchParams({ month: "2026-10" }))).some((row) => row.id === out.id), true);
  assert.equal((await listMovements(user, new URLSearchParams({ month: "2026-11" }))).some((row) => row.id === into.id), true);

  // A paired leg's amount and account are frozen and it cannot be voided; dates and text can change.
  await rejectsApi(updateMovement(user, out.id, { amountCents: -31_000 }), 409, "paired");
  await rejectsApi(updateMovement(user, out.id, { accountId: other.id }), 409, "paired");
  await rejectsApi(updateMovement(user, out.id, { voided: true }), 409, "paired");
  assert.equal((await updateMovement(user, out.id, { bookingDate: "2026-11-01" })).bookingDate, "2026-11-01");

  await unpairTransfer(user, transfer.id);
  assert.deepEqual(await monthSummary(user, "2026-11"), { month: "2026-11", incomeCents: 30_000, expenseCents: 30_000, netCents: 0 });
  await rejectsMissing(unpairTransfer(user, transfer.id));

  // Pairing preconditions.
  const same = await movement(user, checking.id, "2026-11-04", 30_000);
  await rejectsApi(pairMovements(user, { movementIds: [out.id, same.id] }), 409, "same_account");
  const wrongAmount = await movement(user, other.id, "2026-11-04", 29_999);
  await rejectsApi(pairMovements(user, { movementIds: [out.id, wrongAmount.id] }), 409, "amount_mismatch");
  const sameSign = await movement(user, other.id, "2026-11-04", -30_000);
  await rejectsApi(pairMovements(user, { movementIds: [out.id, sameSign.id] }), 409, "amount_mismatch");
  await rejectsApi(pairMovements(user, { movementIds: [out.id, out.id] }), 422, "validation");
  const voided = await movement(user, other.id, "2026-11-04", 30_000);
  await updateMovement(user, voided.id, { voided: true });
  await rejectsApi(pairMovements(user, { movementIds: [out.id, voided.id] }), 409, "voided");

  // Two competing pairings for the same movement: exactly one wins.
  const targets = await Promise.all([1, 2, 3].map(() => movement(user, other.id, "2026-11-05", 30_000)));
  const results = await Promise.allSettled(targets.map((target) => pairMovements(user, { movementIds: [out.id, target.id] })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of results) {
    if (result.status === "rejected") assert.ok(result.reason instanceof ApiError && result.reason.status === 409);
  }
  await rejectsApi(pairMovements(user, { movementIds: [out.id, targets[0].id] }), 409);

  // A new transfer books both legs at once, with independent dates in different months.
  const created = await createTransfer(user, {
    fromAccountId: checking.id, toAccountId: savings.id, amountCents: 5_000,
    bookingDate: "2026-11-30", inBookingDate: "2026-12-02", description: "Synthetic transfer",
  });
  assert.deepEqual([created.out.amountCents, created.in.amountCents, created.out.bookingDate, created.in.bookingDate], [-5_000, 5_000, "2026-11-30", "2026-12-02"]);
  assert.equal((await monthSummary(user, "2026-12")).incomeCents, 0);
  await rejectsApi(createTransfer(user, { fromAccountId: checking.id, toAccountId: checking.id, amountCents: 1, bookingDate: "2026-11-30", description: "x" }), 422, "validation");
});

test("refunds reduce net spending in the month they clear; budget history is frozen", async () => {
  const user = await newUser();
  const checking = await account(user);
  const food = await category(user, "Food");
  const salary = await category(user, "Salary", "INCOME");
  const octNow = new Date("2026-10-15T10:00:00Z");
  const novNow = new Date("2026-11-10T10:00:00Z");
  const row = async (month: string) => (await getBudget(user, month)).rows.find((item) => item.categoryId === food.id)!;

  await movement(user, checking.id, "2026-10-08", -8_000, { categoryId: food.id });
  await movement(user, checking.id, "2026-10-25", 200_000, { categoryId: salary.id });
  await setLimit(user, { categoryId: food.id, limitCents: 10_000 }, octNow);
  assert.deepEqual(
    [(await row("2026-10")).spentCents, (await row("2026-10")).limitCents, (await row("2026-10")).varianceCents],
    [8_000, 10_000, 2_000],
  );
  assert.equal((await row("2026-09")).limitCents, null, "no budget existed before it was set");

  // A November refund for an October purchase reduces November, and only November.
  const refund = await movement(user, checking.id, "2026-11-04", 3_000, { categoryId: food.id });
  await movement(user, checking.id, "2026-11-06", -1_000, { categoryId: food.id });
  assert.equal((await row("2026-10")).spentCents, 8_000);
  assert.equal((await row("2026-11")).spentCents, -2_000, "net of the refund, not clamped");
  assert.equal((await monthSummary(user, "2026-11")).expenseCents, -2_000, "the cash-flow net expense is reduced as well");
  assert.equal((await monthSummary(user, "2026-11")).incomeCents, 0, "a categorised refund is not income");
  assert.equal((await monthSummary(user, "2026-10")).incomeCents, 200_000);

  // Changing the base from November keeps October's limit; overrides touch one month only.
  await setLimit(user, { categoryId: food.id, limitCents: 15_000 }, novNow);
  assert.equal((await row("2026-10")).limitCents, 10_000);
  assert.equal((await row("2026-10")).varianceCents, 2_000);
  assert.equal((await row("2026-11")).limitCents, 15_000);
  assert.equal((await row("2027-02")).limitCents, 15_000, "a base keeps applying to later months");
  await setLimit(user, { categoryId: food.id, month: "2026-12", limitCents: 30_000 }, novNow);
  assert.equal((await row("2026-12")).limitCents, 30_000);
  assert.equal((await row("2026-12")).limitSource, "override");
  assert.equal((await row("2027-01")).limitCents, 15_000);
  await rejectsApi(setLimit(user, { categoryId: food.id, month: "2026-10", limitCents: 1 }, novNow), 409, "frozen_month");
  await clearOverride(user, new URLSearchParams({ categoryId: food.id, month: "2026-12" }), novNow);
  assert.equal((await row("2026-12")).limitCents, 15_000);
  await rejectsApi(setLimit(user, { categoryId: salary.id, limitCents: 1 }, novNow), 422, "validation");

  // Removing the budget from December on leaves every earlier month alone.
  await setLimit(user, { categoryId: food.id, limitCents: null }, new Date("2026-12-02T10:00:00Z"));
  assert.equal((await row("2026-11")).limitCents, 15_000);
  assert.equal((await row("2026-12")).limitSource, "none");

  // Voiding the refund puts the spending back.
  await updateMovement(user, refund.id, { voided: true });
  assert.equal((await row("2026-11")).spentCents, 1_000);
});

test("archived recurring expenses can be deleted without losing booked payments", async () => {
  const user = await newUser(), other = await newUser();
  const checking = await account(user);
  const now = new Date("2026-11-15T10:00:00Z");
  const make = (description: string) => createTemplate(user, {
    accountId: checking.id, description, amountCents: 3_000, frequency: "MONTHLY", startDate: "2026-11-10",
  });
  const unused = await make("Synthetic skipped"), paid = await make("Synthetic paid");
  await resolveOccurrence(user, { action: "skip", templateId: unused.id, dueDate: "2026-11-10" }, now);
  const payment = await resolveOccurrence(user, { action: "confirm", templateId: paid.id, dueDate: "2026-11-10" }, now);
  await updateTemplate(user, paid.id, { archived: true });
  assert.deepEqual((await listRecurring(user, new URLSearchParams({ archived: "1" }), now)).templates.map(({ archived }) => archived).sort(), [false, true]);
  await rejectsApi(deleteTemplate(other, paid.id), 404, "not_found");
  await deleteTemplate(user, unused.id);
  await deleteTemplate(user, paid.id);
  const movementId = payment?.movement?.id;
  assert.ok(movementId);
  assert.equal(await db().recurringTemplate.count({ where: { userId: user, id: unused.id } }), 0);
  assert.equal(await db().movement.count({ where: { userId: user, id: movementId } }), 1);
  assert.equal(await db().recurringOccurrence.count({ where: { userId: user, templateId: paid.id, movementId } }), 1);
  const remaining = await listRecurring(user, new URLSearchParams({ archived: "1" }), now);
  assert.deepEqual([remaining.templates, remaining.due, remaining.skipped], [[], [], []]);
  await rejectsApi(updateTemplate(user, paid.id, { archived: false }), 404, "not_found");
});

test("recurring expenses: due occurrences confirm, match or skip exactly once", async () => {
  const user = await newUser();
  const other = await newUser();
  const checking = await account(user);
  const card = await account(user, "Synthetic card", "CARD");
  const food = await category(user, "Food");
  const now = new Date("2026-11-15T10:00:00Z");

  const template = await createTemplate(user, {
    accountId: checking.id, categoryId: food.id, description: "Synthetic gym", amountCents: 3_000, frequency: "MONTHLY", startDate: "2026-09-10",
  });
  const overview = await listRecurring(user, new URLSearchParams(), now);
  assert.deepEqual(overview.due.map((item) => item.dueDate), ["2026-09-10", "2026-10-10", "2026-11-10"]);
  assert.deepEqual(overview.upcoming.map((item) => item.dueDate), ["2026-12-10"]);
  assert.equal(overview.templates[0].description, "Synthetic gym");
  const totalBefore = await monthSummary(user, "2026-09");

  // Nothing is booked until an occurrence is confirmed; skipped ones never are.
  assert.equal((await listMovements(user, new URLSearchParams())).length, 0);
  const confirmed = await resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-09-10" }, now);
  assert.equal(confirmed?.movement?.amountCents, -3_000);
  assert.equal(confirmed?.movement?.description, "Synthetic gym");
  assert.equal(confirmed?.movement?.categoryId, food.id);
  assert.equal((await monthSummary(user, "2026-09")).expenseCents, totalBefore.expenseCents + 3_000);
  await rejectsApi(resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-09-10" }, now), 409, "already_resolved");
  await rejectsApi(resolveOccurrence(user, { action: "skip", templateId: template.id, dueDate: "2026-09-10" }, now), 409, "already_resolved");

  // Concurrent confirmations of one occurrence: one booking, every other request rejected.
  const racing = await Promise.allSettled(Array.from({ length: 8 }, () =>
    resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-10-10", amountCents: 3_100 }, now)));
  assert.equal(racing.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of racing) {
    if (result.status === "rejected") assert.ok(result.reason instanceof ApiError && result.reason.status === 409, String(result.reason));
  }
  const october = await listMovements(user, new URLSearchParams({ month: "2026-10" }));
  assert.equal(october.length, 1);
  assert.equal(october[0].amountCents, -3_100);

  // A confirm racing a skip and a match on the same occurrence still resolves it once.
  const existing = await movement(user, checking.id, "2026-11-09", -2_900);
  const mixed = await Promise.allSettled([
    resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-11-10" }, now),
    resolveOccurrence(user, { action: "skip", templateId: template.id, dueDate: "2026-11-10" }, now),
    resolveOccurrence(user, { action: "match", templateId: template.id, dueDate: "2026-11-10", movementId: existing.id }, now),
  ]);
  assert.equal(mixed.filter((result) => result.status === "fulfilled").length, 1);

  // Future occurrences and dates that are not occurrences cannot be resolved.
  await rejectsApi(resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-12-10" }, now), 409, "not_due");
  await rejectsApi(resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-11-11" }, now), 422, "validation");

  // Matching validates the user, the account, the sign and the movement state.
  const weekly = await createTemplate(user, { accountId: checking.id, description: "Synthetic cleaner", amountCents: 2_000, frequency: "WEEKLY", startDate: "2026-11-02" });
  const attempt = (dueDate: string, movementId: string) => resolveOccurrence(user, { action: "match", templateId: weekly.id, dueDate, movementId }, now);
  const wrongAccount = await movement(user, card.id, "2026-11-02", -2_000);
  const inflow = await movement(user, checking.id, "2026-11-02", 2_000);
  const gone = await movement(user, checking.id, "2026-11-02", -2_000);
  await updateMovement(user, gone.id, { voided: true });
  const incomeCategory = await category(user, "Synthetic refund category", "INCOME");
  const incomeTagged = await movement(user, checking.id, "2026-11-02", -2_000, { categoryId: incomeCategory.id });
  const foreign = await account(other);
  const foreignMovement = await movement(other, foreign.id, "2026-11-02", -2_000);
  await rejectsApi(attempt("2026-11-02", wrongAccount.id), 409, "account_mismatch");
  await rejectsApi(attempt("2026-11-02", inflow.id), 409, "sign_mismatch");
  await rejectsApi(attempt("2026-11-02", incomeTagged.id), 409, "sign_mismatch");
  await rejectsApi(attempt("2026-11-02", gone.id), 409, "voided");
  await rejectsMissing(attempt("2026-11-02", foreignMovement.id));

  const candidates = (await occurrenceCandidates(user, new URLSearchParams({ templateId: weekly.id, dueDate: "2026-11-02" }))).movements;
  assert.ok(candidates.every((item) => item.accountId === checking.id && item.amountCents < 0 && !item.voided));
  assert.ok(!candidates.some((item) => item.id === incomeTagged.id), "an outflow in an INCOME category is not offered");
  const good = await movement(user, checking.id, "2026-11-03", -1_950);
  assert.ok((await occurrenceCandidates(user, new URLSearchParams({ templateId: weekly.id, dueDate: "2026-11-02" }))).movements.some((item) => item.id === good.id));

  const countBefore = (await listMovements(user, new URLSearchParams())).length;
  const matched = await attempt("2026-11-02", good.id);
  assert.equal(matched?.occurrence.status, "MATCHED");
  assert.equal((await listMovements(user, new URLSearchParams())).length, countBefore, "matching books nothing new");
  await rejectsApi(attempt("2026-11-09", good.id), 409, "already_linked");

  // Skipping books nothing and can be undone.
  const before = (await listMovements(user, new URLSearchParams())).length;
  await resolveOccurrence(user, { action: "skip", templateId: weekly.id, dueDate: "2026-11-09" }, now);
  assert.equal((await listMovements(user, new URLSearchParams())).length, before);
  assert.equal((await listRecurring(user, new URLSearchParams(), now)).due.some((item) => item.templateId === weekly.id && item.dueDate === "2026-11-09"), false);
  await resolveOccurrence(user, { action: "unskip", templateId: weekly.id, dueDate: "2026-11-09" }, now);
  assert.equal((await listRecurring(user, new URLSearchParams(), now)).due.some((item) => item.templateId === weekly.id && item.dueDate === "2026-11-09"), true);
  await rejectsMissing(resolveOccurrence(user, { action: "unskip", templateId: weekly.id, dueDate: "2026-11-02" }, now));

  // An archived template stops surfacing; an unknown field is rejected.
  await updateTemplate(user, weekly.id, { archived: true });
  assert.equal((await listRecurring(user, new URLSearchParams(), now)).due.some((item) => item.templateId === weekly.id), false);
  await rejectsApi(updateTemplate(user, template.id, { frequency: "YEARLY" }), 422, "validation");
});

test("starter categories are added once and the dashboard reports the user's real month", async () => {
  const user = await newUser();
  const first = await addStarterCategories(user, { locale: "it" });
  const second = await addStarterCategories(user, { locale: "it" });
  assert.equal(first.length, second.length);
  assert.ok(first.some((item) => item.name === "Spesa" && item.kind === "EXPENSE"));
  assert.ok(first.some((item) => item.name === "Stipendio" && item.kind === "INCOME"));

  const now = new Date("2026-11-20T09:00:00Z");
  const checking = await account(user);
  const groceries = first.find((item) => item.name === "Spesa")!;
  const salary = first.find((item) => item.name === "Stipendio")!;
  assert.equal((await getDashboard(user, now)).hasMovements, false);

  await setLimit(user, { categoryId: groceries.id, limitCents: 40_000 }, now);
  await movement(user, checking.id, "2026-11-01", 300_000, { categoryId: salary.id });
  await movement(user, checking.id, "2026-11-12", -12_345, { categoryId: groceries.id, description: "Synthetic market" });
  await movement(user, checking.id, "2026-10-30", -5_000);

  const dashboard = await getDashboard(user, now);
  assert.equal(dashboard.month, "2026-11");
  assert.equal(dashboard.hasAccounts, true);
  assert.equal(dashboard.incomeCents, 300_000);
  assert.equal(dashboard.expenseCents, 12_345);
  assert.equal(dashboard.monthlyNetCents, 287_655);
  assert.equal(dashboard.latest[0].description, "Synthetic market");
  assert.equal(dashboard.latest[0].categoryName, "Spesa");
  assert.deepEqual(dashboard.trend.at(-2), { month: "2026-10", incomeCents: 0, expenseCents: 5_000 });
  assert.deepEqual(dashboard.budgets.map(({ name, spentCents, limitCents }) => [name, spentCents, limitCents]), [["Spesa", 12_345, 40_000]]);
});

test("route wrapper: session required, same-origin mutations, no-store JSON, no leaked details", async (t) => {
  process.env.APP_ORIGIN ??= "http://127.0.0.1:3000";
  const origin = new URL(process.env.APP_ORIGIN).origin;
  const userId = await newUser();
  const token = newToken();
  await db().session.create({ data: { tokenDigest: digestToken(token)!, userId, expiresAt: new Date(Date.now() + 60_000) } });

  const read = api(async ({ userId: id }) => ({ id }));
  const write = api(async ({ userId: id, body }) => ({ id, body: await body() }), { status: 201 });
  const balanceWrite = api(async ({ userId: id, body }) => {
    const result = await recordCheck(id, await body());
    return NextResponse.json(result.check, { status: result.created ? 201 : 200 });
  });
  const crash = api(async () => { throw new Error("secret amount 12345.67 for synthetic account"); });
  const reject = api(async () => { throw new ApiError(422, "validation", "amountCents"); });
  const call = (handler: typeof read, method: string, headers: Record<string, string> = {}, body?: string) =>
    handler(new NextRequest("http://127.0.0.1/api/cash-flow/x", { method, headers, body }), { params: Promise.resolve({}) });
  const cookie = { cookie: `${sessionCookie}=${token}` };
  const json = { "content-type": "application/json" };

  const anonymous = await call(read, "GET");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");
  assert.equal((await call(read, "GET", { cookie: `${sessionCookie}=${newToken()}` })).status, 401);

  const ok = await call(read, "GET", cookie);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { id: userId }, "the user id comes from the session");

  const payload = JSON.stringify({ amountCents: -100 });
  assert.equal((await call(write, "POST", { ...cookie, ...json }, payload)).status, 403, "no Origin header");
  assert.equal((await call(write, "POST", { ...cookie, ...json, origin: "http://evil.example" }, payload)).status, 403);
  const created = await call(write, "POST", { ...cookie, ...json, origin }, payload);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  assert.equal((await call(write, "POST", { ...cookie, origin }, payload)).status, 400, "JSON content type required");
  assert.equal((await call(write, "POST", { ...cookie, ...json, origin }, "[1]")).status, 400);
  assert.equal((await call(write, "POST", { ...cookie, ...json, origin }, JSON.stringify({ pad: "x".repeat(20_000) }))).status, 400);
  assert.equal((await call(write, "POST", { ...json, origin }, payload)).status, 401, "origin alone is not authentication");

  const checking = await account(userId);
  const balancePayload = JSON.stringify({ accountId: checking.id, asOf: "2026-11-18", balanceCents: 100 });
  const balanceCreated = await call(balanceWrite, "POST", { ...cookie, ...json, origin }, balancePayload);
  const balanceReplaced = await call(balanceWrite, "POST", { ...cookie, ...json, origin }, balancePayload);
  assert.equal(balanceCreated.status, 201);
  assert.equal(balanceReplaced.status, 200);
  assert.equal(balanceCreated.headers.get("cache-control"), "no-store");
  assert.equal(balanceReplaced.headers.get("cache-control"), "no-store");
  const balanceBody = await balanceCreated.json();
  assert.deepEqual(Object.keys(balanceBody).sort(), ["accountId", "asOf", "balanceCents", "id"]);
  assert.deepEqual(await balanceReplaced.json(), balanceBody);

  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const failed = await call(crash, "GET", cookie);
  assert.equal(failed.status, 500);
  const text = await failed.text();
  assert.deepEqual(JSON.parse(text), { error: "internal" });
  assert.ok(!text.includes("secret"));
  assert.ok(!JSON.stringify(logged).includes("12345.67") && !JSON.stringify(logged).includes("synthetic account"), "logs carry no message text");

  const invalid = await call(reject, "GET", cookie);
  assert.equal(invalid.status, 422);
  assert.deepEqual(await invalid.json(), { error: "validation", field: "amountCents" });
});

test("the register pages through every row in a stable order, keeping filters, and rows on later pages stay editable", async () => {
  const user = await newUser();
  const checking = await account(user);
  const card = await account(user, "Synthetic card", "CARD");
  const food = await category(user, "Food");

  // 120 rows in one month (two share a date on purpose), plus rows in other months and accounts.
  const ids: string[] = [];
  for (let index = 0; index < 120; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const created = await movement(user, index % 4 === 0 ? card.id : checking.id, `2026-10-${day}`, -(100 + index), { categoryId: index % 3 === 0 ? food.id : null });
    ids.push(created.id);
  }
  await movement(user, checking.id, "2026-09-30", -1);
  await movement(user, checking.id, "2026-11-01", -1);

  const page = (query: Record<string, string>) => listMovementsPage(user, new URLSearchParams(query));
  const first = await page({ month: "2026-10", page: "1" });
  const second = await page({ month: "2026-10", page: "2" });
  const third = await page({ month: "2026-10", page: "3" });
  assert.deepEqual([first.movements.length, second.movements.length, third.movements.length], [50, 50, 20]);
  assert.deepEqual([first.hasMore, second.hasMore, third.hasMore], [true, true, false]);

  const seen = [...first.movements, ...second.movements, ...third.movements].map((row) => row.id);
  assert.equal(new Set(seen).size, 120, "no row repeats across pages");
  assert.deepEqual([...seen].sort(), [...ids].sort(), "no row is skipped");
  const all = (await listMovements(user, new URLSearchParams({ month: "2026-10", limit: "500" }))).map((row) => row.id);
  assert.deepEqual(seen, all, "pages follow the same total order as the full list");
  assert.deepEqual(await page({ month: "2026-10", page: "3" }), third, "stable on repeat");
  assert.deepEqual((await page({ month: "2026-10", page: "4" })).movements, []);

  // Filters are honoured on every page.
  const cardOnly = await page({ month: "2026-10", accountId: card.id, page: "1" });
  assert.equal(cardOnly.movements.length, 30);
  assert.ok(cardOnly.movements.every((row) => row.accountId === card.id) && !cardOnly.hasMore);
  const foodPage2 = await page({ month: "2026-10", categoryId: food.id, page: "1" });
  assert.equal(foodPage2.movements.length, 40);
  assert.equal((await page({ month: "2026-10", categoryId: "none", page: "2" })).movements.length, 30);

  // A row on page 3 is reachable and editable, and a legacy limit/offset call still works.
  const target = third.movements[third.movements.length - 1];
  const edited = await updateMovement(user, target.id, { description: "Synthetic edited on page three" });
  assert.equal(edited.description, "Synthetic edited on page three");
  assert.equal((await page({ month: "2026-10", page: "3" })).movements.at(-1)?.description, "Synthetic edited on page three");
  assert.deepEqual(
    (await listMovements(user, new URLSearchParams({ month: "2026-10", limit: "20", offset: "100" }))).map((row) => row.id),
    third.movements.map((row) => row.id),
  );

  for (const bad of [{ page: "0" }, { page: "x" }, { page: "100001" }, { month: "1999-12" }, { month: "2101-01" }, { month: "2026-13" }] as Record<string, string>[]) {
    await rejectsApi(page(bad), 422, "validation");
  }
  await rejectsApi(setLimit(user, { categoryId: food.id, month: "2101-01", limitCents: 1 }, new Date("2026-11-10T12:00:00Z")), 422, "validation");
});

test("a movement that settles a recurring occurrence keeps its link until the occurrence is reopened", async () => {
  const user = await newUser();
  const checking = await account(user);
  const card = await account(user, "Synthetic card", "CARD");
  const savings = await account(user, "Synthetic savings", "CASH");
  const now = new Date("2026-11-15T10:00:00Z");
  const template = await createTemplate(user, { accountId: checking.id, description: "Synthetic gym", amountCents: 3_000, frequency: "MONTHLY", startDate: "2026-11-05" });
  const resolve = (action: string, extra: Record<string, unknown> = {}) =>
    resolveOccurrence(user, { action, templateId: template.id, dueDate: "2026-11-05", ...extra }, now);
  const dueNow = async () => (await listRecurring(user, new URLSearchParams(), now)).due.map((item) => item.dueDate);

  const confirmed = await resolve("confirm");
  const booked = confirmed!.movement!;
  assert.deepEqual(booked.linked, { templateId: template.id, dueDate: "2026-11-05" });
  assert.equal((await getMovement(user, booked.id)).linked?.dueDate, "2026-11-05");
  assert.deepEqual(await dueNow(), []);

  // Edits that would break the association are refused.
  await rejectsApi(updateMovement(user, booked.id, { voided: true }), 409, "linked");
  await rejectsApi(updateMovement(user, booked.id, { accountId: card.id }), 409, "linked");
  await rejectsApi(updateMovement(user, booked.id, { amountCents: 3_000 }), 409, "linked");
  const partner = await movement(user, savings.id, "2026-11-05", 3_000);
  // Same amount, opposite sign, other account: only the link keeps it from being offered or paired.
  assert.deepEqual((await transferCandidates(user, new URLSearchParams({ movementId: partner.id }))).movements, [], "a linked movement is not a transfer candidate");
  assert.deepEqual((await transferCandidates(user, new URLSearchParams({ movementId: booked.id }))).movements, [], "and it is offered none");
  await rejectsApi(pairMovements(user, { movementIds: [booked.id, partner.id] }), 409, "linked");
  await rejectsApi(pairMovements(user, { movementIds: [partner.id, booked.id] }), 409, "linked");

  // Compatible edits stay available and keep the link.
  const adjusted = await updateMovement(user, booked.id, { amountCents: -3_150, description: "Synthetic gym (adjusted)", bookingDate: "2026-11-06", categoryId: null });
  assert.deepEqual([adjusted.amountCents, adjusted.bookingDate, adjusted.linked !== null], [-3_150, "2026-11-06", true]);

  // A free outflow of the same amount is still offered.
  const outflow = await movement(user, checking.id, "2026-11-07", -3_000);
  assert.deepEqual(
    (await transferCandidates(user, new URLSearchParams({ movementId: partner.id }))).movements.map((row) => row.id),
    [outflow.id],
  );

  // Reopen: due again, the movement stays booked and becomes free; reopening twice is refused.
  const before = (await listMovements(user, new URLSearchParams())).length;
  await resolve("reopen");
  assert.deepEqual(await dueNow(), ["2026-11-05"]);
  assert.equal((await listMovements(user, new URLSearchParams())).length, before, "nothing is booked or removed by reopening");
  const freed = await getMovement(user, booked.id);
  assert.deepEqual([freed.linked, freed.voided, freed.amountCents], [null, false, -3_150]);
  await rejectsMissing(resolve("reopen"));
  await rejectsApi(resolve("skip").then(() => resolve("reopen")), 404);

  // Now the invalid changes are allowed, and the corrected movement can be matched again without a duplicate.
  assert.equal((await updateMovement(user, booked.id, { accountId: card.id })).accountId, card.id);
  await rejectsApi(resolve("match", { movementId: booked.id }), 409, "already_resolved");
  await resolve("unskip");
  await rejectsApi(resolve("match", { movementId: booked.id }), 409, "account_mismatch");
  assert.equal((await updateMovement(user, booked.id, { accountId: checking.id })).accountId, checking.id);
  const countBeforeMatch = (await listMovements(user, new URLSearchParams())).length;
  const candidates = await occurrenceCandidates(user, new URLSearchParams({ templateId: template.id, dueDate: "2026-11-05" }));
  assert.ok(candidates.movements.some((row) => row.id === booked.id), "the reopened movement is offered again");
  const rematched = await resolve("match", { movementId: booked.id });
  assert.equal(rematched?.occurrence.status, "MATCHED");
  assert.equal((await listMovements(user, new URLSearchParams())).length, countBeforeMatch, "re-matching books no duplicate");
  assert.equal((await getMovement(user, booked.id)).linked?.dueDate, "2026-11-05");

  // Reopen after a match works too; voiding then becomes possible and the occurrence can take a new booking.
  await resolve("reopen");
  assert.equal((await updateMovement(user, booked.id, { voided: true })).voided, true);
  const replacement = await resolve("confirm");
  assert.equal(replacement?.movement?.amountCents, -3_000);

  // Other users cannot reopen it, and a skipped occurrence has nothing to reopen.
  const other = await newUser();
  await rejectsMissing(resolveOccurrence(other, { action: "reopen", templateId: template.id, dueDate: "2026-11-05" }, now));
});

test("reopen and edits race safely: a linked movement never ends up voided while still linked", async () => {
  const user = await newUser();
  const checking = await account(user);
  const now = new Date("2026-11-15T10:00:00Z");
  const template = await createTemplate(user, { accountId: checking.id, description: "Synthetic rent", amountCents: 50_000, frequency: "MONTHLY", startDate: "2026-11-01" });
  const booked = (await resolveOccurrence(user, { action: "confirm", templateId: template.id, dueDate: "2026-11-01" }, now))!.movement!;

  const results = await Promise.allSettled([
    updateMovement(user, booked.id, { voided: true }),
    resolveOccurrence(user, { action: "reopen", templateId: template.id, dueDate: "2026-11-01" }, now),
  ]);
  assert.ok(results.every((result) => result.status === "fulfilled" || (result.reason instanceof ApiError && result.reason.status === 409)));
  const final = await getMovement(user, booked.id);
  assert.equal(final.voided && final.linked !== null, false);
});

test("matching reaches every eligible row on dense and old histories", async () => {
  const user = await newUser();
  const checking = await account(user);
  const savings = await account(user, "Synthetic savings", "CASH");
  const now = new Date("2026-11-30T10:00:00Z");

  // 130 decoys that look like transfer partners near the source date, one real partner months earlier.
  const source = await movement(user, savings.id, "2026-11-02", 4_200);
  const decoys: string[] = [];
  for (let index = 0; index < 130; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    decoys.push((await movement(user, checking.id, `2026-${index % 2 ? "10" : "11"}-${day}`, -4_200)).id);
  }
  const old = await movement(user, checking.id, "2026-03-05", -4_200);

  const query = (extra: Record<string, string>) => new URLSearchParams({ movementId: source.id, ...extra });
  const walked: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await transferCandidates(user, query({ offset: String(offset) }));
    walked.push(...page.movements.map((row) => row.id));
    if (!page.hasMore) break;
    offset += page.pageSize;
  }
  assert.equal(walked.length, 131, "every eligible counterpart is reachable by paging");
  assert.equal(new Set(walked).size, 131);
  assert.equal(walked.at(-1), old.id, "nearest dates come first; the old partner is last");
  assert.ok(decoys.every((id) => walked.includes(id)));

  // The month filter jumps straight to the old row, and a cross-month pairing succeeds.
  const filtered = await transferCandidates(user, query({ month: "2026-03" }));
  assert.deepEqual(filtered.movements.map((row) => row.id), [old.id]);
  const transfer = await pairMovements(user, { movementIds: [source.id, old.id] });
  assert.equal(transfer.out.bookingDate, "2026-03-05");
  assert.equal(transfer.in.bookingDate, "2026-11-02");
  await rejectsApi(transferCandidates(user, query({ month: "2026-3" })), 422, "validation");
  await rejectsApi(transferCandidates(user, query({ offset: "-1" })), 422, "validation");

  // Recurring: a bill paid long after its due date is reachable by month, and paging covers everything.
  const template = await createTemplate(user, { accountId: checking.id, description: "Synthetic insurance", amountCents: 4_200, frequency: "MONTHLY", startDate: "2026-01-15" });
  const forRecurring = (extra: Record<string, string>) => occurrenceCandidates(user, new URLSearchParams({ templateId: template.id, dueDate: "2026-01-15", ...extra }));
  const recurringWalked: string[] = [];
  for (let page = 0; ; page++) {
    const result = await forRecurring({ offset: String(page * 20) });
    recurringWalked.push(...result.movements.map((row) => row.id));
    if (!result.hasMore) break;
  }
  assert.equal(new Set(recurringWalked).size, decoys.length, "all unpaired unlinked outflows in the account, none repeated");
  assert.ok(!recurringWalked.includes(old.id), "the paired movement is not offered");
  const lateMonth = await forRecurring({ month: "2026-11" });
  assert.ok(lateMonth.movements.length > 0 && lateMonth.movements.every((row) => row.bookingDate.startsWith("2026-11")));
  const lateRow = lateMonth.movements[0];
  const resolved = await resolveOccurrence(user, { action: "match", templateId: template.id, dueDate: "2026-01-15", movementId: lateRow.id }, now);
  assert.equal(resolved?.occurrence.status, "MATCHED");
  assert.ok(!(await forRecurring({ month: "2026-11" })).movements.some((row) => row.id === lateRow.id), "a linked movement is no longer a candidate");

  // Only the owner's rows are ever offered.
  const stranger = await newUser();
  await rejectsMissing(transferCandidates(stranger, query({})));
  await rejectsMissing(occurrenceCandidates(stranger, new URLSearchParams({ templateId: template.id, dueDate: "2026-01-15" })));
});

test("refunds that exceed spending show as a negative net expense in the dashboard trend", async () => {
  const user = await newUser();
  const checking = await account(user);
  const shoes = await category(user, "Shoes");
  const now = new Date("2026-11-20T09:00:00Z");
  await movement(user, checking.id, "2026-10-10", -8_000, { categoryId: shoes.id });
  await movement(user, checking.id, "2026-11-04", 3_000, { categoryId: shoes.id });

  const dashboard = await getDashboard(user, now);
  assert.deepEqual(dashboard.trend.at(-1), { month: "2026-11", incomeCents: 0, expenseCents: -3_000 });
  assert.deepEqual(dashboard.trend.at(-2), { month: "2026-10", incomeCents: 0, expenseCents: 8_000 });
  assert.equal(dashboard.expenseCents, -3_000);
  assert.equal(dashboard.monthlyNetCents, 3_000);
  assert.equal(dashboard.latest[0].amountCents, 3_000);
});

test("an archived template can still be reopened, freeing its linked movement without undoing the archive", async () => {
  const user = await newUser();
  const checking = await account(user);
  const savings = await account(user, "Synthetic savings", "CASH");
  const now = new Date("2026-11-15T10:00:00Z");
  const dueNow = async (id: string) => (await listRecurring(user, new URLSearchParams(), now)).due.filter((item) => item.templateId === id).length;
  const archivedFlag = async (id: string) =>
    (await listRecurring(user, new URLSearchParams({ archived: "1" }), now)).templates.find((item) => item.id === id)?.archived;

  for (const route of ["confirm", "match"] as const) {
    const template = await createTemplate(user, { accountId: checking.id, description: `Synthetic ${route}`, amountCents: 3_000, frequency: "MONTHLY", startDate: "2026-11-05" });
    const resolve = (action: string, extra: Record<string, unknown> = {}) =>
      resolveOccurrence(user, { action, templateId: template.id, dueDate: "2026-11-05", ...extra }, now);

    const booked = route === "confirm"
      ? (await resolve("confirm"))!.movement!
      : await movement(user, checking.id, "2026-11-04", -3_000);
    if (route === "match") await resolve("match", { movementId: booked.id });
    assert.equal((await getMovement(user, booked.id)).linked?.dueDate, "2026-11-05");

    await updateTemplate(user, template.id, { archived: true });
    assert.equal(await archivedFlag(template.id), true);
    await rejectsApi(updateMovement(user, booked.id, { voided: true }), 409, "linked");

    // Reopen works on the archived template and reports that it is archived.
    const countBefore = (await listMovements(user, new URLSearchParams())).length;
    const result = await resolve("reopen");
    assert.deepEqual([result?.reopened, result?.templateArchived, result?.occurrence.movementId], [true, true, booked.id]);

    // The booked movement is intact and unlinked; the archive was not undone; nothing became due.
    const freed = await getMovement(user, booked.id);
    assert.deepEqual([freed.linked, freed.voided, freed.amountCents, freed.accountId], [null, false, -3_000, checking.id]);
    assert.equal((await listMovements(user, new URLSearchParams())).length, countBefore, "no movement booked or removed");
    assert.equal(await archivedFlag(template.id), true, "the template stays archived");
    assert.equal(await dueNow(template.id), 0, "an inactive template has no due occurrence");
    await rejectsMissing(resolve("reopen"));
    // An archived template still cannot take new resolutions.
    await rejectsApi(resolve("confirm"), 409, "archived");

    // The corrections the link used to block are now possible.
    assert.equal((await updateMovement(user, booked.id, { accountId: savings.id })).accountId, savings.id);
    assert.equal((await updateMovement(user, booked.id, { voided: true })).voided, true);
  }

  // An active template reports templateArchived: false and keeps its due occurrence behaviour.
  const active = await createTemplate(user, { accountId: checking.id, description: "Synthetic active", amountCents: 1_000, frequency: "MONTHLY", startDate: "2026-11-06" });
  await resolveOccurrence(user, { action: "confirm", templateId: active.id, dueDate: "2026-11-06" }, now);
  assert.equal(await dueNow(active.id), 0);
  const reopenedActive = await resolveOccurrence(user, { action: "reopen", templateId: active.id, dueDate: "2026-11-06" }, now);
  assert.deepEqual([reopenedActive?.reopened, reopenedActive?.templateArchived], [true, false]);
  assert.equal(await dueNow(active.id), 1);

  // Another user still cannot reopen it.
  const other = await newUser();
  await rejectsMissing(resolveOccurrence(other, { action: "reopen", templateId: active.id, dueDate: "2026-11-06" }, now));
});
