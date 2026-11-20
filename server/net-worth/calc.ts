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
  const grouped = new Map(accounts.map(({ id }) => [id, {
    checks: [] as Check[], movements: [] as Movement[], checkIndex: 0, movementIndex: 0,
    latest: undefined as Check | undefined, balance: 0,
  }]));
  for (const check of checks) grouped.get(check.accountId)?.checks.push(check);
  for (const movement of movements) {
    if (!movement.voidedAt) grouped.get(movement.accountId)?.movements.push(movement);
  }
  for (const group of grouped.values()) {
    group.checks.sort((a, b) => a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0);
    group.movements.sort((a, b) => a.bookingDate < b.bookingDate ? -1 : a.bookingDate > b.bookingDate ? 1 : 0);
  }
  const current = monthOf(today);
  return Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(current, index - 11);
    const date = index === 11 ? today : addDays(monthStart(addMonths(month, 1)), -1);
    let assetsCents = 0;
    let liabilitiesCents = 0;
    for (const { id } of accounts) {
      const group = grouped.get(id)!;
      while (group.checkIndex < group.checks.length && group.checks[group.checkIndex].asOf <= date) {
        const check = group.checks[group.checkIndex++];
        // Stable sorting preserves balanceAt's first-check-wins rule for equal dates.
        if (!group.latest || check.asOf > group.latest.asOf) {
          group.latest = check;
          group.balance = check.balanceCents;
        }
      }
      while (group.movementIndex < group.movements.length && group.movements[group.movementIndex].bookingDate <= date) {
        const movement = group.movements[group.movementIndex++];
        if (!group.latest || movement.bookingDate > group.latest.asOf) group.balance += movement.amountCents;
      }
      assetsCents += Math.max(0, group.balance);
      liabilitiesCents += Math.max(0, -group.balance);
    }
    return { month, netCents: assetsCents - liabilitiesCents, assetsCents, liabilitiesCents };
  });
}
