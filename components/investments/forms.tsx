"use client";

import { DateField } from "../date-field";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Select } from "../select";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { InstrumentDto, InstrumentSetupResult, PortfolioData, TransactionDto } from "@/server/investments/service";
import type { MarketListing } from "@/server/investments/market-data";
import { type Locale } from "@/server/locale";
import { call, errorText } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { amountInputProps } from "../amount-input";
import { useConfirm } from "../confirm-dialog";
import { editableEuros } from "../money";
import { investmentsCopy } from "./copy";
import { ordinalPatch, parseInvestmentEuros, parsePositiveDecimal, parsePurchaseTotal } from "./numbers";
import { euros } from "@/components/euros";

export type Quote = Pick<Awaited<ReturnType<typeof import("@/server/investments/service").listQuotes>>[number],
  "id" | "instrumentId" | "asOf" | "unitPrice">;

export function investmentCall<T = unknown>(method: string, path: string, body?: unknown) {
  return call<T>(method, path, body, "/api/investments");
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

function Input({ label, hint, dateLocale, ...props }: ComponentProps<"input"> & { label: string; hint?: string; dateLocale?: Locale }) {
  const id = useId();
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    {dateLocale ? <DateField locale={dateLocale} id={id} name={props.name} required={props.required}
      min={String(props.min)} max={String(props.max)} defaultValue={String(props.defaultValue ?? "")} aria-describedby={hint ? `${id}-hint` : undefined} />
      : <input {...props} className="field" id={id} aria-describedby={hint ? `${id}-hint` : undefined} />}
    {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
  </div>;
}

type Opt = { value: string; label: string; disabled?: boolean };
function Choice({ label, options, ...props }: { label: string; options: Opt[]; name?: string; required?: boolean } & (
  { value: string; onChange: (value: string) => void; defaultValue?: never } | { defaultValue?: string; value?: never; onChange?: never }
)) {
  const id = useId();
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <Select {...(props as { name: string; defaultValue?: string })} id={id} options={options} />
    </div>;
}

const dateBounds = { min: "2000-01-01", max: "2100-12-31", required: true } as const;

function optionRows(rows: (InstrumentDto | AccountDto)[], archived: string, currentId?: string): Opt[] {
  return rows.map((row) => ({ value: row.id, label: row.name + (row.archived ? ` · ${archived}` : ""), disabled: row.archived && row.id !== currentId }));
}

type TransactionProps = {
  locale: Locale;
  instruments: InstrumentDto[];
  accounts: AccountDto[];
  today: PortfolioData["today"];
};

function TransactionForm({ locale, today, accounts, instruments, transaction, onSaved }: TransactionProps & { transaction?: TransactionDto; onSaved?: () => void }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [type, setType] = useState<TransactionDto["type"]>(transaction?.type ?? "BUY");
  const trade = type === "BUY" || type === "SELL";
  const parseAmount = type === "BUY" ? parsePurchaseTotal : parseInvestmentEuros;
  const headingId = useId();
  const noteId = useId();

  return <form aria-labelledby={transaction ? headingId : "investments-record-title"} aria-describedby={noteId} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (field: string) => String(data.get(field) ?? "");
    const enteredCents = parseAmount(text("amountCents"));
    const feesCents = parseInvestmentEuros(text("feesCents").trim() || "0");
    const taxWithheldCents = parseInvestmentEuros(text("taxWithheldCents").trim() || "0");
    const quantity = trade ? parsePositiveDecimal(text("quantity"), 10) : null;
    // The purchase form shows cash paid, while the API stores the price and fees separately.
    const amountCents = type === "BUY" && enteredCents !== null && feesCents !== null ? enteredCents - feesCents : enteredCents;
    const invalid = !enteredCents ? copy.grossError : feesCents === null || taxWithheldCents === null ? copy.euroError
      : amountCents !== null && amountCents <= 0 ? copy.buyFeesError
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
    if (saved) onSaved?.();
  }}>
    {transaction && <h3 id={headingId} className="visually-hidden">{copy.editTransaction}</h3>}
    <p id={noteId} className="hint investment-note">{copy.valuationCurrency}</p>
    <div className="form-grid">
      <Choice label={copy.type} name="type" value={type} onChange={(value) => setType(value as TransactionDto["type"])}
        options={Object.entries(copy.types).map(([value, label]) => ({ value, label }))} />
      <Choice label={copy.account} name="accountId" defaultValue={transaction?.accountId ?? ""} required
        options={[{ value: "", label: copy.select, disabled: true }, ...optionRows(accounts, shared.archivedSuffix, transaction?.accountId)]} />
      <Choice label={copy.instrument} name="instrumentId" defaultValue={transaction?.instrumentId ?? ""} required
        options={[{ value: "", label: copy.select, disabled: true }, ...optionRows(instruments, shared.archivedSuffix, transaction?.instrumentId)]} />
      <Input label={copy.tradeDate} name="tradeDate" {...dateBounds} dateLocale={locale} defaultValue={transaction?.tradeDate ?? today} />
      {transaction && <Input label={copy.ordinal} name="ordinal" type="number" min="1" max="2147483647" step="1"
        hint={copy.ordinalHint} required defaultValue={transaction.ordinal} />}
      {trade && <Input label={copy.quantity} name="quantity" maxLength={80} inputMode="decimal" required
        defaultValue={transaction?.quantity?.replace(".", locale === "it" ? "," : ".") ?? ""} />}
      <Input label={copy.amountLabels[type]} hint={copy.amountHints[type]} name="amountCents" {...amountInputProps(locale, parseAmount)} required
        defaultValue={transaction ? editableEuros(transaction.amountCents + (transaction.type === "BUY" ? transaction.feesCents : 0), locale) : ""} />
      {trade && <Input label={type === "BUY" ? copy.buyFees : copy.feesCents} name="feesCents" {...amountInputProps(locale, parseInvestmentEuros)}
        defaultValue={editableEuros(transaction?.feesCents ?? 0, locale)} />}
      {type !== "BUY" && <Input label={copy.taxWithheldCents} name="taxWithheldCents" {...amountInputProps(locale, parseInvestmentEuros)}
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
  const editButton = useRef<HTMLButtonElement>(null);
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
        <button ref={editButton} type="button" className="button button-quiet" aria-expanded={editing} aria-controls={details}
          aria-label={`${editing ? shared.cancel : shared.edit} · ${label} · ${row.tradeDate} · #${row.ordinal}`}
          onClick={() => setEditing(!editing)}>{editing ? shared.cancel : shared.edit}</button>
        <button type="button" className="button button-quiet" disabled={action.pending || (row.voided && archived)}
          aria-label={`${row.voided ? shared.restore : shared.delete} · ${label} · ${row.tradeDate} · #${row.ordinal}`}
          onClick={() => action.run(() => investmentCall("PATCH", `/transactions/${row.id}`, { voided: !row.voided }),
            row.voided ? copy.transactionRestored : copy.transactionVoided)}>{row.voided ? shared.restore : shared.delete}</button>
      </div>
    </div>
    {archived && <p className="hint">{copy.archivedParent}</p>}
    <NoticeLine notice={action.notice} />
    <div id={details} hidden={!editing}>
      {/* key: remount when the server reassigns the ordinal, or the uncontrolled input keeps the stale value */}
      {editing && <TransactionForm key={row.ordinal} {...props} transaction={row} onSaved={() => {
        setEditing(false);
        action.setNotice({ kind: "ok", text: copy.transactionSaved });
        requestAnimationFrame(() => editButton.current?.focus());
      }} />}
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
    <section className="card stack-half" aria-labelledby="investments-record-title">
      <h2 id="investments-record-title">{copy.transaction}</h2>
      <p className="hint investment-note">{copy.transactionHint}</p>
      {activeAccounts && activeInstruments && <TransactionForm {...props} />}
      {!activeAccounts && <div className="empty-inline"><p>{copy.accountHint}</p><Link className="text-link" href={`/${locale}/accounts`}>{shared.goToAccounts}</Link></div>}
      {!activeInstruments && <div className="empty-inline"><p>{copy.instrumentHint}</p><a className="text-link" href="#investments-instruments">{copy.instruments}</a></div>}
    </section>
    <section className="card stack-half" aria-labelledby="investments-transactions-title">
      <h2 id="investments-transactions-title">{copy.transactions}</h2>
      {transactions.length === 0 && <p className="empty-inline">{copy.noTransactions}</p>}
      <ul className="rows">{transactions.slice(0, visibleCount).map((row) => <TransactionRow key={row.id} row={row} {...props} />)}</ul>
      {transactions.length > visibleCount && <button type="button" className="button button-quiet"
        onClick={() => setVisibleCount((count) => count + 25)}>{copy.showMore}</button>}
    </section>
  </>;
}

type InstrumentDraft = { name: string; kind: string; symbol: string | null; isin: string | null };

function InitialMarketChoice({ locale, listings, pending, error, onSelect, onCancel }: {
  locale: Locale; listings: MarketListing[]; pending: boolean; error?: string;
  onSelect: (symbol: string) => void; onCancel: () => void;
}) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selection, setSelection] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={dialogRef} className="confirm-dialog market-choice-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h3 id={titleId}>{copy.chooseMarket}</h3>
    <fieldset disabled={pending} className="market-choices" aria-labelledby={titleId}>
      {listings.map((listing) => <label className="market-choice" key={listing.symbol}>
        <input type="radio" name={titleId} value={listing.symbol} checked={selection === listing.symbol}
          onChange={() => setSelection(listing.symbol)} />
        <span className="market-link-details">
          <strong>{listing.name}</strong>
          <span className="hint">{listing.symbol} · {listing.market} · {listing.currency}</span>
        </span>
      </label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="confirm-actions">
      <button className="button button-quiet" type="button" disabled={pending} onClick={onCancel}>{shared.cancel}</button>
      <button className="button button-solid" type="button" disabled={!selection || pending}
        onClick={() => onSelect(selection)}>{pending ? shared.saving : copy.linkMarket}</button>
    </div>
  </dialog>;
}

function InstrumentForm({ locale, instrument, onSaved }: { locale: Locale; instrument?: InstrumentDto; onSaved?: () => void }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const note = useId();
  const kindId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [setup, setSetup] = useState<{ draft: InstrumentDraft; listings: MarketListing[] } | null>(null);

  async function saveNew(draft: InstrumentDraft, listingSymbol?: string) {
    const saved = await action.run(() => investmentCall<InstrumentSetupResult>("POST", "/instruments/setup", { ...draft, listingSymbol }));
    if (!saved) return;
    if (saved.data.status === "choose") {
      setSetup({ draft, listings: saved.data.listings });
      return;
    }
    setSetup(null);
    formRef.current?.reset();
    const { instrument: added, quoteLookup } = saved.data;
    action.setNotice(quoteLookup
      ? { kind: "warn", text: copy.instrumentQuoteStatus[quoteLookup] }
      : { kind: "ok", text: added.market ? copy.instrumentLinked : copy.instrumentSaved });
    onSaved?.();
  }

  return <><form ref={formRef} aria-label={instrument ? copy.editInstrument : copy.addInstrument} aria-describedby={note}
    onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const body = {
        name: String(data.get("name")).trim(), kind: String(data.get("kind")),
        symbol: String(data.get("symbol")).trim() || null, isin: String(data.get("isin")).trim().toUpperCase() || null,
      };
      if (!instrument) {
        await saveNew(body);
        return;
      }
      const saved = await action.run(() => investmentCall("PATCH", `/instruments/${instrument.id}`, body), copy.instrumentSaved);
      if (saved) onSaved?.();
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
    {!setup && <NoticeLine notice={action.notice} />}
  </form>
    {setup && <InitialMarketChoice locale={locale} listings={setup.listings} pending={action.pending}
      error={action.notice?.kind === "error" ? action.notice.text : undefined}
      onSelect={(symbol) => { void saveNew(setup.draft, symbol); }}
      onCancel={() => { action.setNotice(null); setSetup(null); }} />}
  </>;
}

/** Transactions and prices an instrument owns; deleting the position removes all of them. */
export type PositionCounts = Map<string, { transactions: number; quotes: number }>;
export type DeletePositionProps = { counts: PositionCounts; pending: boolean; onDelete: (id: string) => void };

/** The confirm dialog names the instrument and what disappears; nothing is sent until the person confirms. */
export function DeletePosition({ locale, id, name, counts, pending, onDelete }: DeletePositionProps & { locale: Locale; id: string; name: string }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const { confirm, dialog } = useConfirm(shared.cancel);
  const { transactions = 0, quotes = 0 } = counts.get(id) ?? {};
  return <>
    <button type="button" className="button button-quiet" disabled={pending} aria-label={`${copy.deletePosition} · ${name}`}
      onClick={async () => { if (await confirm(copy.deletePositionConfirm(name, transactions, quotes), copy.deletePosition, true)) onDelete(id); }}>{shared.delete}</button>
    {dialog}
  </>;
}

function MarketLink({ locale, instrument }: { locale: Locale; instrument: InstrumentDto }) {
  const copy = investmentsCopy[locale];
  const action = useInvestmentAction(locale);
  const [matches, setMatches] = useState<{ query: string; listings: MarketListing[] }>();
  const path = `/instruments/${instrument.id}/market`;
  return <details className="market-link">
    <summary>{instrument.market ? copy.changeMarket : copy.linkMarket}</summary>
    <div className="market-link-panel">
      {instrument.market && <div className="market-link-row">
        <p className="market-link-details">
          <strong>{instrument.market.symbol}</strong>
          <span className="hint">{instrument.market.market} · {instrument.market.currency}</span>
        </p>
        <button className="button button-quiet" type="button" disabled={action.pending}
          onClick={() => action.run(() => investmentCall("PATCH", path, { symbol: null }), copy.marketUnlinked)}>{copy.unlinkMarket}</button>
      </div>}
      <form className="market-link-search" onSubmit={async (event) => {
        event.preventDefault();
        const query = String(new FormData(event.currentTarget).get("query")).trim();
        setMatches(undefined);
        const result = await action.run(() => investmentCall<MarketListing[]>("POST", path, { query }));
        if (result) setMatches({ query, listings: result.data });
      }}>
        <Input label={copy.marketSearchLabel} name="query" defaultValue={instrument.market?.symbol ?? instrument.symbol ?? instrument.isin ?? ""} maxLength={64} required />
        <button className="button button-quiet" type="submit" disabled={action.pending}>{copy.marketSearch}</button>
      </form>
      {matches && (matches.listings.length ? <ul className="market-link-results">{matches.listings.map((listing) =>
        <li className="market-link-row" key={listing.symbol}>
          <p className="market-link-details">
            <strong>{listing.name}</strong>
            <span className="hint">{[listing.symbol, listing.market, listing.currency].join(" · ")}</span>
          </p>
          <button className="button button-quiet" type="button" disabled={action.pending} aria-label={`${copy.select} · ${listing.symbol}`}
            onClick={async () => {
              const result = await action.run(() => investmentCall("PATCH", path, { query: matches.query, symbol: listing.symbol }), copy.marketLinked);
              if (result) setMatches(undefined);
            }}>{copy.select}</button>
        </li>)}</ul> : <p className="hint" role="status">{copy.marketNoMatch}</p>)}
      <NoticeLine notice={action.notice} />
    </div>
  </details>;
}

function InstrumentRow({ locale, instrument, marketEnabled, ...position }: { locale: Locale; instrument: InstrumentDto; marketEnabled: boolean } & DeletePositionProps) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  return <li className="investment-item">
    <div className="investment-row">
      <div className="row-text">
        <p>{instrument.name}{instrument.archived && <span className="badge">{shared.archivedSuffix}</span>}</p>
        <span>{[copy.kinds[instrument.kind], instrument.symbol, instrument.isin].filter(Boolean).join(" · ")}</span>
        <span className="instrument-quote">{instrument.market
          ? `${copy.linkedQuote}: ${instrument.market.symbol} · ${instrument.market.market} · ${instrument.market.currency} · Yahoo Finance`
          : copy.noLinkedQuote}</span>
      </div>
      <div className="investment-actions">
        <button ref={editButton} type="button" className="button button-quiet" aria-expanded={editing} aria-controls={id}
          aria-label={`${editing ? shared.cancel : shared.edit} · ${instrument.name}`} onClick={() => setEditing(!editing)}>{editing ? shared.cancel : shared.edit}</button>
        <button type="button" className="button button-quiet" disabled={action.pending}
          aria-label={`${instrument.archived ? shared.restore : shared.archive} · ${instrument.name}`}
          onClick={() => action.run(() => investmentCall("PATCH", `/instruments/${instrument.id}`, { archived: !instrument.archived }),
            instrument.archived ? copy.instrumentRestored : copy.instrumentArchived)}>{instrument.archived ? shared.restore : shared.archive}</button>
        <DeletePosition locale={locale} id={instrument.id} name={instrument.name} {...position} />
      </div>
    </div>
    <NoticeLine notice={action.notice} />
    {marketEnabled && !instrument.archived && ["STOCK", "ETF", "FUND"].includes(instrument.kind) &&
      <MarketLink locale={locale} instrument={instrument} />}
    <div id={id} hidden={!editing}>{editing && <InstrumentForm locale={locale} instrument={instrument} onSaved={() => {
      setEditing(false);
      action.setNotice({ kind: "ok", text: copy.instrumentSaved });
      requestAnimationFrame(() => editButton.current?.focus());
    }} />}</div>
  </li>;
}

export function Instruments({ locale, instruments, marketEnabled, ...position }: { locale: Locale; instruments: InstrumentDto[]; marketEnabled: boolean } & DeletePositionProps) {
  const copy = investmentsCopy[locale];
  return <section className="card stack-half" aria-labelledby="investments-instruments">
    <h2 id="investments-instruments">{copy.instruments}</h2>
    <p className="hint investment-note">{copy.archiveHint}</p>
    <InstrumentForm locale={locale} />
    {instruments.length === 0 && <p className="empty-inline">{copy.noInstruments}</p>}
    <ul className="rows">{instruments.map((instrument) => <InstrumentRow key={instrument.id} instrument={instrument} locale={locale} marketEnabled={marketEnabled} {...position} />)}</ul>
  </section>;
}

export function PriceHistory({ locale, instruments, quotes, displayPrice }: { locale: Locale; instruments: InstrumentDto[]; quotes: Quote[];
  displayPrice: (value: string) => string }) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useInvestmentAction(locale);
  const [visibleCount, setVisibleCount] = useState(25);
  const names = new Map(instruments.map((instrument) => [instrument.id, instrument.name]));

  return <section className="card stack-half" aria-labelledby="investments-prices-title">
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
