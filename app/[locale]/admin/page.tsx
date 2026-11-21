import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNav, AdminView } from "@/components/admin/admin-view";
import { parseUsersQuery, usersParams } from "@/components/admin/admin-query";
import { adminCopy } from "@/components/admin/copy";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { adminOverview, listUsers } from "@/server/admin/users";
import { readPageUser } from "@/server/auth/page-access";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/admin";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${adminCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function AdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path={PATH} />;
  // Non-admins are not told that the page exists.
  if (!user.profile.admin) notFound();

  const copy = adminCopy[locale];
  const shell = { locale, current: "admin", routePath: PATH, title: copy.title, subtitle: copy.intro, profile: user.profile } as const;
  if (!user.admin) {
    return <AppShell {...shell}>
      <section className="card"><p>{copy.needsTotp}</p><Link className="text-link" href={`/${locale}/profile`}>{copy.openProfile}</Link></section>
    </AppShell>;
  }

  const query = parseUsersQuery(await searchParams);
  let data;
  try {
    const [overview, list] = await Promise.all([adminOverview(), listUsers(usersParams(query))]);
    data = { overview, list };
  } catch {
    return <UnavailableNotice locale={locale} path={PATH} />;
  }
  const search = usersParams(query).toString();
  return <AppShell {...shell} query={search ? `?${search}` : ""}>
    <AdminNav locale={locale} current="users" />
    <AdminView locale={locale} selfId={user.userId} query={query} {...data} />
  </AppShell>;
}
