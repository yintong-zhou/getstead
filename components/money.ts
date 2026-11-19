// Euro text to and from integer cents, without floating point. Pure, so it is unit tested.

import type { Locale } from "../server/locale.ts";
import { MAX_CENTS } from "../server/cash-flow/money.ts";

/**
 * Euros typed by a person ("12,50", "12.5", "7") to positive integer cents. Returns null for
 * anything that is not a plain positive amount within the server's supported maximum.
 */
export function parseEuros(text: string): number | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Like parseEuros, but zero is allowed (a budget limit of nothing). */
export function parseLimit(text: string): number | null {
  return /^0+(?:[.,]0{1,2})?$/.test(text.trim()) ? 0 : parseEuros(text);
}

/** Cents as an editable euro string using the locale's decimal separator. */
export function editableEuros(cents: number, locale: Locale) {
  const value = Math.abs(cents);
  return `${Math.floor(value / 100)}${locale === "it" ? "," : "."}${String(value % 100).padStart(2, "0")}`;
}
