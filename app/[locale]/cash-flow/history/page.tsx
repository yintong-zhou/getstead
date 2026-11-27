import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UnavailableNotice } from "@/components/auth/auth-shell";
import { AppShell } from "@/components/app-shell";
import { MovementsHistory } from "@/components/cash-flow/movements-history-view";
import { movementsCopy } from "@/components/cash-flow/movements-copy";
import { historyHref, parseHistoryQuery, registerParams } from "@/components/cash-flow/movements-query";
import { readPageUser } from "@/server/auth/page-access";
import { listAccounts, listCategories } from "@/server/cash-flow/catalog";
import { romeToday } from "@/server/cash-flow/dates";
import { listMovementsPage } from "@/server/cash-flow/movements";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; month?: string; accountId?: string; categoryId?: string; page?: string; pageSize?: string }>;
};

const PATH = "/cash-flow/history";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${movementsCopy[locale].historyTitle} | getstead`, robots: { index: false } };
}

export default async function MovementsHistoryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await readPageUser(locale);
  if (user.status === "anonymous") redirect(`/${locale}/login`);
  if (user.status === "unavailable") return <UnavailableNotice locale={locale} path={PATH} />;

  const today = romeToday();
  // Every URL value is sanitised first, so a hand-edited link can never reach the registry as invalid input.
  const query = parseHistoryQuery(await searchParams, today);

  let data;
  try {
    const [accounts, categories, register] = await Promise.all([
      listAccounts(user.userId, true),
      listCategories(user.userId, true),
      listMovementsPage(user.userId, registerParams(query)),
    ]);
    data = { accounts, categories, register };
  } catch {
    return <UnavailableNotice locale={locale} path={PATH} />;
  }

  const extra = movementsCopy[locale];
  const href = historyHref(locale, query);
  return (
    <AppShell locale={locale} current="cash-flow" routePath={PATH} title={extra.historyTitle} subtitle={extra.historyIntro} query={href.slice(href.indexOf("?"))} profile={user.profile}>
      <MovementsHistory locale={locale} today={today} query={query} {...data} />
    </AppShell>
  );
}
