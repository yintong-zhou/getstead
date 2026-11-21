"use client";

import Link from "next/link";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Select } from "../select";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { InstrumentDto, PortfolioData, TransactionDto } from "@/server/investments/service";
import { type Locale } from "@/server/locale";
import { call, errorText } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { editableEuros } from "../money";
import { investmentsCopy } from "./copy";
import { ordinalPatch, parseInvestmentEuros, parsePositiveDecimal } from "./numbers";
import { euros } from "@/components/euros";

export type Quote = Pick<Awaited<ReturnType<typeof import("@/server/investments/service").listQuotes>>[number],
  "id" | "instrumentId" | "asOf" | "unitPrice">;

export function investmentCall(method: string, path: string, body?: unknown) {
  return call(method, path, body, "/api/investments");
}

export function useInvestmentAction(locale: Locale) {
  const copy = investmentsCopy[locale];
  const fields: Record<string, string> = {
    accountId: copy.account, instrumentId: copy.instrument, type: copy.type, tradeDate: copy.tradeDate,
    ordinal: copy.ordinal, quantity: copy.quantity, amountCents: copy.amountCents, feesCents: copy.feesCents,
    taxWithheldCents: copy.taxWithheldCents, asOf: copy.priceDate, unitPrice: copy.price,
    name: copy.name, symbol: copy.symbol, isin: copy.isin, kind: copy.kind,
  };
  return useAction(locale, (failure) => {
    const message = copy.errors[failure.error] ?? errorText(cashFlowCopy[locale], { ...failure, field: undefined });
    const field = failure.field && fields[failure.field];
    return field ? `${message} (${field})` : message;
  });
}

function Input({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  const id = useId();
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <input {...props} className="field" id={id} aria-describedby={hint ? `${id}-hint` : undefined} />
    {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
  </div>;
}

function Choice({ label, children, ...props }: ComponentProps<"select"> & { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <select {...props} className="field" id={id}>{children}</select>
  </div>;
}

const dateBounds = { type: "date", min: "2000-01-01", max: "2100-12-31", required: true } as const;

function optionRows(rows: (InstrumentDto | AccountDto)[], archived: string, currentId?: string) {
  return rows.map((row) => <option key={row.id} value={row.id} disabled={row.archived && row.id !== currentId}>
    {row.name}{row.archived ? ` · ${archived}` : ""}
  </option>);
}

type TransactionProps = {
  locale: Locale;
  instruments: InstrumentDto[];
  accounts: AccountDto[];
  today: PortfolioData["today"];
};

function TransactionForm({ locale, today, accounts, instruments, transaction }: TransactionProps & { transaction?: TransactionDto }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [type, setType] = useState<TransactionDto["type"]>(transaction?.type ?? "BUY");
  const trade = type === "BUY" || type === "SELL";
  const headingId = useId();
  const noteId = useId();

  return <form aria-labelledby={transaction ? headingId : "investments-record-title"} aria-describedby={noteId} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (field: string) => String(data.get(field) ?? "");
    const amountCents = parseInvestmentEuros(text("amountCents"));
    const feesCents = parseInvestmentEuros(text("feesCents").trim() || "0");
    const taxWithheldCents = parseInvestmentEuros(text("taxWithheldCents").trim() || "0");
    const quantity = trade ? parsePositiveDecimal(text("quantity"), 10) : null;
    const invalid = !amountCents ? copy.grossError : feesCents === null || taxWithheldCents === null ? copy.euroError
      : trade && quantity === null ? copy.quantityError : null;
    if (invalid) {
      action.setNotice({ kind: "error", text: invalid });
      return;
    }
    const body = {
      type, accountId: text("accountId"), instrumentId: text("instrumentId"), tradeDate: text("tradeDate"),
      quantity, amountCents, feesCents, taxWithheldCents,
      ...ordinalPatch(text("ordinal"), transaction?.ordinal),
    };
    const saved = await action.run(() => transaction
      ? investmentCall("PATCH", `/transactions/${transaction.id}`, body)
      : investmentCall("POST", "/transactions", body), copy.transactionSaved);
    if (saved && !transaction) {
      form.reset();
      setType("BUY");
    }
  }}>
    {transaction && <h3 id={headingId} className="visually-hidden">{copy.editTransaction}</h3>}
    <p id={noteId} className="hint investment-note">{copy.valuationCurrency}</p>
    <div className="form-grid">
      <Choice label={copy.type} name="type" value={type} onChange={(event) => setType(event.target.value as TransactionDto["type"])}>
        {Object.entries(copy.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Choice>
      <Choice label={copy.account} name="accountId" defaultValue={transaction?.accountId ?? ""} required>
        <option value="" disabled>{copy.select}</option>
        {optionRows(accounts, shared.archivedSuffix, transaction?.accountId)}
      </Choice>
      <Choice label={copy.instrument} name="instrumentId" defaultValue={transaction?.instrumentId ?? ""} required>
        <option value="" disabled>{copy.select}</option>
        {optionRows(instruments, shared.archivedSuffix, transaction?.instrumentId)}
      </Choice>
      <Input label={copy.tradeDate} name="tradeDate" {...dateBounds} defaultValue={transaction?.tradeDate ?? today} />
      {transaction && <Input label={copy.ordinal} name="ordinal" type="number" min="1" max="2147483647" step="1"
        hint={copy.ordinalHint} required defaultValue={transaction.ordinal} />}
      {trade && <Input label={copy.quantity} name="quantity" maxLength={80} inputMode="decimal" required
        defaultValue={transaction?.quantity?.replace(".", locale === "it" ? "," : ".") ?? ""} />}
      <Input label={copy.amountCents} name="amountCents" maxLength={13} inputMode="decimal" required
        defaultValue={transaction ? editableEuros(transaction.amountCents, locale) : ""} />
      {trade && <Input label={copy.feesCents} name="feesCents" maxLength={13} inputMode="decimal"
        defaultValue={editableEuros(transaction?.feesCents ?? 0, locale)} />}
      {type !== "BUY" && <Input label={copy.taxWithheldCents} name="taxWithheldCents" maxLength={13} inputMode="decimal"
        defaultValue={editableEuros(transaction?.taxWithheldCents ?? 0, locale)} />}
    </div>
    <div className="form-actions">
      <button className="button button-solid" type="submit" disabled={action.pending}>{action.pending ? shared.saving : shared.save}</button>
    </div>
    <NoticeLine notice={action.notice} />
  </form>;
}

function TransactionRow({ row, ...props }: TransactionProps & { row: TransactionDto }) {
  const { locale, accounts, instruments } = props;
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [editing, setEditing] = useState(false);
  const account = accounts.find((item) => item.id === row.accountId);
  const instrument = instruments.find((item) => item.id === row.instrumentId);
  const archived = Boolean(account?.archived || instrument?.archived);
  const label = `${copy.types[row.type]} · ${instrument?.name ?? copy.instrument}`;
  const details = useId();

  return <li className="investment-item">
    <div className="investment-row">
      <div className="row-text">
        <p>{label}{row.voided && <span className="badge">{shared.voided}</span>}</p>
        <span><time dateTime={row.tradeDate}>{row.tradeDate}</time> · #{row.ordinal} · {account?.name}</span>
      </div>
      <b className="amount">{euros(row.amountCents, locale)}</b>
      <div className="investment-actions">
        <button type="button" className="button button-quiet" aria-expanded={editing} aria-controls={details}
          aria-label={`${editing ? shared.cancel : shared.edit} · ${label} · ${row.tradeDate} · #${row.ordinal}`}
          onClick={() => setEditing(!editing)}>{editing ? shared.cancel : shared.edit}</button>
        <button type="button" className="button button-quiet" disabled={action.pending || (row.voided && archived)}
          aria-label={`${row.voided ? shared.restore : shared.void} · ${label} · ${row.tradeDate} · #${row.ordinal}`}
          onClick={() => action.run(() => investmentCall("PATCH", `/transactions/${row.id}`, { voided: !row.voided }),
            row.voided ? copy.transactionRestored : copy.transactionVoided)}>{row.voided ? shared.restore : shared.void}</button>
      </div>
    </div>
    {archived && <p className="hint">{copy.archivedParent}</p>}
    <NoticeLine notice={action.notice} />
    <div id={details} hidden={!editing}>
      {/* key: remount when the server reassigns the ordinal, or the uncontrolled input keeps the stale value */}
      {editing && <TransactionForm key={row.ordinal} {...props} transaction={row} />}
    </div>
  </li>;
}

export function Transactions({ transactions, ...props }: TransactionProps & { transactions: TransactionDto[] }) {
  const { accounts, instruments, locale } = props;
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const [visibleCount, setVisibleCount] = useState(25);
  const activeAccounts = accounts.some((account) => !account.archived);
  const activeInstruments = instruments.some((instrument) => !instrument.archived);

  return <>
    <section className="card" aria-labelledby="investments-record-title">
      <h2 id="investments-record-title">{copy.transaction}</h2>
      <p className="hint investment-note">{copy.transactionHint}</p>
      {activeAccounts && activeInstruments && <TransactionForm {...props} />}
      {!activeAccounts && <div className="empty-inline"><p>{copy.accountHint}</p><Link className="text-link" href={`/${locale}/accounts`}>{shared.goToAccounts}</Link></div>}
      {!activeInstruments && <div className="empty-inline"><p>{copy.instrumentHint}</p><a className="text-link" href="#investments-instruments">{copy.instruments}</a></div>}
    </section>
    <section className="card" aria-labelledby="investments-transactions-title">
      <h2 id="investments-transactions-title">{copy.transactions}</h2>
      {transactions.length === 0 && <p className="empty-inline">{copy.noTransactions}</p>}
      <ul className="rows">{transactions.slice(0, visibleCount).map((row) => <TransactionRow key={row.id} row={row} {...props} />)}</ul>
      {transactions.length > visibleCount && <button type="button" className="button button-quiet"
        onClick={() => setVisibleCount((count) => count + 25)}>{copy.showMore}</button>}
    </section>
  </>;
}

function InstrumentForm({ locale, instrument }: { locale: Locale; instrument?: InstrumentDto }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const note = useId();
  const kindId = useId();

  return <form aria-label={instrument ? copy.editInstrument : copy.addInstrument} aria-describedby={note}
    onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const body = {
        name: String(data.get("name")).trim(), kind: String(data.get("kind")),
        symbol: String(data.get("symbol")).trim() || null, isin: String(data.get("isin")).trim().toUpperCase() || null,
      };
      const saved = await action.run(() => instrument
        ? investmentCall("PATCH", `/instruments/${instrument.id}`, body)
        : investmentCall("POST", "/instruments", body), copy.instrumentSaved);
      if (saved && !instrument) form.reset();
    }}>
    <div className="form-grid">
      <Input label={copy.name} name="name" maxLength={120} required defaultValue={instrument?.name} />
      <Input label={copy.symbol} name="symbol" maxLength={24} defaultValue={instrument?.symbol ?? ""} />
      <Input label={copy.isin} name="isin" maxLength={12} defaultValue={instrument?.isin ?? ""} />
      <div className="form-field">
        <label htmlFor={kindId}>{copy.kind}</label>
        <Select id={kindId} name="kind" defaultValue={instrument?.kind ?? "STOCK"} aria-describedby={note}
          options={Object.entries(copy.kinds).map(([value, label]) => ({ value, label }))} />
      </div>
    </div>
    <p className="hint investment-note" id={note}>{copy.kindHint}</p>
    <div className="form-actions">
      <button className="button button-solid" type="submit" disabled={action.pending}>
        {action.pending ? shared.saving : instrument ? shared.save : copy.addInstrument}
      </button>
    </div>
    <NoticeLine notice={action.notice} />
  </form>;
}

function InstrumentRow({ locale, instrument }: { locale: Locale; instrument: InstrumentDto }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [editing, setEditing] = useState(false);
  const id = useId();
  return <li className="investment-item">
    <div className="investment-row">
      <div className="row-text">
        <p>{instrument.name}{instrument.archived && <span className="badge">{shared.archivedSuffix}</span>}</p>
        <span>{[copy.kinds[instrument.kind], instrument.symbol, instrument.isin].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="investment-actions">
        <button type="button" className="button button-quiet" aria-expanded={editing} aria-controls={id}
          aria-label={`${editing ? shared.cancel : shared.edit} · ${instrument.name}`} onClick={() => setEditing(!editing)}>{editing ? shared.cancel : shared.edit}</button>
        <button type="button" className="button button-quiet" disabled={action.pending}
          aria-label={`${instrument.archived ? shared.restore : shared.archive} · ${instrument.name}`}
          onClick={() => action.run(() => investmentCall("PATCH", `/instruments/${instrument.id}`, { archived: !instrument.archived }),
            instrument.archived ? copy.instrumentRestored : copy.instrumentArchived)}>{instrument.archived ? shared.restore : shared.archive}</button>
      </div>
    </div>
    <NoticeLine notice={action.notice} />
    <div id={id} hidden={!editing}>{editing && <InstrumentForm locale={locale} instrument={instrument} />}</div>
  </li>;
}

export function Instruments({ locale, instruments }: { locale: Locale; instruments: InstrumentDto[] }) {
  const copy = investmentsCopy[locale];
  return <section className="card" aria-labelledby="investments-instruments">
    <h2 id="investments-instruments">{copy.instruments}</h2>
    <p className="hint investment-note">{copy.archiveHint}</p>
    <InstrumentForm locale={locale} />
    {instruments.length === 0 && <p className="empty-inline">{copy.noInstruments}</p>}
    <ul className="rows">{instruments.map((instrument) => <InstrumentRow key={instrument.id} instrument={instrument} locale={locale} />)}</ul>
  </section>;
}

export function QuickPrice({ locale, today, instrumentId, name }: { locale: Locale; today: string; instrumentId: string; name: string }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  return <details className="investment-details">
    <summary className="button button-quiet" aria-label={`${copy.addPrice} · ${name}`}>{copy.addPrice}</summary>
    <form className="form-grid" aria-label={`${copy.addPrice} · ${name}`} onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const unitPrice = parsePositiveDecimal(String(data.get("unitPrice") ?? ""), 8);
      if (unitPrice === null) {
        action.setNotice({ kind: "error", text: copy.priceError });
        return;
      }
      const saved = await action.run(() => investmentCall("POST", "/quotes", { instrumentId, asOf: data.get("asOf"), unitPrice }), copy.priceSaved);
      if (saved) form.reset();
    }}>
      <Input label={copy.priceDate} name="asOf" {...dateBounds} defaultValue={today} />
      <Input label={copy.price} name="unitPrice" inputMode="decimal" maxLength={80} required />
      <button type="submit" className="button button-solid form-submit" disabled={action.pending}>{action.pending ? shared.saving : shared.save}</button>
    </form>
    <NoticeLine notice={action.notice} />
  </details>;
}

export function PriceHistory({ locale, instruments, quotes, displayPrice }: { locale: Locale; instruments: InstrumentDto[]; quotes: Quote[];
  displayPrice: (value: string) => string }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [visibleCount, setVisibleCount] = useState(25);
  const names = new Map(instruments.map((instrument) => [instrument.id, instrument.name]));

  return <section className="card" aria-labelledby="investments-prices-title">
    <h2 id="investments-prices-title">{copy.prices}</h2>
    <NoticeLine notice={action.notice} />
    {quotes.length === 0 && <p className="empty-inline">{copy.noPrices}</p>}
    <ul className="rows">{quotes.slice(0, visibleCount).map(({ id, instrumentId, asOf, unitPrice }) => <li key={id} className="investment-item">
      <div className="investment-row">
        <div className="row-text"><p>{names.get(instrumentId)}</p><time dateTime={asOf}>{asOf}</time></div>
        <span className="amount">{displayPrice(unitPrice)}</span>
        <button type="button" className="button button-quiet" disabled={action.pending}
          aria-label={`${shared.delete} · ${names.get(instrumentId)} · ${asOf}`}
          onClick={() => action.run(() => investmentCall("DELETE", `/quotes/${id}`), copy.priceRemoved)}>{shared.delete}</button>
      </div>
    </li>)}</ul>
    {quotes.length > visibleCount && <button type="button" className="button button-quiet"
      onClick={() => setVisibleCount((count) => count + 25)}>{copy.showMore}</button>}
  </section>;
}
