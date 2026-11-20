// Pure property arithmetic. Money is integer cents and every sum runs in bigint; `toSafeCents`
// (shared with investments) is the only way back into numbers, so an overflow becomes a typed
// 422 instead of a silently wrong total.

import { toSafeCents } from "../investments/calc.ts";
import type { IsoDate } from "../cash-flow/dates.ts";

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
