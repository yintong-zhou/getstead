// Date-only arithmetic. Movement dates are calendar dates ("YYYY-MM-DD") with no time zone;
// only "today" and "the current month" depend on Europe/Rome.

export type IsoDate = string;
export type Month = string;

const romeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Europe/Rome at the given instant. */
export function romeToday(now = new Date()): IsoDate {
  const parts = Object.fromEntries(romeParts.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

export function parseIsoDate(value: unknown): IsoDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/** The booking range the database accepts; months outside it are rejected, never queried. */
export const FIRST_MONTH: Month = "2000-01";
export const LAST_MONTH: Month = "2100-12";

export function parseMonth(value: unknown): Month | null {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && parseIsoDate(`${value}-01`) &&
    value >= FIRST_MONTH && value <= LAST_MONTH
    ? value
    : null;
}

/** Date columns are read and written as UTC midnight. */
export function toDate(date: IsoDate) {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function monthStart(month: Month): IsoDate {
  return `${month}-01`;
}

export function addMonths(month: Month, count: number): Month {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function addDays(date: IsoDate, count: number): IsoDate {
  return fromDate(new Date(toDate(date).getTime() + count * 86_400_000));
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

export type Recurrence = { frequency: "WEEKLY" | "MONTHLY" | "YEARLY"; startDate: IsoDate; endDate?: IsoDate | null };

/**
 * The k-th occurrence, always computed from the anchor date so a clamped day (31 January becomes
 * 28 February) returns to the anchor day afterwards.
 */
function occurrence({ frequency, startDate }: Recurrence, index: number): IsoDate {
  if (frequency === "WEEKLY") return addDays(startDate, index * 7);

  const [year, month, day] = startDate.split("-").map(Number);
  const [targetYear, targetMonth] = frequency === "MONTHLY"
    ? addMonths(`${year}-${String(month).padStart(2, "0")}`, index).split("-").map(Number)
    : [year + index, month];
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** Occurrences from the start date through `until` (inclusive), bounded by the optional end date. */
export function occurrencesThrough(rule: Recurrence, until: IsoDate, limit = 5_000): IsoDate[] {
  const result: IsoDate[] = [];
  for (let index = 0; index < limit; index++) {
    const date = occurrence(rule, index);
    if (date > until || (rule.endDate && date > rule.endDate)) break;
    result.push(date);
  }
  return result;
}

/** The first occurrence strictly after `date`, or null once the end date has passed. */
export function nextOccurrenceAfter(rule: Recurrence, date: IsoDate, limit = 5_000): IsoDate | null {
  for (let index = 0; index < limit; index++) {
    const candidate = occurrence(rule, index);
    if (rule.endDate && candidate > rule.endDate) return null;
    if (candidate > date) return candidate;
  }
  return null;
}

export function isOccurrence(rule: Recurrence, date: IsoDate) {
  return occurrencesThrough(rule, date).at(-1) === date;
}
