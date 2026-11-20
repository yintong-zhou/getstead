import { localeTags, type Locale } from "../../server/locale.ts";

export function parseInvestmentEuros(text: string): number | null {
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents <= 100_000_000_000n ? Number(cents) : null;
}

export function parsePositiveDecimal(text: string, scale: 8 | 10): string | null {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(text.trim());
  if (!match) return null;
  const whole = match[1].replace(/^0+/, "");
  const fraction = match[2] ?? "";
  if (whole.length > (scale === 10 ? 18 : 10) || fraction.length > scale) return null;
  const significant = fraction.replace(/0+$/, "");
  if (!whole && !significant) return null;
  return significant ? `${whole || "0"}.${significant}` : whole;
}

/** Non-negative decimal string to a locale display string, rounded half-up to `maxScale` places (the exact value stays in the API). */
export function formatDecimal(value: string, locale: Locale, currency = false, maxScale = 8): string {
  const [whole, fraction = ""] = value.split(".");
  let scaled = BigInt(whole + fraction.padEnd(maxScale, "0").slice(0, maxScale));
  if (fraction.length > maxScale && fraction[maxScale] >= "5") scaled += 1n;
  const unit = 10n ** BigInt(maxScale);
  const integer = new Intl.NumberFormat(localeTags[locale], { useGrouping: "always" }).format(scaled / unit);
  const digits = (maxScale ? String(scaled % unit).padStart(maxScale, "0") : "").replace(/0+$/, "").padEnd(currency ? 2 : 0, "0");
  const formatted = digits ? `${integer}${locale === "it" ? "," : "."}${digits}` : integer;
  return currency ? `€${locale === "it" ? " " : ""}${formatted}` : formatted;
}

/** Send the ordinal only when the owner changed it, so the server can place a moved row last in its new day. */
export function ordinalPatch(entered: string, stored: number | undefined): { ordinal?: number } {
  const ordinal = Number(entered);
  return stored === undefined || ordinal === stored ? {} : { ordinal };
}
