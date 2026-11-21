import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { netWorthCopy } from "@/components/net-worth/copy";
import { NetWorthView } from "@/components/net-worth/net-worth-view";
import { readPageUser } from "@/server/auth/page-access";
import { getNetWorth, listChecks } from "@/server/net-worth/service";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${netWorthCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function NetWorthPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/net-worth" />;
  let loaded;
  try {
    const [data, checks] = await Promise.all([getNetWorth(user.userId), listChecks(user.userId)]);
    loaded = { data, checks };
  } catch {
    return <UnavailableNotice locale={locale} path="/net-worth" />;
  }
  const copy = netWorthCopy[locale];
  return <AppShell locale={locale} current="net-worth" title={copy.title} subtitle={copy.intro} profile={user.profile}>
    <NetWorthView locale={locale} {...loaded} />
  </AppShell>;
}
