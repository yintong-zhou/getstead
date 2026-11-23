// Form-side helpers for property: euros, and percentages, all in integers.

import { resolveAmountExpression } from "../money.ts";

/** A positive euro amount or expression within `maxCents`, in integer cents. */
export function parseEurosUpTo(text: string, maxCents: number): number | null {
  const match = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(resolveAmountExpression(text, 2)?.trim() ?? "");
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents > 0n && cents <= BigInt(maxCents) ? Number(cents) : null;
}
export const MAX_VALUE_CENTS = 1_000_000_000_000;
export const MAX_PAYABLE_CENTS = 1_000_000_000;

/** A percentage with up to two decimals ("50", "33,33") to basis points 1..10000, else null. */
export function parseOwnership(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return bps >= 1 && bps <= 10_000 ? bps : null;
}
export function ownershipText(bps: number, separator: "." | ",") {
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return `${Math.floor(bps / 100)}${fraction ? separator + fraction : ""}`;
}
