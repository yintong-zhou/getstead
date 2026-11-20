// Synthetic-only tests: refuse non-local URLs before creating any data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before, after } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server.js";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";
import { digestToken, newToken } from "../auth/crypto.ts";
import { sessionCookie } from "../auth/http.ts";
import { api } from "../cash-flow/http.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { createAccount, updateAccount } from "../cash-flow/catalog.ts";
import { getNetWorth, recordCheck } from "../net-worth/service.ts";
import { createInstrument, updateInstrument, listInstruments, createTransaction, updateTransaction, listTransactions, listQuotes, recordQuote, deleteQuote, getPortfolio } from "./service.ts";

let admin: PrismaClient;
before(() => {
  assert.equal(localPostgresUrl(process.env.DATABASE_URL).pathname, "/stead_auth_test");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});
after(async () => { await admin?.$disconnect(); await disconnectDb(); });

async function fixture() {
  const { id: userId } = await admin.user.create({ data: { email: `m3-${randomUUID()}@example.test`, passwordHash: "synthetic" } });
  const account = await createAccount(userId, { name: "Synthetic broker", type: "BROKERAGE" });
  const instrument = await createInstrument(userId, { name: "Synthetic ETF", kind: "ETF" });
  return { userId, account, instrument };
}
const buy = (accountId: string, instrumentId: string, extra = {}) => ({ accountId, instrumentId, type: "BUY", tradeDate: "2026-11-02", quantity: "10", amountCents: 60_000, feesCents: 0, taxWithheldCents: 0, ...extra });
const rejects = (promise: Promise<unknown>, status: number, code?: string) => assert.rejects(promise, (error: unknown) => {
  const failure = error as { status?: number; code?: string };
  return failure.status === status && (!code || failure.code === code);
});

test("investment cash plus holdings preserves net worth and void removes both effects", async () => {
  const { userId, account, instrument } = await fixture();
  await recordCheck(userId, { accountId: account.id, asOf: "2026-11-01", balanceCents: 100_000 });
  const transaction = await createTransaction(userId, buy(account.id, instrument.id));
  const worth = await getNetWorth(userId, new Date("2026-11-20T12:00:00Z"));
  assert.equal(worth.perAccount[0].balanceCents, 40_000);
  assert.equal(worth.netCents, 100_000);
  assert.equal(worth.series.at(-1)?.netCents, worth.netCents);
  await recordCheck(userId, { accountId: account.id, asOf: "2026-11-02", balanceCents: 40_000 });
  assert.equal((await getNetWorth(userId)).netCents, 100_000);
  await updateTransaction(userId, transaction.id, { voided: true });
  assert.equal((await getPortfolio(userId)).holdings.length, 0);
  assert.equal((await getNetWorth(userId)).netCents, 40_000);
  await updateTransaction(userId, transaction.id, { voided: false });
  assert.equal((await getNetWorth(userId)).netCents, 100_000);
});

test("concurrent sells replay under locks: only one sell of six from ten succeeds", async () => {
  const { userId, account, instrument } = await fixture();
  await createTransaction(userId, buy(account.id, instrument.id));
  const results = await Promise.allSettled([1, 2].map(() => createTransaction(userId, buy(account.id, instrument.id, { type: "SELL", quantity: "6", tradeDate: "2026-11-03" }))));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  const failure = results.find((row) => row.status === "rejected")!;
  assert.equal(failure.reason.status, 422);
  assert.equal(failure.reason.code, "negative_position");
});

test("void, backdated edit, reassignment and restore cannot make a later position negative", async () => {
  const { userId, account, instrument } = await fixture();
  const row = await createTransaction(userId, buy(account.id, instrument.id));
  await createTransaction(userId, buy(account.id, instrument.id, { type: "SELL", quantity: "6", tradeDate: "2026-11-03" }));
  await rejects(updateTransaction(userId, row.id, { voided: true }), 422, "negative_position");
  await rejects(updateTransaction(userId, row.id, { tradeDate: "2026-11-04" }), 422, "negative_position");
  const other = await createInstrument(userId, { name: "Other synthetic", kind: "BOND" });
  await rejects(updateTransaction(userId, row.id, { instrumentId: other.id }), 422, "negative_position");
  const sell = await createTransaction(userId, buy(account.id, instrument.id, { type: "SELL", quantity: "4", tradeDate: "2026-11-04" }));
  await updateTransaction(userId, sell.id, { voided: true });
  await updateTransaction(userId, row.id, { quantity: "6" });
  await rejects(updateTransaction(userId, sell.id, { voided: false }), 422, "negative_position");
});

test("ownership, incompatible account types and runtime privileges are enforced", async () => {
  const a = await fixture(), b = await fixture();
  assert.equal((await listInstruments(a.userId)).length, 1);
  await rejects(createTransaction(a.userId, buy(b.account.id, a.instrument.id)), 422);
  await rejects(createTransaction(a.userId, buy(a.account.id, b.instrument.id)), 422);
  const row = await createTransaction(a.userId, buy(a.account.id, a.instrument.id));
  await rejects(updateTransaction(b.userId, row.id, { voided: true }), 404);
  await rejects(updateInstrument(b.userId, a.instrument.id, { name: "Intrusion" }), 404);
  assert.equal((await listTransactions(b.userId)).length, 0);
  await rejects(updateAccount(a.userId, a.account.id, { type: "CHECKING" }), 409, "investment_account");
  await updateTransaction(a.userId, row.id, { voided: true });
  await rejects(updateAccount(a.userId, a.account.id, { type: "CASH" }), 409);
  const [rights] = await db().$queryRaw<{ instrument_delete: boolean; transaction_delete: boolean; ownership_update: boolean }[]>`
    SELECT has_table_privilege(current_user, 'stead_instruments', 'DELETE') AS instrument_delete,
      has_table_privilege(current_user, 'stead_investment_transactions', 'DELETE') AS transaction_delete,
      has_column_privilege(current_user, 'stead_investment_transactions', 'user_id', 'UPDATE') AS ownership_update`;
  assert.deepEqual(rights, { instrument_delete: false, transaction_delete: false, ownership_update: false });
  await assert.rejects(db().investmentTransaction.create({ data: { userId: a.userId, accountId: b.account.id, instrumentId: a.instrument.id, type: "DIVIDEND", tradeDate: new Date("2026-11-01"), ordinal: 1, amountCents: 1n, feesCents: 0n, taxWithheldCents: 0n } }));
  await assert.rejects(db().investmentTransaction.create({ data: { userId: a.userId, accountId: a.account.id, instrumentId: a.instrument.id, type: "COUPON", tradeDate: new Date("2026-11-01"), ordinal: 1, amountCents: 1n, feesCents: 1n, taxWithheldCents: 0n } }));
});

test("type change racing transaction create leaves a valid account relationship", async () => {
  const { userId, account, instrument } = await fixture();
  const results = await Promise.allSettled([
    createTransaction(userId, buy(account.id, instrument.id)),
    updateAccount(userId, account.id, { type: "CHECKING" }),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  const stored = await db().account.findUniqueOrThrow({ where: { userId_id: { userId, id: account.id } } });
  const count = await db().investmentTransaction.count({ where: { userId, accountId: account.id } });
  assert.equal(stored.type === "BROKERAGE" ? count : 0, count);
});

test("quotes and restored history reject values over the holding cap; decimal and income validation", async () => {
  const { userId, account, instrument } = await fixture();
  await createTransaction(userId, buy(account.id, instrument.id));
  await rejects(recordQuote(userId, { instrumentId: instrument.id, asOf: "2026-11-03", unitPrice: "1000000001" }), 422, "value_out_of_range");
  const quote = await recordQuote(userId, { instrumentId: instrument.id, asOf: "2026-11-03", unitPrice: "70" });
  assert.equal((await getPortfolio(userId)).valueCents, 70_000);
  await deleteQuote(userId, quote.id);
  assert.equal((await getPortfolio(userId)).holdings[0].noPrice, true);
  await rejects(createTransaction(userId, buy(account.id, instrument.id, { quantity: "0.00000000001" })), 422);
  await rejects(createTransaction(userId, buy(account.id, instrument.id, { type: "COUPON", quantity: null, feesCents: 1 })), 422);
  await rejects(createTransaction(userId, buy(account.id, instrument.id, { amountCents: 100_000_000_001 })), 422, "value_out_of_range");
});

test("10,000 maximum-size dividends remain exact, count voided rows, and reject transaction 10,001", async () => {
  const { userId, account, instrument } = await fixture();
  // Sequential batches stay below PostgreSQL's bind limit without adapter query queueing.
  for (let offset = 0; offset < 10_000; offset += 500) {
    await admin.investmentTransaction.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
      userId, accountId: account.id, instrumentId: instrument.id, type: "DIVIDEND" as const,
      tradeDate: new Date("2026-11-02"), ordinal: offset + index + 1,
      amountCents: 100_000_000_000n, feesCents: 0n, taxWithheldCents: 0n,
    })) });
  }
  assert.deepEqual((await getPortfolio(userId, new Date("2026-11-20T12:00:00Z"))).income, { grossCents: 1_000_000_000_000_000, netCents: 1_000_000_000_000_000 });
  await rejects(createTransaction(userId, buy(account.id, instrument.id)), 422, "transaction_limit");
  const [first] = await listTransactions(userId);
  await updateTransaction(userId, first.id, { voided: true });
  await rejects(createTransaction(userId, buy(account.id, instrument.id)), 422, "transaction_limit");
});

test("new executions allocate max-plus-one ordinals including voided rows; edits explicitly reorder", async () => {
  const { userId, account, instrument } = await fixture();
  const first = await createTransaction(userId, buy(account.id, instrument.id));
  await updateTransaction(userId, first.id, { voided: true });
  const second = await createTransaction(userId, buy(account.id, instrument.id));
  assert.equal(first.ordinal, 1);
  assert.equal(second.ordinal, 2);
  await rejects(createTransaction(userId, buy(account.id, instrument.id, { ordinal: 50 })), 422, "validation");
  assert.equal((await updateTransaction(userId, second.id, { ordinal: 10 })).ordinal, 10);
  assert.equal((await createTransaction(userId, buy(account.id, instrument.id))).ordinal, 11);
});

test("instrument quota is serialized across concurrent creates and counts archived instruments", async () => {
  const { userId } = await fixture();
  await admin.instrument.createMany({ data: Array.from({ length: 998 }, (_, index) => ({ userId, name: `Synthetic ${index}`, kind: "OTHER" as const, archivedAt: new Date() })) });
  const results = await Promise.allSettled(["A", "B"].map((name) => createInstrument(userId, { name, kind: "STOCK" })));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.find((row) => row.status === "rejected")!.reason.code, "instrument_limit");
  assert.equal(await db().instrument.count({ where: { userId } }), 1000);
});

test("authenticated API maps account incompatibility to 409 and decimal limits to 422 without bigint JSON", async () => {
  const { userId, account, instrument } = await fixture();
  await createTransaction(userId, buy(account.id, instrument.id));
  const token = newToken();
  await db().session.create({ data: { userId, tokenDigest: digestToken(token)!, expiresAt: new Date(Date.now() + 60_000) } });
  const origin = process.env.APP_ORIGIN!;
  const accountHandler = api(async ({ userId, body }) => updateAccount(userId, account.id, await body()));
  const transactionHandler = api(async ({ userId, body }) => createTransaction(userId, await body()));
  const request = (body: unknown) => new NextRequest(`${origin}/api/investments/test`, {
    method: "PATCH", headers: { origin, cookie: `${sessionCookie}=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const context = { params: Promise.resolve({}) };
  const blocked = await accountHandler(request({ type: "CASH" }), context);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, "investment_account");
  const overflow = await transactionHandler(request(buy(account.id, instrument.id, { quantity: "0.00000000001" })), context);
  assert.equal(overflow.status, 422);
  assert.equal((await overflow.json()).error, "value_out_of_range");
  const valid = await transactionHandler(request(buy(account.id, instrument.id)), context);
  assert.equal(valid.status, 200);
  assert.equal(typeof (await valid.json()).amountCents, "number");
});

test("quote ownership, raw amount constraints, kind-based historical estimates and restore valuation are protected", async () => {
  const a = await fixture(), b = await fixture();
  const row = await createTransaction(a.userId, buy(a.account.id, a.instrument.id, { quantity: "1000000000000", amountCents: 1 }));
  await recordQuote(a.userId, { instrumentId: a.instrument.id, asOf: "2026-11-02", unitPrice: "0.01" });
  await updateTransaction(a.userId, row.id, { voided: true });
  const quote = await recordQuote(a.userId, { instrumentId: a.instrument.id, asOf: "2026-11-02", unitPrice: "0.02" });
  await rejects(updateTransaction(a.userId, row.id, { voided: false }), 422, "value_out_of_range");
  await rejects(deleteQuote(b.userId, quote.id), 404);
  await rejects(recordQuote(b.userId, { instrumentId: a.instrument.id, asOf: "2026-11-02", unitPrice: "1" }), 404);
  const trade = { userId: b.userId, accountId: b.account.id, instrumentId: b.instrument.id, type: "BUY" as const, tradeDate: new Date("2026-11-01"), ordinal: 1, quantity: "1", amountCents: 100_000_000_001n, feesCents: 0n, taxWithheldCents: 0n };
  await assert.rejects(db().investmentTransaction.create({ data: trade }));
  await createTransaction(b.userId, buy(b.account.id, b.instrument.id, { quantity: "1", amountCents: 1000 }));
  await createTransaction(b.userId, buy(b.account.id, b.instrument.id, { type: "SELL", tradeDate: "2026-11-03", quantity: "1", amountCents: 2000 }));
  assert.equal((await getPortfolio(b.userId)).tax[0].taxCents, 260);
  await updateInstrument(b.userId, b.instrument.id, { kind: "IT_GOV_BOND" });
  assert.equal((await getPortfolio(b.userId)).tax[0].taxCents, 125);
});

test("deductions never exceed the gross amount, in the service and in the database", async () => {
  const { userId, account, instrument } = await fixture();
  const income = (extra: object) => buy(account.id, instrument.id, { type: "DIVIDEND", quantity: null, amountCents: 1_000, ...extra });
  await rejects(createTransaction(userId, income({ taxWithheldCents: 5_000 })), 422, "validation");
  await rejects(createTransaction(userId, buy(account.id, instrument.id, { type: "SELL", amountCents: 100, feesCents: 60, taxWithheldCents: 60 })), 422, "validation");
  await createTransaction(userId, income({ taxWithheldCents: 1_000 }));
  await createTransaction(userId, buy(account.id, instrument.id));
  await createTransaction(userId, buy(account.id, instrument.id, { type: "SELL", quantity: "1", amountCents: 100, feesCents: 40, taxWithheldCents: 60 }));
  // Raw inserts bypass the service: only the CHECK constraints can refuse them. `ok` is the positive control.
  const raw = (type: string, quantity: string | null, fees: number, tax: number) => admin.$executeRaw`
    INSERT INTO stead_investment_transactions (transaction_id, user_id, account_id, instrument_id, type, trade_date, ordinal, quantity, amount_cents, fees_cents, tax_withheld_cents)
    VALUES (gen_random_uuid(), ${userId}::uuid, ${account.id}::uuid, ${instrument.id}::uuid, ${type}::stead_investment_transaction_type, DATE '2026-11-05', 99, ${quantity}::numeric, 100, ${fees}, ${tax})`;
  await raw("DIVIDEND", null, 0, 100);
  await raw("SELL", "1", 40, 60);
  await assert.rejects(raw("DIVIDEND", null, 0, 101), /stead_investment_transactions_income_tax_check/);
  await assert.rejects(raw("SELL", "1", 60, 60), /stead_investment_transactions_sell_deductions_check/);
});

test("moving a transaction to another date or instrument puts it last unless an ordinal is given; DTOs omit internal columns", async () => {
  const { userId, account, instrument } = await fixture();
  const other = await createInstrument(userId, { name: "Second synthetic ETF", kind: "ETF" });
  assert.deepEqual(Object.keys(other).sort(), ["archived", "id", "isin", "kind", "name", "symbol"]);
  assert.equal("userId" in (await updateInstrument(userId, other.id, { symbol: "SYN" })), false);
  const first = await createTransaction(userId, buy(account.id, instrument.id));
  await createTransaction(userId, buy(account.id, instrument.id, { tradeDate: "2026-11-03" }));
  const moved = await updateTransaction(userId, first.id, { tradeDate: "2026-11-03" });
  assert.equal(moved.ordinal, 2);
  const reassigned = await updateTransaction(userId, first.id, { instrumentId: other.id });
  assert.equal(reassigned.ordinal, 1);
  assert.equal((await updateTransaction(userId, first.id, { amountCents: 61_000 })).ordinal, 1);
  const quote = await recordQuote(userId, { instrumentId: instrument.id, asOf: "2026-11-10", unitPrice: "1.5" });
  assert.deepEqual(Object.keys(quote).sort(), ["asOf", "id", "instrumentId", "unitPrice"]);
  assert.equal("userId" in (await listQuotes(userId))[0], false);
});

test("net worth exposes holdings so account rows plus holdings add up to the total", async () => {
  const { userId, account, instrument } = await fixture();
  await recordCheck(userId, { accountId: account.id, asOf: "2026-11-01", balanceCents: 100_000 });
  await createTransaction(userId, buy(account.id, instrument.id));
  const worth = await getNetWorth(userId, new Date("2026-11-20T12:00:00Z"));
  assert.equal(worth.holdingsCents, 60_000);
  assert.equal(worth.perAccount[0].balanceCents + worth.holdingsCents, worth.netCents);
});
