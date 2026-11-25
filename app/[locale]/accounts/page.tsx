import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { AccountsView } from "@/components/cash-flow/accounts-view";
import { cashFlowCopy } from "@/components/cash-flow/copy";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts, listCategories } from "@/server/cash-flow/catalog";
import { listRules } from "@/server/cash-flow/rules";
import { getNetWorth } from "@/server/net-worth/service";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${cashFlowCopy[locale].accountsTitle} | getstead`, robots: { index: false } };
}

export default async function AccountsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path="/accounts" />;

  let data;
  try {
    const [accounts, categories, rules, netWorth] = await Promise.all([
      listAccounts(user.userId, true),
      listCategories(user.userId, true),
      listRules(user.userId),
      getNetWorth(user.userId),
    ]);
    const balances = Object.fromEntries(netWorth.perAccount.map(({ id, balanceCents, holdingsCents }) => [id, { balanceCents, holdingsCents }]));
    data = { accounts, categories, rules, balances };
  } catch {
    return <UnavailableNotice locale={locale} path="/accounts" />;
  }

  const copy = cashFlowCopy[locale];
  return (
    <AppShell locale={locale} current="accounts" title={copy.accountsTitle} subtitle={copy.accountsIntro} profile={user.profile}>
      <AccountsView locale={locale} {...data} />
    </AppShell>
  );
}
