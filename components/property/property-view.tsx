"use client";

import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Costs, Overview } from "@/server/property/service";
import { formatEuros, type Locale } from "@/server/locale";
import { propertyCopy } from "./copy";
import { Charges, PropertyForm, Schedules, Tables, Valuations, type PropertyRow } from "./forms";
import { ownershipText } from "./numbers";
import "./property.css";

type ViewProps = { locale: Locale; data: Overview; accounts: AccountDto[]; costs: Costs };
type CostRow = Costs["total"];

function CostFigures({ locale, row }: { locale: Locale; row: CostRow }) {
  const copy = propertyCopy[locale];
  const figure = (label: string, cents: number, strong = false) =>
    <div><dt>{label}</dt><dd className={strong ? "amount cost-strong" : "amount"}>{formatEuros(cents, locale)}</dd></div>;
  return <dl className="property-metrics">
    {figure(copy.costsPaidOrdinary, row.paidOrdinary)}
    {figure(copy.costsPaidExtraordinary, row.paidExtraordinary)}
    {figure(copy.costsPaidBalancing, row.paidBalancing)}
    {figure(copy.costsPaid, row.paidTotal, true)}
    {figure(copy.costsPending, row.pendingCharges)}
    {figure(copy.costsOverdue, row.overdueOrdinary)}
    {figure(copy.costsForecast, row.forecastOrdinary)}
    {figure(copy.costsExpected, row.expectedTotal, true)}
  </dl>;
}

function PropertyCard({ locale, property, accounts, today, costs }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string; costs?: CostRow }) {
  const copy = propertyCopy[locale];
  const separator = locale === "it" ? "," : ".";
  const mortgage = accounts.find((account) => account.id === property.mortgageAccountId);
  const sold = property.soldOn !== null && property.soldOn <= today;
  return <section className="card property-card" aria-labelledby={`property-${property.id}`}>
    <div className="property-head">
      <h2 id={`property-${property.id}`}>{property.name}</h2>
      <span className="badge badge-blue">{copy.kinds[property.kind]}</span>
      {sold && <span className="badge badge-amber">{copy.sold}</span>}
      {property.archived && <span className="badge badge-amber">{copy.archived}</span>}
    </div>
    {property.noValuation && !sold ? <p className="hint">{copy.noValuation}. {copy.noValuationHint}</p> : null}
    <dl className="property-metrics">
      <div><dt>{copy.fullValue}</dt><dd className="amount">{property.valueCents === null ? "–" : formatEuros(property.valueCents, locale)}</dd></div>
      <div><dt>{copy.ownership}</dt><dd className="amount">{ownershipText(property.ownershipBps, separator)}%</dd></div>
      <div><dt>{copy.yourShare}</dt><dd className="amount">{formatEuros(property.shareValueCents, locale)}</dd></div>
      {mortgage && <div><dt>{copy.mortgageDebt}</dt><dd className="amount">{property.debtBalanceCents === null ? "–" : formatEuros(property.debtBalanceCents, locale)}</dd></div>}
      {property.equityCents !== null && <div><dt>{copy.equity}</dt><dd className="amount">{formatEuros(property.equityCents, locale)}</dd></div>}
    </dl>
    <p className="hint">{copy.estimateLabel}</p>
    <Valuations locale={locale} property={property} today={today} />
    {costs && <div className="property-block">
      <h4>{copy.costsTitle}</h4>
      <CostFigures locale={locale} row={costs} />
    </div>}
    <details className="property-details">
      <summary>{copy.condoTitle}</summary>
      <Tables locale={locale} property={property} />
      <Schedules locale={locale} property={property} accounts={accounts} today={today} />
      <Charges locale={locale} property={property} accounts={accounts} today={today} />
    </details>
    <details className="property-details">
      <summary>{copy.editProperty}</summary>
      <PropertyForm locale={locale} accounts={accounts} property={property} />
    </details>
  </section>;
}

export function PropertyView({ locale, data, accounts, costs }: ViewProps) {
  const copy = propertyCopy[locale];
  const active = data.properties.filter((property) => !property.archived);
  const archived = data.properties.filter((property) => property.archived);
  const costsOf = (id: string) => costs.properties.find((row) => row.propertyId === id);
  const yearLink = (year: number) => `/${locale}/property?year=${year}`;
  return <div className="stack property-view">
    <section className="card hero" aria-labelledby="property-total-title">
      <h2 id="property-total-title" className="hero-label">{copy.totalValue}</h2>
      <p className="hero-amount amount">{formatEuros(data.propertiesCents, locale)}</p>
      <p className="hero-note">{copy.totalNote}</p>
    </section>
    {data.properties.length > 0 && <section className="card" aria-labelledby="property-costs-title">
      <div className="property-head">
        <h2 id="property-costs-title">{copy.costsTitle} · {copy.costsAll}</h2>
        <nav className="property-actions property-year" aria-label={copy.costsYear}>
          {costs.year > 2000 ? <a className="button button-quiet" href={yearLink(costs.year - 1)} aria-label={copy.costsPrevious} rel="nofollow">‹</a> : <span aria-hidden="true" className="year-gap" />}
          <strong className="amount">{costs.year}</strong>
          {costs.year < 2100 ? <a className="button button-quiet" href={yearLink(costs.year + 1)} aria-label={copy.costsNext} rel="nofollow">›</a> : <span aria-hidden="true" className="year-gap" />}
        </nav>
      </div>
      <CostFigures locale={locale} row={costs.total} />
      <p className="hint costs-note">{copy.costsHint}</p>
      <p className="hint costs-note">{copy.incomeHint}</p>
    </section>}
    {data.properties.length === 0 ? <p className="card empty-inline">{copy.noProperties}</p>
      : active.map((property) => <PropertyCard key={property.id} locale={locale} property={property} accounts={accounts} today={data.today} costs={costsOf(property.id)} />)}
    {archived.length > 0 && <details className="card property-archived">
      <summary>{copy.archivedSection} ({archived.length})</summary>
      <div className="stack">
        {archived.map((property) => <PropertyCard key={property.id} locale={locale} property={property} accounts={accounts} today={data.today} costs={costsOf(property.id)} />)}
      </div>
    </details>}
    <section className="card" aria-labelledby="property-add-title">
      <h2 id="property-add-title">{copy.addProperty}</h2>
      <PropertyForm locale={locale} accounts={accounts} />
    </section>
  </div>;
}
