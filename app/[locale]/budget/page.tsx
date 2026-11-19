import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { BudgetView } from "@/components/cash-flow/budget-view";
import { cashFlowCopy } from "@/components/cash-flow/copy";
import { readPageUser } from "@/server/auth/page-access";
import { getBudget } from "@/server/cash-flow/budget";
import { monthOf, parseMonth, romeToday } from "@/server/cash-flow/dates";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ month?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${cashFlowCopy[locale].budgetTitle} | Stead`, robots: { index: false } };
}

export default async function BudgetPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser();
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/budget" />;

  const currentMonth = monthOf(romeToday());
  const month = parseMonth((await searchParams).month) ?? currentMonth;
  let budget;
  try {
    budget = await getBudget(user.userId, month);
  } catch {
    return <UnavailableNotice locale={locale} path="/budget" />;
  }

  const copy = cashFlowCopy[locale];
  return (
    <AppShell locale={locale} current="budget" title={copy.budgetTitle} subtitle={copy.budgetIntro} query={`?month=${month}`}>
      <BudgetView locale={locale} month={month} currentMonth={currentMonth} rows={budget.rows} />
    </AppShell>
  );
}
