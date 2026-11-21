import type { MetadataRoute } from "next";
import { appOrigin } from "@/server/auth/config";
import { locales } from "@/server/locale";

/** Signed-in screens: nothing to index. The sign-in pages stay crawlable on purpose, so their noindex tag can be read. */
const privateSections = ["overview", "cash-flow", "budget", "recurring", "accounts", "net-worth", "investments", "property", "profile", "admin"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...locales.flatMap((locale) => privateSections.map((section) => `/${locale}/${section}`))],
    }],
    sitemap: `${appOrigin().origin}/sitemap.xml`,
  };
}
