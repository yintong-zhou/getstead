import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { investmentsCopy } from "@/components/investments/copy";
import { InvestmentsView } from "@/components/investments/investments-view";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts } from "@/server/cash-flow/catalog";
import { getPortfolio, listInstruments, listQuotes, listTransactions } from "@/server/investments/service";
import { marketDataEnabled } from "@/server/investments/market-data";
import { isLocale } from "@/server/locale";
import { listPensions } from "@/server/net-worth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${investmentsCopy[locale].title} | getstead`, robots: { index: false } };
}

export default async function InvestmentsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/investments" />;

  let loaded;
  try {
    const [data, instruments, transactions, accounts, quotes, pensions] = await Promise.all([
      getPortfolio(user.userId, undefined, { trend: true }), listInstruments(user.userId), listTransactions(user.userId, 5),
      listAccounts(user.userId, true), listQuotes(user.userId), listPensions(user.userId),
    ]);
    loaded = { data, instruments, transactions, pensions, quotes: quotes.map(({ id, instrumentId, asOf, unitPrice }) => ({ id, instrumentId, asOf, unitPrice })),
      accounts: accounts.filter((account) => account.type === "BROKERAGE" || account.type === "CRYPTO") };
  } catch {
    return <UnavailableNotice locale={locale} path="/investments" />;
  }

  const copy = investmentsCopy[locale];
  return <AppShell locale={locale} current="investments" title={copy.title} subtitle={copy.intro} profile={user.profile}>
    <InvestmentsView locale={locale} marketEnabled={marketDataEnabled()} {...loaded} />
  </AppShell>;
}
