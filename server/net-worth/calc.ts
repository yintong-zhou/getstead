import { addDays, addMonths, monthOf, monthStart, type IsoDate } from "../cash-flow/dates.ts";

export type Check = { accountId: string; asOf: IsoDate; balanceCents: number };
export type Movement = { accountId: string; bookingDate: IsoDate; amountCents: number; voidedAt?: Date | null };
type Account = { id: string };

/** Inputs belong to one account. A check includes every movement on its own calendar date. */
export function balanceAt(checks: readonly Check[], movements: readonly Movement[], date: IsoDate): number {
  let latest: Check | undefined;
  for (const check of checks) {
    if (check.asOf <= date && (!latest || check.asOf > latest.asOf)) latest = check;
  }
  return movements.reduce((balance, movement) =>
    !movement.voidedAt && movement.bookingDate <= date && (!latest || movement.bookingDate > latest.asOf)
      ? balance + movement.amountCents : balance, latest?.balanceCents ?? 0);
}

export function netWorthAt(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], date: IsoDate) {
  const perAccount = accounts.map(({ id }) => ({
    accountId: id,
    balanceCents: balanceAt(checks.filter((check) => check.accountId === id), movements.filter((movement) => movement.accountId === id), date),
  }));
  const assetsCents = perAccount.reduce((sum, { balanceCents }) => sum + Math.max(0, balanceCents), 0);
  const liabilitiesCents = perAccount.reduce((sum, { balanceCents }) => sum + Math.max(0, -balanceCents), 0);
  return { assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents, perAccount };
}

/** Historical months use their last calendar day; the current month stops at today. */
export function monthlySeries(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], today: IsoDate) {
  const current = monthOf(today);
  return Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(current, index - 11);
    const date = index === 11 ? today : addDays(monthStart(addMonths(month, 1)), -1);
    const { assetsCents, liabilitiesCents, netCents } = netWorthAt(accounts, checks, movements, date);
    return { month, netCents, assetsCents, liabilitiesCents };
  });
}
