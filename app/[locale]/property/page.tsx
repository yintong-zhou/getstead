import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { propertyCopy } from "@/components/property/copy";
import { PropertyView } from "@/components/property/property-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts } from "@/server/cash-flow/catalog";
import { isLocale } from "@/server/locale";
import { getBills } from "@/server/property/bills";
import { getCosts, getOverview, parseCostQuery } from "@/server/property/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ year?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${propertyCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function PropertyPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/property" />;

  const { year } = await searchParams;
  const query = new URLSearchParams();
  if (typeof year === "string") query.set("year", year);
  let loaded;
  try {
    // An invalid ?year= falls back to the current year instead of failing the page.
    let costQuery;
    try { costQuery = parseCostQuery(query); } catch { costQuery = parseCostQuery(new URLSearchParams()); }
    // One year selector drives condominium costs and utility bills together.
    const [data, accounts, costs, bills] = await Promise.all([
      getOverview(user.userId), listAccounts(user.userId, true), getCosts(user.userId, costQuery), getBills(user.userId, costQuery),
    ]);
    loaded = { data, accounts, costs, bills };
  } catch {
    return <UnavailableNotice locale={locale} path="/property" />;
  }

  const copy = propertyCopy[locale];
  return <AppShell locale={locale} current="property" title={copy.title} subtitle={copy.intro} profile={user.profile}>
    <PropertyView locale={locale} {...loaded} />
  </AppShell>;
}
