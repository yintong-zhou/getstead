// Pure property arithmetic. Money is integer cents and every sum runs in bigint; `toSafeCents`
// (shared with investments) is the only way back into numbers, so an overflow becomes a typed
// 422 instead of a silently wrong total.

import { toSafeCents } from "../investments/calc.ts";
import { occurrencesThrough, type IsoDate, type Recurrence } from "../cash-flow/dates.ts";

export const propertyKinds = ["PRIMARY_RESIDENCE", "SECOND_HOME", "RENTAL", "LAND", "OTHER"] as const;
export const chargeKinds = ["BALANCING", "EXTRAORDINARY"] as const;

export type Property = { id: string; ownershipBps: number; soldOn: IsoDate | null };
export type Valuation = { propertyId: string; asOf: IsoDate; valueCents: number };

/** Latest valuation on or before `date`, or null. The input order does not matter. */
export function valueAt(valuations: readonly Valuation[], propertyId: string, date: IsoDate): number | null {
  let latest: Valuation | undefined;
  for (const row of valuations) {
    if (row.propertyId === propertyId && row.asOf <= date && (!latest || row.asOf > latest.asOf)) latest = row;
  }
  return latest ? latest.valueCents : null;
}

/** Owner's share of a value: round-half-up(value * bps / 10000), exact in bigint. */
export function shareValueCents(valueCents: number, ownershipBps: number): bigint {
  return (BigInt(valueCents) * BigInt(ownershipBps) * 2n + 10_000n) / 20_000n;
}

/** A property counts for the dates before its sale date; with no valuation it counts as 0 and is flagged. */
export function propertiesAt(properties: readonly Property[], valuations: readonly Valuation[], date: IsoDate) {
  let total = 0n;
  const rows = properties.map((property) => {
    if (property.soldOn !== null && property.soldOn <= date) return { id: property.id, shareValueCents: 0, valueCents: null, noValuation: false };
    const valueCents = valueAt(valuations, property.id, date);
    const share = valueCents === null ? 0n : shareValueCents(valueCents, property.ownershipBps);
    total += share;
    return { id: property.id, shareValueCents: toSafeCents(share), valueCents, noValuation: valueCents === null };
  });
  return { rows, totalCents: toSafeCents(total) };
}

/** The owner's part of a building-wide amount: round-half-up(total * unit / building total). */
export function millesimiShareCents(totalCents: number, unitMillesimi: number, totalMillesimi: number): number {
  const divisor = BigInt(totalMillesimi);
  return toSafeCents((BigInt(totalCents) * BigInt(unitMillesimi) * 2n + divisor) / (divisor * 2n));
}

/** Voting weight at an assembly: unit / total, shown as a percentage with at most two decimals. */
export function votingWeight(unit: number, total: number) {
  const hundredths = (BigInt(unit) * 20_000n + BigInt(total)) / (BigInt(total) * 2n);
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return { unit, total, percent: fraction ? `${whole}.${fraction}` : whole.toString() };
}

/** Value share minus the debt balance. A debt account balance is negative, so equity adds it. */
export function equityCents(shareValue: number, debtBalanceCents: number): number {
  return toSafeCents(BigInt(shareValue) + BigInt(debtBalanceCents));
}

// ---------------------------------------------------------------- costs (M4b)

export type CostKind = "ORDINARY" | "EXTRAORDINARY" | "BALANCING";
/** A settled cost: `cents` is positive (what left the account), `date` is the movement's booking date. */
export type PaidCost = { kind: CostKind; cents: number; date: IsoDate };
export type PendingCharge = { cents: number; dueDate: IsoDate };
/** An instalment schedule: `resolved` holds the due dates Recurring has confirmed, matched or skipped. */
export type CostSchedule = { rule: Recurrence; amountCents: number; archived: boolean; resolved: ReadonlySet<IsoDate> };

export type CostTotals = {
  paidOrdinary: bigint; paidExtraordinary: bigint; paidBalancing: bigint; paidTotal: bigint;
  pendingCharges: bigint; overdueOrdinary: bigint; forecastOrdinary: bigint; expectedTotal: bigint;
};
const ZERO: CostTotals = { paidOrdinary: 0n, paidExtraordinary: 0n, paidBalancing: 0n, paidTotal: 0n, pendingCharges: 0n, overdueOrdinary: 0n, forecastOrdinary: 0n, expectedTotal: 0n };

/**
 * Costs of one property in one calendar year, in bigint cents.
 * - paid: settled costs by booking date; pending charges by due date, unsettled and not voided;
 * - unresolved instalments of active schedules in the year, priced at the schedule amount: due before
 *   `today` they are overdue (never dropped), from `today` on they are forecast.
 */
export function propertyCosts(input: { year: number; today: IsoDate; paid: readonly PaidCost[]; pending: readonly PendingCharge[]; schedules: readonly CostSchedule[] }): CostTotals {
  const first = `${input.year}-01-01`, last = `${input.year}-12-31`;
  const inYear = (date: IsoDate) => date >= first && date <= last;
  const totals = { ...ZERO };
  for (const row of input.paid) {
    if (!inYear(row.date)) continue;
    const cents = BigInt(row.cents);
    if (row.kind === "ORDINARY") totals.paidOrdinary += cents;
    else if (row.kind === "EXTRAORDINARY") totals.paidExtraordinary += cents;
    else totals.paidBalancing += cents;
  }
  for (const row of input.pending) if (inYear(row.dueDate)) totals.pendingCharges += BigInt(row.cents);
  for (const schedule of input.schedules) {
    if (schedule.archived) continue;
    for (const date of occurrencesThrough(schedule.rule, last)) {
      if (date < first || schedule.resolved.has(date)) continue;
      if (date < input.today) totals.overdueOrdinary += BigInt(schedule.amountCents);
      else totals.forecastOrdinary += BigInt(schedule.amountCents);
    }
  }
  totals.paidTotal = totals.paidOrdinary + totals.paidExtraordinary + totals.paidBalancing;
  totals.expectedTotal = totals.paidTotal + totals.pendingCharges + totals.overdueOrdinary + totals.forecastOrdinary;
  return totals;
}

export function addCosts(a: CostTotals, b: CostTotals): CostTotals {
  return Object.fromEntries(Object.keys(ZERO).map((key) => [key, a[key as keyof CostTotals] + b[key as keyof CostTotals]])) as CostTotals;
}
export const emptyCosts = (): CostTotals => ({ ...ZERO });

/** Back to numbers; an overflow is the typed `value_out_of_range`, never a wrong total. */
export function costsToNumbers(totals: CostTotals) {
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, toSafeCents(value)])) as Record<keyof CostTotals, number>;
}
