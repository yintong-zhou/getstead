import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { investmentsCopy } from "@/components/investments/copy";
import { TransactionHistory } from "@/components/investments/transaction-history";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts } from "@/server/cash-flow/catalog";
import { romeToday } from "@/server/cash-flow/dates";
import { listInstruments, listTransactionsPage } from "@/server/investments/service";
import { TRANSACTIONS_HISTORY, parseTransactionQuery, transactionHistoryHref } from "@/server/investments/transaction-query";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: investmentsCopy[locale].transactionHistory, robots: { index: false } };
}

export default async function TransactionHistoryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path={TRANSACTIONS_HISTORY} />;

  const query = parseTransactionQuery(await searchParams);
  let data;
  try {
    const [instruments, accounts, results] = await Promise.all([
      listInstruments(user.userId), listAccounts(user.userId, true), listTransactionsPage(user.userId, query),
    ]);
    data = { ...results, instruments, accounts: accounts.filter((account) => account.type === "BROKERAGE" || account.type === "CRYPTO") };
  } catch {
    return <UnavailableNotice locale={locale} path={TRANSACTIONS_HISTORY} />;
  }

  const href = transactionHistoryHref(locale, query);
  return <AppShell locale={locale} current="investments" routePath={TRANSACTIONS_HISTORY} title={investmentsCopy[locale].transactionHistory}
    query={href.slice(`/${locale}${TRANSACTIONS_HISTORY}`.length)} profile={user.profile}>
    <TransactionHistory locale={locale} query={query} today={romeToday()} {...data} />
  </AppShell>;
}
