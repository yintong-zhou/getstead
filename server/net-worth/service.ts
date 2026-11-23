import { randomUUID } from "node:crypto";
import { db } from "../auth/database.ts";
import { fromDate, romeToday, toDate } from "../cash-flow/dates.ts";
import { ApiError, conflict } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import type { AccountType } from "../../db/generated/client.ts";
import { balanceAt, monthlySeries, netWorthAt, netWorthTrend, seriesAt } from "./calc.ts";
import { buildTrend } from "../trend.ts";
import { marketQuoteInput, quoteInput, transactionInput } from "../investments/service.ts";
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

const accountSelect = { id: true, name: true, type: true, archivedAt: true, customType: { select: { name: true } } } as const;
type AccountRow = { id: string; name: string; type: AccountType; archivedAt: Date | null; customType: { name: string } | null };
/** `customTypeName` is the user's label for the account's type; null means the built-in (localized) label applies. */
function accountRow(account: AccountRow, balanceCents: number, checks: readonly { accountId: string; asOf: string }[]) {
  return {
    id: account.id, name: account.name, type: account.type, customTypeName: account.customType?.name ?? null,
    archived: account.archivedAt !== null, balanceCents,
    lastCheckDate: checks.filter((check) => check.accountId === account.id).map((check) => check.asOf).sort().at(-1) ?? null,
  };
}

/**
 * Pension accounts with their balance today and the date of their last balance check. They are ordinary asset accounts,
 * so net worth already counts them once through `balanceAt`; this read uses the same inputs, so both pages show one number.
 * They never take investment transactions, so no holding, performance or tax figure includes them.
 */
export async function listPensions(userId: string, now = new Date()) {
  const today = romeToday(now);
  const pension = { type: "PENSION" } as const;
  const [accounts, checks, rows] = await db().$transaction([
    db().account.findMany({ where: { userId, ...pension }, select: accountSelect, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().balanceCheck.findMany({ where: { userId, asOf: { lte: toDate(today) }, account: pension }, select: checkSelect }),
    db().movement.findMany({
      where: { userId, voidedAt: null, bookingDate: { lte: toDate(today) }, account: pension },
      select: { accountId: true, bookingDate: true, amountCents: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const datedChecks = checks.map(checkDto);
  const movements = rows.map((row) => ({ ...row, bookingDate: fromDate(row.bookingDate) }));
  return accounts.map((account) => accountRow(account, balanceAt(
    datedChecks.filter((check) => check.accountId === account.id), movements.filter((row) => row.accountId === account.id), today,
  ), datedChecks)).filter((row) => !row.archived || row.balanceCents !== 0);
}
export type PensionDto = Awaited<ReturnType<typeof listPensions>>[number];

/** `trend` adds the period chart; only the net worth page asks for it. */
export async function getNetWorth(userId: string, now = new Date(), { trend = false } = {}) {
  const today = romeToday(now);
  const [accounts, checks, rows, instruments, transactions, quotes, marketQuotes, propertyRows, valuationRows] = await db().$transaction([
    db().account.findMany({
      where: { userId }, select: accountSelect,
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
    db().marketPriceQuote.findMany({ where: { userId, asOf: { lte: toDate(today) } } }),
    db().property.findMany({ where: { userId }, select: { id: true, ownershipBps: true, soldOn: true } }),
    db().propertyValuation.findMany({ where: { userId, asOf: { lte: toDate(today) } }, select: { propertyId: true, asOf: true, valueCents: true } }),
  ], { isolationLevel: "RepeatableRead" });
  const datedChecks = checks.map(checkDto);
  const movements = rows.map((row) => ({ ...row, bookingDate: fromDate(row.bookingDate) }));
  const investments = { instruments, transactions: transactions.map(transactionInput),
    quotes: [...quotes.map(quoteInput), ...marketQuotes.map(marketQuoteInput)] };
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
    perAccount: accounts.map((account) => accountRow(account, balances.get(account.id)!, datedChecks)),
    series,
    // ponytail: recomputes every range on each page load; cache per user if large histories make it slow.
    trend: trend ? buildTrend(today, earliestDate(datedChecks.map((row) => row.asOf), movements.map((row) => row.bookingDate),
      investments.transactions.map((row) => row.tradeDate), realEstate.valuations.map((row) => row.asOf)),
    (dates) => netWorthTrend(seriesAt(accounts, datedChecks, movements, dates, investments, realEstate))) : undefined,
  };
}

function earliestDate(...lists: string[][]) {
  let earliest: string | null = null;
  for (const list of lists) for (const date of list) if (!earliest || date < earliest) earliest = date;
  return earliest;
}
