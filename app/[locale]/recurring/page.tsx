import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { cashFlowCopy } from "@/components/cash-flow/copy";
import { RecurringView } from "@/components/cash-flow/recurring-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts, listCategories } from "@/server/cash-flow/catalog";
import { listRecurring } from "@/server/cash-flow/recurring";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${cashFlowCopy[locale].recurringTitle} | getstead`, robots: { index: false } };
}

export default async function RecurringPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/recurring" />;

  let data;
  try {
    const [accounts, categories, recurring] = await Promise.all([
      listAccounts(user.userId, true),
      listCategories(user.userId, true),
      listRecurring(user.userId, new URLSearchParams({ archived: "1" })),
    ]);
    data = { accounts, categories, recurring };
  } catch {
    return <UnavailableNotice locale={locale} path="/recurring" />;
  }

  const copy = cashFlowCopy[locale];
  const { recurring } = data;
  return (
    <AppShell locale={locale} current="recurring" title={copy.recurringTitle} subtitle={copy.recurringIntro} profile={user.profile}>
      <RecurringView
        locale={locale} today={recurring.today} accounts={data.accounts} categories={data.categories}
        templates={recurring.templates} due={recurring.due} upcoming={recurring.upcoming} skipped={recurring.skipped}
      />
    </AppShell>
  );
}
