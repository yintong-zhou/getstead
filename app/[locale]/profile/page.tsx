import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { profileCopy } from "@/components/profile/copy";
import { ProfileView } from "@/components/profile/profile-view";
import { readPageUser } from "@/server/auth/page-access";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${profileCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser();
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/profile" />;
  const copy = profileCopy[locale];
  return <AppShell locale={locale} current="profile" title={copy.title} subtitle={copy.intro} profile={user.profile}>
    <ProfileView locale={locale} profile={user.profile} />
  </AppShell>;
}
