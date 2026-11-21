import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { Dashboard } from "@/components/dashboard";
import { dashboardCopy } from "@/components/dashboard-copy";
import { readPageUser } from "@/server/auth/page-access";
import { getDashboard } from "@/server/cash-flow/dashboard";
import { isLocale } from "@/server/locale";

// Session cookies are read per request, so this page is never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = dashboardCopy[locale];
  return { title: `${copy.overview} | getstead`, description: copy.description, robots: { index: false } };
}

export default async function Overview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/overview" />;

  let data;
  try {
    data = await getDashboard(user.userId);
  } catch {
    return <UnavailableNotice locale={locale} path="/overview" />;
  }
  return <Dashboard locale={locale} data={data} profile={user.profile} />;
}
