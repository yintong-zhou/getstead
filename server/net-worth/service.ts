import { db } from "../auth/database.ts";
import { fromDate, romeToday, toDate } from "../cash-flow/dates.ts";
import { ApiError, conflict } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import { monthlySeries, netWorthAt } from "./calc.ts";

const checkSelect = { id: true, accountId: true, asOf: true, balanceCents: true } as const;
const checkDto = (row: { id: string; accountId: string; asOf: Date; balanceCents: number }) => ({ ...row, asOf: fromDate(row.asOf) });

export async function listChecks(userId: string) {
  const rows = await db().balanceCheck.findMany({
    where: { userId }, select: checkSelect, orderBy: [{ asOf: "desc" }, { id: "desc" }],
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
    return checkDto(await db().balanceCheck.upsert({
      where: { userId_accountId_asOf: { userId, accountId, asOf: toDate(asOf) } },
      create: { userId, accountId, asOf: toDate(asOf), balanceCents },
      update: { balanceCents }, select: checkSelect,
    }));
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
  const [accounts, checks, rows] = await db().$transaction([
    db().account.findMany({
      where: { userId }, select: { id: true, name: true, type: true, archivedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db().balanceCheck.findMany({ where: { userId, asOf: { lte: toDate(today) } }, select: checkSelect }),
    db().movement.findMany({
      where: { userId, voidedAt: null, bookingDate: { lte: toDate(today) } },
      select: { accountId: true, bookingDate: true, amountCents: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const datedChecks = checks.map(checkDto);
  const movements = rows.map((row) => ({ ...row, bookingDate: fromDate(row.bookingDate) }));
  const totals = netWorthAt(accounts, datedChecks, movements, today);
  const series = monthlySeries(accounts, datedChecks, movements, today);
  const balances = new Map(totals.perAccount.map((row) => [row.accountId, row.balanceCents]));
  return {
    today,
    assetsCents: totals.assetsCents, liabilitiesCents: totals.liabilitiesCents, netCents: totals.netCents,
    changeCents: totals.netCents - series.at(-2)!.netCents,
    perAccount: accounts.map((account) => ({
      id: account.id, name: account.name, type: account.type, archived: account.archivedAt !== null,
      balanceCents: balances.get(account.id)!,
      lastCheckDate: datedChecks.filter((check) => check.accountId === account.id).map((check) => check.asOf).sort().at(-1) ?? null,
    })),
    series,
  };
}
