import { addDays, addMonthsToDate, toDate, type IsoDate } from "./cash-flow/dates.ts";

/** Period chart shared by net worth and investments: sampled dates per range, values computed by each service. */
export const trendRanges = ["1W", "1M", "3M", "YTD", "1Y", "MAX"] as const;
export type TrendRange = (typeof trendRanges)[number];
/**
 * `gainCents` is what counts as performance at that date and `baseCents` what it is measured against;
 * the client shows `gain - firstGain` and divides it by `base`.
 */
export type TrendPoint = { date: IsoDate; valueCents: number; gainCents: number; baseCents: number };
export type Trend = Record<TrendRange, TrendPoint[]>;

const MAX_POINTS = 120;

export function rangeStart(range: TrendRange, today: IsoDate, earliest: IsoDate | null): IsoDate {
  switch (range) {
    case "1W": return addDays(today, -7);
    case "1M": return addMonthsToDate(today, -1);
    case "3M": return addMonthsToDate(today, -3);
    // The baseline is the last day of the previous year, like the month-end points of the monthly series.
    case "YTD": return `${Number(today.slice(0, 4)) - 1}-12-31`;
    case "1Y": return addMonthsToDate(today, -12);
    case "MAX": return earliest && earliest < today ? earliest : addMonthsToDate(today, -12);
  }
}

/** Ascending dates from `start` to `today` inclusive: daily up to ~100 days, weekly up to ~a year, then at most MAX_POINTS. */
export function sampleDates(start: IsoDate, today: IsoDate): IsoDate[] {
  if (start >= today) return [today];
  const days = Math.round((toDate(today).getTime() - toDate(start).getTime()) / 86_400_000);
  const step = days <= 100 ? 1 : days <= 400 ? 7 : Math.ceil(days / MAX_POINTS);
  const dates: IsoDate[] = [];
  // Walk back from today so the latest point is always today.
  for (let offset = 0; offset < days; offset += step) dates.push(addDays(today, -offset));
  dates.push(start);
  return dates.reverse();
}

export function buildTrend(today: IsoDate, earliest: IsoDate | null, points: (dates: IsoDate[]) => TrendPoint[]): Trend {
  return Object.fromEntries(trendRanges.map((range) => [range, points(sampleDates(rangeStart(range, today, earliest), today))])) as Trend;
}
