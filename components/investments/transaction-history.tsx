"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import { transactionHistoryHref, type TransactionQuery } from "@/server/investments/transaction-query";
import { cashFlowCopy } from "../cash-flow/copy";
import { movementsCopy } from "../cash-flow/movements-copy";
import { Pager } from "../cash-flow/movements-view";
import { DateField } from "../date-field";
import { Select } from "../select";
import { investmentsCopy } from "./copy";
import { TransactionList } from "./forms";
import "./investments.css";

type Props = ComponentProps<typeof TransactionList> & { query: TransactionQuery; hasMore: boolean };

export function TransactionHistory({ query, hasMore, ...props }: Props) {
  const { locale, accounts, instruments, transactions } = props;
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const filters = movementsCopy[locale];
  const base = transactionHistoryHref(locale);
  const pageLink = (page: number) => transactionHistoryHref(locale, { ...query, page });
  const filtered = Boolean(query.month || query.type || query.accountId || query.instrumentId);
  const option = (row: { id: string; name: string; archived: boolean }) => ({
    value: row.id, label: row.archived ? `${row.name} (${shared.archivedSuffix})` : row.name,
  });

  return <div className="stack investment-view">
    <section className="card" aria-labelledby="transaction-filter-title">
      <div className="card-head">
        <h2 id="transaction-filter-title">{shared.filters}</h2>
        <Link className="text-link" href={`/${locale}/investments`}>{copy.backToInvestments}</Link>
      </div>
      <form action={base} method="get" key={pageLink(1)}>
        <div className="filters">
          <div className="form-field">
            <label htmlFor="transaction-month">{shared.month}</label>
            <DateField locale={locale} id="transaction-month" type="month" name="month" min={FIRST_MONTH} max={LAST_MONTH} defaultValue={query.month ?? ""} />
          </div>
          <div className="form-field">
            <label htmlFor="transaction-type">{copy.type}</label>
            <Select id="transaction-type" name="type" defaultValue={query.type ?? ""} options={[
              { value: "", label: copy.allTransactionTypes },
              ...Object.entries(copy.types).map(([value, label]) => ({ value, label })),
            ]} />
          </div>
          <div className="form-field">
            <label htmlFor="transaction-account">{copy.account}</label>
            <Select id="transaction-account" name="accountId" defaultValue={query.accountId ?? ""} options={[
              { value: "", label: shared.allAccounts }, ...accounts.map(option),
            ]} />
          </div>
          <div className="form-field">
            <label htmlFor="transaction-instrument">{copy.instrument}</label>
            <Select id="transaction-instrument" name="instrumentId" defaultValue={query.instrumentId ?? ""} options={[
              { value: "", label: copy.allInstruments }, ...instruments.map(option),
            ]} />
          </div>
        </div>
        <div className="form-actions">
          <button className="button button-solid" type="submit">{copy.applyFilters}</button>
          {filtered && <Link className="text-link" href={base}>{filters.resetFilters}</Link>}
        </div>
      </form>
    </section>

    <section className="card" aria-labelledby="transaction-history-title">
      <h2 id="transaction-history-title">{copy.transactions}</h2>
      {transactions.length > 0 ? <TransactionList {...props} /> : <div className="empty-inline">
        <p>{query.page > 1 ? shared.emptyPage : filtered ? copy.noMatchingTransactions : copy.noTransactions}</p>
        {query.page > 1 && <Link className="text-link" href={pageLink(1)}>{shared.backToFirstPage}</Link>}
      </div>}
      <Pager copy={shared} title={copy.transactions} page={query.page} hasMore={hasMore} href={pageLink} />
    </section>
  </div>;
}
