import { addDays, addMonths, monthOf, monthStart, type IsoDate } from "../cash-flow/dates.ts";
import { cashEffects, holdingsValue, toSafeCents, type Instrument, type Transaction, type Quote } from "../investments/calc.ts";

export type Check = { accountId: string; asOf: IsoDate; balanceCents: number };
export type Movement = { accountId: string; bookingDate: IsoDate; amountCents: number; voidedAt?: Date | null };
type Account = { id: string };
export type Investments = { instruments: readonly Instrument[]; transactions: readonly Transaction[]; quotes: readonly Quote[] };
const emptyInvestments: Investments = { instruments: [], transactions: [], quotes: [] };
const holdingCents = (investments: Investments, date: IsoDate) => holdingsValue(investments.instruments, investments.transactions, investments.quotes, date)
  .reduce((sum, row) => sum + BigInt(row.valueCents), 0n);

/** Inputs belong to one account. A check includes every movement on its own calendar date. */
export function balanceAt(checks: readonly Check[], movements: readonly Movement[], date: IsoDate, effects: readonly Movement[] = []): number {
  let latest: Check | undefined;
  for (const check of checks) {
    if (check.asOf <= date && (!latest || check.asOf > latest.asOf)) latest = check;
  }
  return toSafeCents([...movements, ...effects].reduce((balance, movement) =>
    !movement.voidedAt && movement.bookingDate <= date && (!latest || movement.bookingDate > latest.asOf)
      ? balance + BigInt(movement.amountCents) : balance, BigInt(latest?.balanceCents ?? 0)));
}

export function netWorthAt(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], date: IsoDate, investments: Investments = emptyInvestments) {
  const effects = cashEffects(investments.transactions);
  const perAccount = accounts.map(({ id }) => ({
    accountId: id,
    balanceCents: balanceAt(checks.filter((check) => check.accountId === id), movements.filter((movement) => movement.accountId === id), date, effects.filter((row) => row.accountId === id)),
  }));
  const holdings = holdingCents(investments, date);
  const assets = perAccount.reduce((sum, { balanceCents }) => sum + BigInt(Math.max(0, balanceCents)), holdings);
  const liabilities = perAccount.reduce((sum, { balanceCents }) => sum + BigInt(Math.max(0, -balanceCents)), 0n);
  return { holdingsCents: toSafeCents(holdings), assetsCents: toSafeCents(assets), liabilitiesCents: toSafeCents(liabilities), netCents: toSafeCents(assets - liabilities), perAccount };
}

/** Historical months use their last calendar day; the current month stops at today. */
export function monthlySeries(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], today: IsoDate, investments: Investments = emptyInvestments) {
  const grouped = new Map(accounts.map(({ id }) => [id, {
    checks: [] as Check[], movements: [] as Movement[], checkIndex: 0, movementIndex: 0,
    latest: undefined as Check | undefined, balance: 0n,
  }]));
  for (const check of checks) grouped.get(check.accountId)?.checks.push(check);
  for (const movement of [...movements, ...cashEffects(investments.transactions)]) {
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
    let assetsCents = holdingCents(investments, date);
    let liabilitiesCents = 0n;
    for (const { id } of accounts) {
      const group = grouped.get(id)!;
      while (group.checkIndex < group.checks.length && group.checks[group.checkIndex].asOf <= date) {
        const check = group.checks[group.checkIndex++];
        // Stable sorting preserves balanceAt's first-check-wins rule for equal dates.
        if (!group.latest || check.asOf > group.latest.asOf) {
          group.latest = check;
          group.balance = BigInt(check.balanceCents);
        }
      }
      while (group.movementIndex < group.movements.length && group.movements[group.movementIndex].bookingDate <= date) {
        const movement = group.movements[group.movementIndex++];
        if (!group.latest || movement.bookingDate > group.latest.asOf) group.balance += BigInt(movement.amountCents);
      }
      if (group.balance > 0n) assetsCents += group.balance;
      else liabilitiesCents -= group.balance;
    }
    return { month, netCents: toSafeCents(assetsCents - liabilitiesCents), assetsCents: toSafeCents(assetsCents), liabilitiesCents: toSafeCents(liabilitiesCents) };
  });
}
