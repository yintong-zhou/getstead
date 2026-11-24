import { addMonths, addDays } from "@/server/cash-flow/dates";
import { localeTags, type Locale } from "@/server/locale";

export { addMonths };

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "November 2026" or "Nov". */
export function formatMonth(month: string, locale: Locale, style: "short" | "long" = "long") {
  return new Intl.DateTimeFormat(localeTags[locale], {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(utc(`${month}-01`));
}

/** "22 Nov"; today and yesterday use words when the labels are given. */
export function formatDay(date: string, locale: Locale, today?: string, words?: { today: string; yesterday: string }) {
  if (today && words) {
    if (date === today) return words.today;
    if (date === addDays(today, -1)) return words.yesterday;
  }
  return new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short", timeZone: "UTC" }).format(utc(date));
}

/** "22 Nov 2026". */
export function formatDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(utc(date));
}

export { editableEuros, parseEuros } from "./money";
