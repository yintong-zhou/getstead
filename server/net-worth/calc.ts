import { addDays, addMonths, monthOf, monthStart, type IsoDate } from "../cash-flow/dates.ts";
import { cashEffects, holdingsValue, toSafeCents, type Instrument, type Transaction, type Quote } from "../investments/calc.ts";
import { propertiesAt, type Property, type Valuation } from "../property/calc.ts";
import type { TrendPoint } from "../trend.ts";

export type Check = { accountId: string; asOf: IsoDate; balanceCents: number };
export type Movement = { accountId: string; bookingDate: IsoDate; amountCents: number; voidedAt?: Date | null };
type Account = { id: string };
export type Investments = { instruments: readonly Instrument[]; transactions: readonly Transaction[]; quotes: readonly Quote[] };
const emptyInvestments: Investments = { instruments: [], transactions: [], quotes: [] };
export type Properties = { properties: readonly Property[]; valuations: readonly Valuation[] };
const emptyProperties: Properties = { properties: [], valuations: [] };
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

export function netWorthAt(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], date: IsoDate, investments: Investments = emptyInvestments, realEstate: Properties = emptyProperties) {
  const effects = cashEffects(investments.transactions);
  const perAccount = accounts.map(({ id }) => ({
    accountId: id,
    balanceCents: balanceAt(checks.filter((check) => check.accountId === id), movements.filter((movement) => movement.accountId === id), date, effects.filter((row) => row.accountId === id)),
  }));
  const holdings = holdingCents(investments, date);
  const properties = BigInt(propertiesAt(realEstate.properties, realEstate.valuations, date).totalCents);
  const assets = perAccount.reduce((sum, { balanceCents }) => sum + BigInt(Math.max(0, balanceCents)), holdings + properties);
  const liabilities = perAccount.reduce((sum, { balanceCents }) => sum + BigInt(Math.max(0, -balanceCents)), 0n);
  return { holdingsCents: toSafeCents(holdings), propertiesCents: toSafeCents(properties), assetsCents: toSafeCents(assets), liabilitiesCents: toSafeCents(liabilities), netCents: toSafeCents(assets - liabilities), perAccount };
}

const investmentAccounts = new Set(["CRYPTO"]);
/**
 * Gross assets in five groups, by the same rule as netWorthAt: an account with a positive balance is an asset,
 * a negative one a liability, so the groups always add up to assetsCents. Uninvested cash on a brokerage account
 * counts as cash, so the investments group matches the holdings shown on the investments card.
 * Savings (deposit and interest-bearing accounts) are liquid but not pure cash, so they get their own group.
 */
export function assetSplit(perAccount: readonly { type: string; balanceCents: number }[], holdingsCents: number, propertiesCents: number) {
  let liquidity = 0n, savings = 0n, investments = BigInt(holdingsCents), pension = 0n;
  for (const { type, balanceCents } of perAccount) {
    if (balanceCents <= 0) continue;
    if (type === "PENSION") pension += BigInt(balanceCents);
    else if (type === "SAVINGS") savings += BigInt(balanceCents);
    else if (investmentAccounts.has(type)) investments += BigInt(balanceCents);
    else liquidity += BigInt(balanceCents);
  }
  return { liquidityCents: toSafeCents(liquidity), savingsCents: toSafeCents(savings), investmentsCents: toSafeCents(investments), pensionCents: toSafeCents(pension), propertyCents: propertiesCents };
}

/** Totals at each date in one forward pass over checks and movements. `dates` must be ascending. */
export function seriesAt(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], dates: readonly IsoDate[], investments: Investments = emptyInvestments, realEstate: Properties = emptyProperties) {
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
  return dates.map((date) => {
    let assetsCents = holdingCents(investments, date) + BigInt(propertiesAt(realEstate.properties, realEstate.valuations, date).totalCents);
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
    return { date, netCents: toSafeCents(assetsCents - liabilitiesCents), assetsCents: toSafeCents(assetsCents), liabilitiesCents: toSafeCents(liabilitiesCents) };
  });
}

/** Historical months use their last calendar day; the current month stops at today. */
export function monthlySeries(accounts: readonly Account[], checks: readonly Check[], movements: readonly Movement[], today: IsoDate, investments: Investments = emptyInvestments, realEstate: Properties = emptyProperties) {
  const months = Array.from({ length: 12 }, (_, index) => addMonths(monthOf(today), index - 11));
  const dates = months.map((month, index) => index === 11 ? today : addDays(monthStart(addMonths(month, 1)), -1));
  return seriesAt(accounts, checks, movements, dates, investments, realEstate)
    .map(({ netCents, assetsCents, liabilitiesCents }, index) => ({ month: months[index], netCents, assetsCents, liabilitiesCents }));
}

/** Net worth performance is its change since the first date, measured against the first value. */
export function netWorthTrend(series: readonly { date: IsoDate; netCents: number }[]): TrendPoint[] {
  const first = series[0]?.netCents ?? 0;
  return series.map(({ date, netCents }) => ({
    date, valueCents: netCents, gainCents: toSafeCents(BigInt(netCents) - BigInt(first)), baseCents: Math.max(0, first),
  }));
}
