import { randomUUID } from "node:crypto";
import { db } from "../auth/database.ts";
import { fromDate, romeToday, toDate } from "../cash-flow/dates.ts";
import { ApiError, conflict } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import { monthlySeries, netWorthAt } from "./calc.ts";
import { quoteInput, transactionInput } from "../investments/service.ts";
import { toSafeCents } from "../investments/calc.ts";

const checkSelect = { id: true, accountId: true, asOf: true, balanceCents: true } as const;
const RECENT_CHECK_LIMIT = 100;
const checkDto = (row: { id: string; accountId: string; asOf: Date; balanceCents: number }) => ({ ...row, asOf: fromDate(row.asOf) });

export async function listChecks(userId: string) {
  const rows = await db().balanceCheck.findMany({
    where: { userId }, select: checkSelect, orderBy: [{ asOf: "desc" }, { id: "desc" }], take: RECENT_CHECK_LIMIT,
  });
  return rows.map(checkDto);
}

export async function recordCheck(userId: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const accountId = reader.uuid("accountId");
  const asOf = reader.date("asOf");
  const balanceCents = reader.signedCents("balanceCents");
  reader.done();
  if (asOf > romeToday(now)) throw new ApiError(422, "validation", "asOf");
  try {
    // One atomic upsert (INSERT ... ON CONFLICT), so a concurrent delete cannot turn a valid request into a 404.
    // A row that carries the id we generated was created by this call; any other id means it was replaced.
    const id = randomUUID();
    const row = await db().balanceCheck.upsert({
      where: { userId_accountId_asOf: { userId, accountId, asOf: toDate(asOf) } },
      create: { id, userId, accountId, asOf: toDate(asOf), balanceCents },
      update: { balanceCents }, select: checkSelect,
    });
    return { check: checkDto(row), created: row.id === id };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2003") throw conflict();
    throw error;
  }
}

export async function deleteCheck(userId: string, id: string) {
  await db().balanceCheck.delete({ where: { userId_id: { userId, id } } });
}

export type NetWorthData = Awaited<ReturnType<typeof getNetWorth>>;
export type CheckDto = Awaited<ReturnType<typeof listChecks>>[number];

export async function getNetWorth(userId: string, now = new Date()) {
  const today = romeToday(now);
  const [accounts, checks, rows, instruments, transactions, quotes, propertyRows, valuationRows] = await db().$transaction([
    db().account.findMany({
      where: { userId }, select: { id: true, name: true, type: true, archivedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db().balanceCheck.findMany({ where: { userId, asOf: { lte: toDate(today) } }, select: checkSelect }),
    db().movement.findMany({
      where: { userId, voidedAt: null, bookingDate: { lte: toDate(today) } },
      select: { accountId: true, bookingDate: true, amountCents: true },
    }),
    db().instrument.findMany({ where: { userId } }),
    db().investmentTransaction.findMany({ where: { userId, tradeDate: { lte: toDate(today) } } }),
    db().priceQuote.findMany({ where: { userId, asOf: { lte: toDate(today) } } }),
    db().property.findMany({ where: { userId }, select: { id: true, ownershipBps: true, soldOn: true } }),
    db().propertyValuation.findMany({ where: { userId, asOf: { lte: toDate(today) } }, select: { propertyId: true, asOf: true, valueCents: true } }),
  ], { isolationLevel: "RepeatableRead" });
  const datedChecks = checks.map(checkDto);
  const movements = rows.map((row) => ({ ...row, bookingDate: fromDate(row.bookingDate) }));
  const investments = { instruments, transactions: transactions.map(transactionInput), quotes: quotes.map(quoteInput) };
  const realEstate = {
    properties: propertyRows.map((row) => ({ id: row.id, ownershipBps: row.ownershipBps, soldOn: row.soldOn ? fromDate(row.soldOn) : null })),
    valuations: valuationRows.map((row) => ({ propertyId: row.propertyId, asOf: fromDate(row.asOf), valueCents: Number(row.valueCents) })),
  };
  const totals = netWorthAt(accounts, datedChecks, movements, today, investments, realEstate);
  const series = monthlySeries(accounts, datedChecks, movements, today, investments, realEstate);
  const balances = new Map(totals.perAccount.map((row) => [row.accountId, row.balanceCents]));
  return {
    today,
    assetsCents: totals.assetsCents, liabilitiesCents: totals.liabilitiesCents, netCents: totals.netCents,
    holdingsCents: totals.holdingsCents,
    propertiesCents: totals.propertiesCents,
    changeCents: toSafeCents(BigInt(totals.netCents) - BigInt(series.at(-2)!.netCents)),
    perAccount: accounts.map((account) => ({
      id: account.id, name: account.name, type: account.type, archived: account.archivedAt !== null,
      balanceCents: balances.get(account.id)!,
      lastCheckDate: datedChecks.filter((check) => check.accountId === account.id).map((check) => check.asOf).sort().at(-1) ?? null,
    })),
    series,
  };
}
