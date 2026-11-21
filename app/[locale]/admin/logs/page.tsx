import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-view";
import { logsParams, parseLogsQuery } from "@/components/admin/admin-query";
import { adminCopy } from "@/components/admin/copy";
import { LogsView } from "@/components/admin/logs-view";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { listEvents } from "@/server/admin/logs";
import { readPageUser } from "@/server/auth/page-access";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/admin/logs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${adminCopy[locale].logs} | getstead`, robots: { index: false } };
}

export default async function AdminLogsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path={PATH} />;
  if (!user.profile.admin) notFound();

  const copy = adminCopy[locale];
  const shell = { locale, current: "admin", routePath: PATH, title: copy.title, subtitle: copy.intro, profile: user.profile } as const;
  if (!user.admin) {
    return <AppShell {...shell}>
      <section className="card"><p>{copy.needsTotp}</p><Link className="text-link" href={`/${locale}/profile`}>{copy.openProfile}</Link></section>
    </AppShell>;
  }

  const query = parseLogsQuery(await searchParams);
  let list;
  try {
    list = await listEvents(logsParams(query));
  } catch {
    return <UnavailableNotice locale={locale} path={PATH} />;
  }
  const search = logsParams(query).toString();
  return <AppShell {...shell} query={search ? `?${search}` : ""}>
    <AdminNav locale={locale} current="logs" />
    <LogsView locale={locale} query={query} list={list} />
  </AppShell>;
}
