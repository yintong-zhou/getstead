import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { landingCopy } from "@/components/landing/copy";
import { appOrigin } from "@/server/auth/config";
import { isLocale, locales } from "@/server/locale";
import { landingAlternates, landingJsonLd } from "@/server/seo";

// Public and static: this page reads no cookies or headers, so each language is prerendered at build time.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = landingCopy[locale];
  const title = `${copy.metaTitle} | getstead`;

  return {
    title: { absolute: title },
    description: copy.metaDescription,
    alternates: landingAlternates(locale, ""),
    openGraph: {
      type: "website",
      siteName: "getstead",
      title,
      description: copy.metaDescription,
      url: `/${locale}`,
      locale: locale === "it" ? "it_IT" : "en_GB",
      alternateLocale: locales.filter((other) => other !== locale).map((other) => (other === "it" ? "it_IT" : "en_GB")),
    },
    twitter: { card: "summary_large_image", title, description: copy.metaDescription },
  };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Landing locale={locale} jsonLd={landingJsonLd(locale, appOrigin().origin)} />;
}
