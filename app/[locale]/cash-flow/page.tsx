import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { cashFlowCopy } from "@/components/cash-flow/copy";
import { MovementsView } from "@/components/cash-flow/movements-view";
import { previewSize } from "@/components/cash-flow/movements-query";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts, listCategories } from "@/server/cash-flow/catalog";
import { getCashReporting } from "@/server/cash-flow/cash-settings";
import { monthOf, parseMonth, romeToday } from "@/server/cash-flow/dates";
import { listMovements } from "@/server/cash-flow/movements";
import { monthSummary } from "@/server/cash-flow/reports";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; show?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${cashFlowCopy[locale].cashFlowTitle} | getstead`, robots: { index: false } };
}

export default async function CashFlowPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/cash-flow" />;

  const query = await searchParams;
  const today = romeToday();
  const month = parseMonth(query.month) ?? monthOf(today);
  const show = previewSize(query.show);
  const recent = (direction: "in" | "out" | "transfers") => listMovements(user.userId, new URLSearchParams({ month, direction, limit: String(show) }));

  let data;
  try {
    const [accounts, categories, incoming, outgoing, transfers, summary, cashSettings] = await Promise.all([
      listAccounts(user.userId, true),
      listCategories(user.userId, true),
      recent("in"),
      recent("out"),
      recent("transfers"),
      monthSummary(user.userId, month),
      getCashReporting(user.userId),
    ]);
    data = { accounts, categories, incoming, outgoing, transfers, summary, excludeCash: cashSettings.excludeCash };
  } catch {
    return <UnavailableNotice locale={locale} path="/cash-flow" />;
  }

  const copy = cashFlowCopy[locale];
  return (
    <AppShell locale={locale} current="cash-flow" title={copy.cashFlowTitle} subtitle={copy.cashFlowIntro} query={`?month=${month}${show === 5 ? "&show=5" : ""}`} profile={user.profile}>
      <MovementsView locale={locale} month={month} today={today} {...data} show={show} />
    </AppShell>
  );
}
