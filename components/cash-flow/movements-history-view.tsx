"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import { FIRST_MONTH, LAST_MONTH, monthOf } from "@/server/cash-flow/dates";
import type { MovementDto } from "@/server/cash-flow/movements";
import type { Locale } from "@/server/locale";
import { addMonths, formatMonth } from "../format";
import { Select } from "../select";
import { cashFlowCopy } from "./copy";
import { movementsCopy } from "./movements-copy";
import { HISTORY_TYPES, historyHref, type HistoryQuery, type HistoryType } from "./movements-query";
import { Pager, Row, Step } from "./movements-view";

type Props = {
  locale: Locale;
  today: string;
  accounts: AccountDto[];
  categories: CategoryDto[];
  query: HistoryQuery;
  register: { movements: MovementDto[]; hasMore: boolean };
};

/** One paginated register. The URL holds every filter; changing a filter drops the page. */
export function MovementsHistory({ locale, today, accounts, categories, query, register }: Props) {
  const copy = cashFlowCopy[locale];
  const extra = movementsCopy[locale];
  const router = useRouter();
  const { month, type, accountId, categoryId, page } = query;
  const allPeriods = month === "all";
  const filtered = type !== "all" || Boolean(accountId || categoryId);
  const typeLabels: Record<HistoryType, string> = { all: extra.allTypes, in: extra.typeIn, out: extra.typeOut, transfers: extra.typeTransfers };

  const filter = (change: Partial<HistoryQuery>) => router.push(historyHref(locale, { ...query, ...change, page: 1 }));
  const pageLink = (target: number) => historyHref(locale, { ...query, page: target });
  const monthLink = (target: string) => historyHref(locale, { ...query, month: target, page: 1 });

  return (
    <div className="stack cash-flow-view">
      <section className="card" aria-labelledby="history-filters-title">
        <div className="card-head">
          <h2 id="history-filters-title">{copy.filters}</h2>
          <Link className="text-link" href={`/${locale}/cash-flow${allPeriods ? "" : `?month=${month}`}`}>{extra.backToCashFlow}</Link>
        </div>

        <div className="history-period" role="group" aria-label={extra.period}>
          <nav className="month-nav" aria-label={copy.month}>
            <Step href={!allPeriods && month > FIRST_MONTH ? monthLink(addMonths(month, -1)) : null} label={copy.previousMonth} direction="previous" disabledLabel={allPeriods ? extra.allPeriods : copy.firstMonth} />
            {allPeriods
              ? <span className="month-nav-label">{extra.allPeriods}</span>
              : <time className="month-nav-label" dateTime={month}>{formatMonth(month, locale)}</time>}
            <Step href={!allPeriods && month < LAST_MONTH ? monthLink(addMonths(month, 1)) : null} label={copy.nextMonth} direction="next" disabledLabel={allPeriods ? extra.allPeriods : copy.lastMonth} />
          </nav>
          <Link className="text-link" href={monthLink(allPeriods ? monthOf(today) : "all")}>{allPeriods ? extra.byMonth : extra.allPeriods}</Link>
        </div>

        <div className="filters" role="group" aria-label={copy.filters}>
          <div className="form-field">
            <label htmlFor="history-type">{extra.type}</label>
            <Select id="history-type" value={type} onChange={(value) => filter({ type: value as HistoryType })}
              options={HISTORY_TYPES.map((value) => ({ value, label: typeLabels[value] }))} />
          </div>
          <div className="form-field">
            <label htmlFor="history-account">{copy.account}</label>
            <Select id="history-account" value={accountId ?? ""} onChange={(value) => filter({ accountId: value || undefined })} options={[
              { value: "", label: copy.allAccounts },
              ...accounts.map((account) => ({ value: account.id, label: `${account.name}${account.archived ? ` (${copy.archivedSuffix})` : ""}` })),
            ]} />
          </div>
          <div className="form-field">
            <label htmlFor="history-category">{copy.category}</label>
            <Select id="history-category" value={categoryId ?? ""} onChange={(value) => filter({ categoryId: value || undefined })} options={[
              { value: "", label: copy.allCategories }, { value: "none", label: copy.noCategory },
              ...categories.map((category) => ({ value: category.id, label: `${category.name}${category.archived ? ` (${copy.archivedSuffix})` : ""}` })),
            ]} />
          </div>
        </div>
        {filtered && <Link className="text-link" href={historyHref(locale, { month })}>{extra.resetFilters}</Link>}
      </section>

      <section className="card" aria-labelledby="history-list-title">
        <h2 id="history-list-title">{copy.movementList}</h2>
        {register.movements.length === 0 ? (
          <div className="empty-inline">
            <p>{page > 1 ? copy.emptyPage : extra.historyEmpty}</p>
            {page > 1 && <Link className="text-link" href={pageLink(1)}>{copy.backToFirstPage}</Link>}
          </div>
        ) : (
          <ul className="rows movement-list">{register.movements.map((movement) => (
            <Row key={movement.id} locale={locale} movement={movement} accounts={accounts} categories={categories} today={today} />
          ))}</ul>
        )}
        <Pager copy={copy} title={copy.movementList} page={page} hasMore={register.hasMore} href={pageLink} />
      </section>
    </div>
  );
}
