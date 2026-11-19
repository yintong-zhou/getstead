import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { cashFlowCopy } from "@/components/cash-flow/copy";
import { MovementsView } from "@/components/cash-flow/movements-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts, listCategories } from "@/server/cash-flow/catalog";
import { monthOf, parseMonth, romeToday } from "@/server/cash-flow/dates";
import { listMovementsPage } from "@/server/cash-flow/movements";
import { monthSummary } from "@/server/cash-flow/reports";
import { isUuid } from "@/server/cash-flow/validate";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; accountId?: string; categoryId?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${cashFlowCopy[locale].cashFlowTitle} | Stead`, robots: { index: false } };
}

export default async function CashFlowPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser();
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/cash-flow" />;

  const query = await searchParams;
  const today = romeToday();
  const month = parseMonth(query.month) ?? monthOf(today);
  const accountId = isUuid(query.accountId) ? query.accountId : undefined;
  const categoryId = query.categoryId === "none" || isUuid(query.categoryId) ? query.categoryId : undefined;
  const page = /^\d{1,5}$/.test(query.page ?? "") && Number(query.page) >= 1 ? Number(query.page) : 1;
  const filters = new URLSearchParams({ month });
  if (accountId) filters.set("accountId", accountId);
  if (categoryId) filters.set("categoryId", categoryId);
  if (page > 1) filters.set("page", String(page));

  let data;
  try {
    const [accounts, categories, register, summary] = await Promise.all([
      listAccounts(user.userId, true),
      listCategories(user.userId, true),
      listMovementsPage(user.userId, new URLSearchParams([...filters, ["page", String(page)]])),
      monthSummary(user.userId, month),
    ]);
    data = { accounts, categories, movements: register.movements, hasMore: register.hasMore, summary };
  } catch {
    return <UnavailableNotice locale={locale} path="/cash-flow" />;
  }

  const copy = cashFlowCopy[locale];
  return (
    <AppShell locale={locale} current="cash-flow" title={copy.cashFlowTitle} subtitle={copy.cashFlowIntro} query={`?${filters}`}>
      <MovementsView locale={locale} month={month} today={today} {...data} accountId={accountId} categoryId={categoryId} page={page} />
    </AppShell>
  );
}
