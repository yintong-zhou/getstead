import type { ReactNode } from "react";
import { formatEuros, type Locale } from "@/server/locale";

/**
 * `formatEuros` for JSX. The text is identical, but a leading "+" or "−" sits in its own span so CSS
 * can lift it onto the figures' centre line (see `.sign` in globals.css). Plain strings (aria labels,
 * template literals) keep using `formatEuros`.
 */
export function euros(cents: number, locale: Locale, options?: Parameters<typeof formatEuros>[2]): ReactNode {
  return signedText(formatEuros(cents, locale, options));
}

export function signedText(text: string): ReactNode {
  return text[0] === "+" || text[0] === "−" || text[0] === "-" ? <><span className="sign">{text[0]}</span>{text.slice(1)}</> : text;
}
