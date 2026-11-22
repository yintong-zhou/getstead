import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { glassBootstrap, themeBootstrap } from "@/components/profile/appearance";
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

// Browser chrome color follows the device setting; it matches --bg in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export function generateMetadata(): Metadata {
  return {
    metadataBase: appOrigin(),
    title: "getstead",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "getstead" },
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export default async function RootLayout({ children, params }: LocaleParams & { children: ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} className={plusJakarta.className} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: glassBootstrap }} /><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
