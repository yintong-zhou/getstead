import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { profileCopy } from "@/components/profile/copy";
import { SettingsView } from "@/components/profile/settings-view";
import { readPageUser } from "@/server/auth/page-access";
import { getCashReporting } from "@/server/cash-flow/cash-settings";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${profileCopy[locale].settings} | getstead`, robots: { index: false } };
}

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale, { shared: true });
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/profile/settings" />;
  let excludeCash = false;
  try {
    if (!user.profile.admin) excludeCash = (await getCashReporting(user.userId)).excludeCash;
  } catch {
    return <UnavailableNotice locale={locale} path="/profile/settings" />;
  }
  const copy = profileCopy[locale];
  return <AppShell locale={locale} current="profile" routePath="/profile/settings" title={copy.settings} subtitle={copy.settingsIntro} profile={user.profile}>
    <SettingsView locale={locale} admin={user.profile.admin} excludeCash={excludeCash} />
  </AppShell>;
}
