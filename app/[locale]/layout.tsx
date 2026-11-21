import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { glassBootstrap } from "@/components/profile/appearance";
import { appOrigin } from "@/server/auth/config";
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

// Pages set their own title; the layout only supplies the site origin that relative URLs resolve against.
export function generateMetadata(): Metadata {
  return { metadataBase: appOrigin(), title: "getstead" };
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
