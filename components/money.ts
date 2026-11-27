// Euro text to and from integer cents, without floating point. Pure, so it is unit tested.

import type { Locale } from "../server/locale.ts";
import { MAX_CENTS } from "../server/cash-flow/money.ts";

const MAX_AMOUNT_INPUT_LENGTH = 128;

export function resolveAmountExpression(text: string, scale: 2 | 8): string | null {
  if (text.length > MAX_AMOUNT_INPUT_LENGTH) return null;
  if (!/[+-]/.test(text)) return text;

  const tokens = text.trim().split(/\s*([+-])\s*/);
  const unit = 10n ** BigInt(scale);
  let total = 0n;
  for (let index = 0; index < tokens.length; index += 2) {
    const operand = /^(\d+)(?:[.,](\d+))?$/.exec(tokens[index]);
    if (!operand) return null;
    const fraction = operand[2] ?? "";
    if (fraction.length > scale) return null;
    const scaled = BigInt(operand[1] + fraction.padEnd(scale, "0"));
    total += tokens[index - 1] === "-" ? -scaled : scaled;
  }
  const magnitude = total < 0n ? -total : total;
  const fraction = String(magnitude % unit).padStart(scale, "0").replace(/0+$/, "");
  const whole = String(magnitude / unit);
  return (total < 0n ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

/**
 * A euro amount or expression to positive integer cents within the server's supported maximum.
 */
export function parseEuros(text: string): number | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(resolveAmountExpression(text, 2)?.trim() ?? "");
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Like parseEuros, but zero is allowed (a budget limit of nothing). */
export function parseLimit(text: string): number | null {
  const resolved = resolveAmountExpression(text, 2);
  if (resolved === null) return null;
  return /^0+(?:[.,]0{1,2})?$/.test(resolved.trim()) ? 0 : parseEuros(resolved);
}

/** Cents as an editable euro string using the locale's decimal separator. */
export function editableEuros(cents: number, locale: Locale) {
  const value = Math.abs(cents);
  return `${Math.floor(value / 100)}${locale === "it" ? "," : "."}${String(value % 100).padStart(2, "0")}`;
}

/** A fixed mask does not disclose the number of digits in an amount. */
export function privateAmount(value: string, hidden: boolean) {
  return hidden ? "******" : value;
}
