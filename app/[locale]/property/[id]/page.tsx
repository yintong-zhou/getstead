import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { propertyCopy } from "@/components/property/copy";
import { PropertyDetail } from "@/components/property/property-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts } from "@/server/cash-flow/catalog";
import { isUuid } from "@/server/cash-flow/validate";
import { isLocale } from "@/server/locale";
import { getBills } from "@/server/property/bills";
import { getContracts } from "@/server/property/contracts";
import { getCosts, getOverview, parseCostQuery } from "@/server/property/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ year?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${propertyCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function PropertyDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isUuid(id)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path={`/property/${id}`} />;

  const { year } = await searchParams;
  const query = new URLSearchParams();
  if (typeof year === "string") query.set("year", year);
  let costQuery;
  try { costQuery = parseCostQuery(query); } catch { costQuery = parseCostQuery(new URLSearchParams()); }

  let loaded;
  try {
    const [data, accounts, costs, contracts, bills] = await Promise.all([
      getOverview(user.userId), listAccounts(user.userId, true), getCosts(user.userId, costQuery), getContracts(user.userId), getBills(user.userId, costQuery),
    ]);
    const property = data.properties.find((row) => row.id === id.toLowerCase());
    loaded = { property, accounts, today: data.today, year: costs.year, cost: costs.properties.find((row) => row.propertyId === property?.id),
      contracts: contracts.filter((row) => row.propertyId === property?.id), bills: bills.bills.filter((row) => row.propertyId === property?.id) };
  } catch {
    return <UnavailableNotice locale={locale} path={`/property/${id}`} />;
  }
  if (!loaded.property) notFound();

  return <AppShell locale={locale} current="property" title={propertyCopy[locale].title} profile={user.profile}>
    <PropertyDetail locale={locale} {...loaded} property={loaded.property} />
  </AppShell>;
}
