import type { MetadataRoute } from "next";
import { appOrigin } from "@/server/auth/config";
import { locales } from "@/server/locale";
import { publicPaths } from "@/server/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin().origin;
  return publicPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      alternates: {
        languages: { ...Object.fromEntries(locales.map((code) => [code, `${origin}/${code}${path}`])), "x-default": `${origin}/en${path}` },
      },
    })),
  );
}
