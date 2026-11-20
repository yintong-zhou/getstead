import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { propertyCopy } from "@/components/property/copy";
import { PropertyView } from "@/components/property/property-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts } from "@/server/cash-flow/catalog";
import { isLocale } from "@/server/locale";
import { getOverview } from "@/server/property/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${propertyCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function PropertyPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser();
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/property" />;

  let loaded;
  try {
    const [data, accounts] = await Promise.all([getOverview(user.userId), listAccounts(user.userId, true)]);
    loaded = { data, accounts };
  } catch {
    return <UnavailableNotice locale={locale} path="/property" />;
  }

  const copy = propertyCopy[locale];
  return <AppShell locale={locale} current="property" title={copy.title} subtitle={copy.intro} profile={user.profile}>
    <PropertyView locale={locale} {...loaded} />
  </AppShell>;
}
