import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { LogoutButton } from "@/components/auth/logout-button";
import { Dashboard } from "@/components/dashboard";
import { readPageSession } from "@/server/auth/page-access";
import { getDemoDashboard, isLocale } from "@/server/demo-dashboard";

// Session cookies are read per request, so this page is never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const session = await readPageSession();
  if (session === "anonymous") redirect(`/${locale}/login`);
  if (session === "unavailable") return <UnavailableNotice locale={locale} path="" />;

  return <Dashboard locale={locale} data={getDemoDashboard()} toolbar={<LogoutButton locale={locale} />} />;
}
