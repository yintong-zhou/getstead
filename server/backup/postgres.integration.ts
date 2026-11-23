// Round trip of a backup against the disposable local test database, synthetic users only.
// Services run through DATABASE_URL (the runtime role, so the grants are exercised); users are
// created through DATABASE_ADMIN_URL.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { getPortfolio } from "../investments/service.ts";
import { getNetWorth } from "../net-worth/service.ts";
import { exportBackup } from "./export.ts";
import { importBackup } from "./import.ts";
import { TABLES } from "./tables.ts";

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
    data: { email: `backup-${randomUUID()}@example.test`, passwordHash: "synthetic-not-a-password-hash" },
    select: { id: true },
  });
  return user.id;
}

/** A synthetic backup with at least one row in every table. */
function fullBackup() {
  const id = new Proxy({} as Record<string, string>, { get: (cache, name: string) => (cache[name] ??= randomUUID()) });
  const at = "2026-11-01T09:30:00.123Z";
  const account = (key: string, name: string, type: string, customTypeId: string | null = null) =>
    ({ id: id[key], name, type, customTypeId, archivedAt: null, createdAt: at });
  const movement = (key: string, accountId: string, bookingDate: string, amountCents: number, extra: Record<string, unknown> = {}) => ({
    id: id[key], accountId, categoryId: null, bookingDate, description: `Synthetic ${key}`, amountCents,
    voidedAt: null, transferId: null, transferLeg: null, createdAt: at, ...extra,
  });
  return {
    format: "getstead-backup", version: 1, exportedAt: at,
    data: {
      customAccountTypes: [{ id: id.fund, name: "Synthetic fund", baseType: "PENSION", archivedAt: null, createdAt: at }],
      categories: [
        { id: id.food, name: "Synthetic food", kind: "EXPENSE", archivedAt: null, createdAt: at },
        { id: id.condo, name: "Synthetic condo", kind: "EXPENSE", archivedAt: "2026-11-02T08:00:00.000Z", createdAt: at },
      ],
      transfers: [{ id: id.transfer, createdAt: at }],
      instruments: [{ id: id.etf, name: "Synthetic ETF", symbol: "SYN", isin: null, kind: "ETF",
        marketSymbol: "SYN.MI", marketName: "Synthetic ETF", marketCurrency: "EUR", archivedAt: null }],
      accounts: [
        account("checking", "Synthetic checking", "CHECKING"), account("broker", "Synthetic broker", "BROKERAGE"),
        account("loan", "Synthetic mortgage", "DEBT"), account("pension", "Synthetic pension", "PENSION", id.fund),
      ],
      balanceChecks: [{ id: id.check, accountId: id.checking, asOf: "2026-10-31", balanceCents: 500_000, createdAt: at }],
      categoryRules: [{ id: id.rule, phrase: "synthetic grocer", categoryId: id.food, createdAt: at }],
      budgetLimits: [{ id: id.limit, categoryId: id.food, month: "2026-11-01", kind: "BASE", limitCents: 30_000 }],
      properties: [{ id: id.flat, name: "Synthetic flat", kind: "PRIMARY_RESIDENCE", ownershipBps: 5_000,
        mortgageAccountId: id.loan, soldOn: null, archivedAt: null }],
      recurringTemplates: [{ id: id.instalment, accountId: id.checking, categoryId: id.condo, description: "Synthetic instalment",
        amountCents: 15_000, frequency: "MONTHLY", startDate: "2026-01-15", endDate: null, archivedAt: null, createdAt: at }],
      movements: [
        movement("out", id.checking, "2026-11-02", -100_000, { transferId: id.transfer, transferLeg: "OUT" }),
        movement("in", id.broker, "2026-11-02", 100_000, { transferId: id.transfer, transferLeg: "IN" }),
        movement("groceries", id.checking, "2026-11-04", -2_550, { categoryId: id.food }),
        movement("voided", id.checking, "2026-11-05", -999, { voidedAt: "2026-11-06T07:00:00.000Z" }),
        movement("paid", id.checking, "2026-11-15", -15_000, { categoryId: id.condo }),
        movement("settled", id.checking, "2026-11-20", -40_000),
      ],
      investmentTransactions: [
        { id: id.buy, accountId: id.broker, instrumentId: id.etf, type: "BUY", tradeDate: "2026-11-03", ordinal: 1,
          quantity: "10.5", amountCents: 99_750, feesCents: 250, taxWithheldCents: 0, voidedAt: null },
        { id: id.dividend, accountId: id.broker, instrumentId: id.etf, type: "DIVIDEND", tradeDate: "2026-11-10", ordinal: 1,
          quantity: null, amountCents: 500, feesCents: 0, taxWithheldCents: 130, voidedAt: null },
      ],
      priceQuotes: [{ id: id.quote, instrumentId: id.etf, asOf: "2026-11-05", unitPrice: "101.5" }],
      marketPriceQuotes: [{ instrumentId: id.etf, asOf: "2026-11-06", unitPrice: "102.25", currency: "EUR", fxRate: null, fxAsOf: null }],
      propertyValuations: [{ id: id.valuation, propertyId: id.flat, asOf: "2026-01-01", valueCents: 25_000_000 }],
      condoTables: [{ id: id.general, propertyId: id.flat, label: "General", unitMillesimi: 120, totalMillesimi: 1_000 }],
      condoSchedules: [{ id: id.schedule, propertyId: id.flat, templateId: id.instalment }],
      recurringOccurrences: [
        { id: id.confirmed, templateId: id.instalment, dueDate: "2026-11-15", status: "CONFIRMED", movementId: id.paid, createdAt: at },
        { id: id.skipped, templateId: id.instalment, dueDate: "2026-10-15", status: "SKIPPED", movementId: null, createdAt: at },
      ],
      condoCharges: [{ id: id.charge, propertyId: id.flat, kind: "BALANCING", title: "Synthetic balancing", dueDate: "2026-11-20",
        amountCents: 40_000, approvedOn: null, tableId: id.general, buildingTotalCents: 333_334, voidedAt: null, movementId: id.settled }],
    },
  };
}

/** Replaces every id by its table and position, so two exports of the same data compare equal. */
function normalize(backup: Awaited<ReturnType<typeof exportBackup>>) {
  const names = new Map<string, string>();
  for (const { key } of TABLES) backup.data[key].forEach((row, index) => { if (row.id) names.set(row.id as string, `${key}#${index}`); });
  const data = JSON.parse(JSON.stringify(backup.data), (_key, value) => typeof value === "string" && names.has(value) ? names.get(value) : value);
  return data;
}

async function rejectsApi(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error) => error instanceof ApiError && error.status === status && error.code === code);
}

test("a backup restores every table into a new account and exports back identically", async () => {
  const [source, target] = [await newUser(), await newUser()];
  const counts = await importBackup(source, fullBackup());
  for (const { key } of TABLES) assert.ok(counts[key] > 0, `the fixture covers ${key}`);

  const first = await exportBackup(source);
  assert.deepEqual(first.data.condoCharges[0].title, "Synthetic balancing", "encrypted text is exported in clear");
  await importBackup(target, JSON.parse(JSON.stringify(first)));
  const second = await exportBackup(target);
  assert.deepEqual(normalize(second), normalize(first));

  // The app reads the restored data exactly like the original (ids aside).
  const now = new Date("2026-11-30T12:00:00Z");
  const strip = (value: unknown) => JSON.parse(JSON.stringify(value), (key, inner) => key === "id" || key.endsWith("Id") ? undefined : inner);
  assert.deepEqual(strip(await getNetWorth(target, now)), strip(await getNetWorth(source, now)));
  assert.deepEqual(strip(await getPortfolio(target, now)), strip(await getPortfolio(source, now)));
});

test("backup round trips an archived charge after its millesimal table was deleted", async () => {
  const source = await newUser();
  const target = await newUser();
  await importBackup(source, fullBackup());
  await db().condoTable.deleteMany({ where: { userId: source } });
  const first = await exportBackup(source);
  assert.equal(first.data.condoTables.length, 0);
  assert.equal(typeof first.data.condoCharges[0].tableId, "string");
  await importBackup(target, first);
  const second = await exportBackup(target);
  assert.deepEqual(normalize(second), normalize(first));
});

test("a backup only restores into an empty account and never half-writes", async () => {
  const userId = await newUser();
  await importBackup(userId, fullBackup());
  const before = await db().movement.count({ where: { userId } });
  await rejectsApi(importBackup(userId, fullBackup()), 409, "backup_not_empty");
  assert.equal(await db().movement.count({ where: { userId } }), before);

  const empty = await newUser();
  const broken = fullBackup();
  broken.data.condoTables[0].unitMillesimi = 2_000; // above the table total: only the database knows
  await rejectsApi(importBackup(empty, broken), 422, "backup_invalid");
  assert.equal(await db().account.count({ where: { userId: empty } }), 0, "the transaction rolled back");
});
