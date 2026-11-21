import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { landingCopy } from "@/components/landing/copy";
import { isLocale, locales } from "@/server/locale";

export const runtime = "nodejs";
export const alt = "getstead, a personal finance tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ponytail: satori cannot read the app's woff2 font, so the card uses its default sans. Add a ttf of Plus Jakarta Sans to public/fonts to match the brand exactly.
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const mark = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/brand/getstead-mark.png"))).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: "linear-gradient(135deg, #1b2b5e 0%, #2f5bea 100%)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain elements, next/image does not apply */}
          <img src={mark} width={72} height={72} alt="" />
          <div style={{ fontSize: 44, fontWeight: 800 }}>getstead</div>
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>{landingCopy[locale].hero.title}</div>
      </div>
    ),
    size,
  );
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
