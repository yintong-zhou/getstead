import { landingCopy } from "../components/landing/copy.ts";
import { locales, type Locale } from "./locale.ts";

/** Public pages that search engines may index, as paths after the language segment. */
export const publicPaths = ["", "/privacy"] as const;

/** Canonical and hreflang links for a public page; `x-default` points at English. */
export function landingAlternates(locale: Locale, path: (typeof publicPaths)[number]) {
  return {
    canonical: `/${locale}${path}`,
    languages: { ...Object.fromEntries(locales.map((code) => [code, `/${code}${path}`])), "x-default": `/en${path}` },
  };
}

/** WebSite and SoftwareApplication as one JSON-LD graph. No rating, price or review: none exists. */
export function landingJsonLd(locale: Locale, origin: string) {
  const copy = landingCopy[locale];
  const url = `${origin}/${locale}`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${origin}/#website`, name: "getstead", url, inLanguage: locale },
      {
        "@type": "SoftwareApplication",
        name: "getstead",
        url,
        description: copy.metaDescription,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        inLanguage: locale,
      },
    ],
  };
  // "<" is escaped so the text can never close the script element.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
