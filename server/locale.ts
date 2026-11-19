export const locales = ["en", "it"] as const;
export type Locale = (typeof locales)[number];

export const localeTags = { en: "en-GB", it: "it-IT" };

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

type AmountOptions = { showPlus?: boolean; wholeEuros?: boolean };

export function formatEuros(cents: number, locale: Locale, options: AmountOptions = {}) {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Expected integer cents.");

  const amount = BigInt(Math.abs(cents));
  const whole = options.wholeEuros ? (amount + 50n) / 100n : amount / 100n;
  const digits = new Intl.NumberFormat(localeTags[locale], { useGrouping: "always" }).format(whole);
  const fractionalDigits = String(amount % 100n).padStart(2, "0");
  const decimal = locale === "it" ? "," : ".";
  const space = locale === "it" ? "\u00a0" : "";
  const sign = cents < 0 ? "−" : options.showPlus && cents > 0 ? "+" : "";

  return sign + "€" + space + digits + (options.wholeEuros ? "" : decimal + fractionalDigits);
}
