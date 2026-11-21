import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { dashboardCopy } from "@/components/dashboard-copy";
import { glassBootstrap } from "@/components/profile/appearance";
import { isLocale, locales } from "@/server/locale";
import "../globals.css";

const plusJakarta = localFont({
  src: "../../public/fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 800",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

type LocaleParams = { params: Promise<{ locale: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const copy = dashboardCopy[locale];
  return {
    title: `${copy.overview} | getstead`,
    description: copy.description,
  };
}

export default async function RootLayout({ children, params }: LocaleParams & { children: ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} className={plusJakarta.className} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: glassBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
