"use client";

import { useId, useState } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { InstrumentDto, PortfolioData, TransactionDto } from "@/server/investments/service";
import { formatEuros, localeTags, type Locale } from "@/server/locale";
import { cashFlowCopy } from "../cash-flow/copy";
import { formatMonth } from "../format";
import { investmentsCopy } from "./copy";
import { formatDecimal, formatHoldingDecimal, hasHoldingPrecision } from "./numbers";
import { Instruments, PriceHistory, QuickPrice, Transactions, type Quote } from "./forms";
import { euros } from "@/components/euros";
import "./investments.css";

type ViewProps = {
  locale: Locale;
  data: PortfolioData;
  accounts: AccountDto[];
  instruments: InstrumentDto[];
  transactions: TransactionDto[];
  quotes: Quote[];
};

function Gain({ cents, locale }: { cents: number; locale: Locale }) {
  const tone = cents > 0 ? "positive" : cents < 0 ? "negative" : "";
  return <span className={`amount ${tone}`}>{euros(cents, locale, { showPlus: true })}</span>;
}

function Trend({ locale, series }: { locale: Locale; series: PortfolioData["series"] }) {
  const copy = investmentsCopy[locale];
  const gradient = useId();
  const high = Math.max(1, ...series.map((point) => point.valueCents));
  const points = series.map(({ valueCents }, index) => `${20 + index * 560 / 11},${174 - valueCents / high * 152}`);
  const path = `M ${points.join(" L ")}`;
  const detail = series.map(({ month, valueCents }) => `${formatMonth(month, locale)} ${formatEuros(valueCents, locale)}`).join(", ");

  return <section className="financial-trend" aria-labelledby="investment-trend-title">
    <h2 id="investment-trend-title">{copy.trend}</h2>
    <p className="hint">{copy.trendNote}</p>
    <svg className="investment-chart" viewBox="0 0 600 188" role="img" aria-label={detail}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand)" stopOpacity=".24" />
        <stop offset="100%" stopColor="var(--brand)" stopOpacity=".02" />
      </linearGradient></defs>
      <path d="M 20,174 H 580" stroke="var(--border)" />
      <path d={`${path} L 580,174 L 20,174 Z`} fill={`url(#${gradient})`} />
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    <div className="financial-trend-labels" aria-hidden="true">
      {[series[0], series[5], series[11]].map(({ month }) => <span key={month}>{formatMonth(month, locale)}</span>)}
    </div>
  </section>;
}

function Allocation({ locale, allocation }: { locale: Locale; allocation: PortfolioData["allocation"] }) {
  const copy = investmentsCopy[locale];
  const percentages = new Intl.NumberFormat(localeTags[locale], { style: "percent", maximumFractionDigits: 1 });
  return <section className="card investment-allocation" aria-labelledby="investment-allocation-title">
    <h2 id="investment-allocation-title">{copy.allocation}</h2>
    {allocation.length === 0 ? <p className="empty-inline">{copy.noAllocation}</p> : <>
      <div className="allocation" aria-hidden="true">
        {allocation.filter(({ valueCents }) => valueCents > 0).map(({ kind, share }) =>
          <span key={kind} data-kind={kind} style={{ flexGrow: share }} />)}
      </div>
      <ul className="allocations">
        {allocation.map(({ kind, valueCents, share }) => <li key={kind}>
          <span><i data-kind={kind} aria-hidden="true" />{copy.kinds[kind]} · {percentages.format(Number(share))}</span>
          <span className="amount">{euros(valueCents, locale)}</span>
        </li>)}
      </ul>
    </>}
  </section>;
}

function Holdings({ locale, data, instruments }: Pick<ViewProps, "locale" | "data" | "instruments">) {
  const copy = investmentsCopy[locale];
  const shared = cashFlowCopy[locale];
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const fields = [copy.quantity, copy.averageCost, copy.price, copy.marketValue, copy.gain];
  const canExpand = data.holdings.some((holding) =>
    hasHoldingPrecision(holding.quantity, false) || hasHoldingPrecision(holding.averageCost, true)
      || (!holding.noPrice && hasHoldingPrecision(holding.unitPrice, true)));

  return <section className="card" aria-labelledby="investments-holdings-title">
    <div className="card-head">
      <h2 id="investments-holdings-title">{copy.holdings}</h2>
      {canExpand && <button className="button button-quiet" type="button" aria-controls="investment-holdings"
        onClick={() => setExpanded(!expanded)}>{expanded ? copy.hideDecimals : copy.showDecimals}</button>}
    </div>
    {data.holdings.some((holding) => holding.noPrice) && <p className="hint investment-note">{copy.noPriceHint}</p>}
    {data.holdings.length === 0 ? <p className="empty-inline">{copy.noHoldings}</p> : (
      <table id="investment-holdings" className="investment-holdings" role="table" aria-labelledby="investments-holdings-title">
        <thead role="rowgroup">
          <tr role="row">
            {[copy.instrument, ...fields].map((label) => <th key={label} role="columnheader" scope="col">{label}</th>)}
          </tr>
        </thead>
        {data.holdings.map((holding) => {
          const instrument = byId.get(holding.instrumentId);
          const cells = [
            formatHoldingDecimal(holding.quantity, locale, false, expanded),
            formatHoldingDecimal(holding.averageCost, locale, true, expanded),
            holding.noPrice ? <span key="no-price" className="badge badge-amber">{copy.noPrice}</span> : formatHoldingDecimal(holding.unitPrice, locale, true, expanded),
            formatEuros(holding.valueCents, locale),
            <Gain key="gain" cents={holding.gainCents} locale={locale} />,
          ];
          return <tbody key={holding.instrumentId} role="rowgroup">
            <tr role="row">
              <th role="rowheader" scope="row">
                {holding.name}{instrument?.archived && <span className="badge">{shared.archivedSuffix}</span>}
                <span className="hint holding-kind">{[copy.kinds[holding.kind], instrument?.symbol].filter(Boolean).join(" · ")}</span>
              </th>
              {cells.map((cell, index) => <td key={fields[index]} role="cell">
                <span className="holding-label hint" aria-hidden="true">{fields[index]}</span>
                <span className="amount">{cell}</span>
              </td>)}
            </tr>
            {!instrument?.archived && <tr className="holding-action" role="row"><td role="cell" colSpan={6}>
              <QuickPrice locale={locale} today={data.today} instrumentId={holding.instrumentId} name={holding.name} />
            </td></tr>}
          </tbody>;
        })}
      </table>
    )}
  </section>;
}

function Performance({ locale, data }: Pick<ViewProps, "locale" | "data">) {
  const copy = investmentsCopy[locale];
  return <>
    <div className="investment-split">
      <section className="card" aria-labelledby="investments-income-title">
        <h2 id="investments-income-title">{copy.income}</h2>
        <p className="hint investment-note">{copy.incomePeriod(data.today.slice(0, 4))}</p>
        <dl className="investment-metrics">
          <div><dt>{copy.gross}</dt><dd className="amount">{euros(data.income.grossCents, locale)}</dd></div>
          <div><dt>{copy.net}</dt><dd className="amount">{euros(data.income.netCents, locale)}</dd></div>
        </dl>
        <p className="hint investment-note">{copy.estimate}</p>
      </section>
      <section className="card" aria-labelledby="investments-realised-title">
        <h2 id="investments-realised-title">{copy.realised}</h2>
        {data.realisedByYear.length === 0 ? <p className="empty-inline">{copy.noRealised}</p> :
          <dl className="investment-yearly">{data.realisedByYear.map(({ year, gainCents }) => <div key={year}>
            <dt>{year}</dt><dd><Gain cents={gainCents} locale={locale} /></dd>
          </div>)}</dl>}
        <p className="hint investment-note">{copy.estimate}</p>
      </section>
    </div>
    <section className="card" aria-labelledby="investments-tax-title">
      <h2 id="investments-tax-title">{copy.tax}</h2>
      <p className="hint investment-note">{copy.estimate} {copy.taxRule}</p>
      {data.tax.length === 0 ? <p className="empty-inline">{copy.noRealised}</p> : <ul className="rows">
        {data.tax.map(({ year, taxClass, gainCents, lossCents, taxCents }) => (
          <li className="investment-item" key={`${year}-${taxClass}`}>
            <h3>{year} · {copy.taxClasses[taxClass]}</h3>
            <dl className="investment-metrics">
              <div><dt>{copy.taxableGains}</dt><dd><Gain cents={gainCents} locale={locale} /></dd></div>
              <div><dt>{copy.taxableLosses}</dt><dd><Gain cents={-lossCents} locale={locale} /></dd></div>
              <div><dt>{copy.taxAmount}</dt><dd className="amount">{euros(taxCents, locale)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>}
    </section>
  </>;
}

export function InvestmentsView({ locale, data, accounts, instruments, transactions, quotes }: ViewProps) {
  const copy = investmentsCopy[locale];

  return <div className="stack investment-view">
    <Trend locale={locale} series={data.series} />
    <div className="investment-split investment-overview">
      <section className="card hero investment-hero" aria-labelledby="investments-value-title">
        <h2 id="investments-value-title" className="hero-label">{copy.value}</h2>
        <p className="hero-amount amount">{euros(data.valueCents, locale)}</p>
        <p className="investment-hero-gain">
          <span className="trend-chip">{euros(data.gainCents, locale, { showPlus: true })}</span> {copy.gain}
        </p>
        <p className="hero-note">{copy.asOf} <time dateTime={data.today}>{data.today}</time></p>
      </section>
      <Allocation locale={locale} allocation={data.allocation} />
    </div>
    <Holdings locale={locale} data={data} instruments={instruments} />
    <Performance locale={locale} data={data} />
    <Transactions locale={locale} today={data.today} accounts={accounts} instruments={instruments} transactions={transactions} />
    <Instruments locale={locale} instruments={instruments} />
    <PriceHistory locale={locale} instruments={instruments} quotes={quotes} displayPrice={(value) => formatDecimal(value, locale, true)} />
  </div>;
}
