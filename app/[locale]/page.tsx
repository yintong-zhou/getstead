import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { Dashboard } from "@/components/dashboard";
import { readPageUser } from "@/server/auth/page-access";
import { getDashboard } from "@/server/cash-flow/dashboard";
import { isLocale } from "@/server/locale";

// Session cookies are read per request, so this page is never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await readPageUser();
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="" />;

  let data;
  try {
    data = await getDashboard(user.userId);
  } catch {
    return <UnavailableNotice locale={locale} path="" />;
  }
  return <Dashboard locale={locale} data={data} />;
}
