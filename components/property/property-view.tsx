"use client";

import Link from "next/link";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Contracts } from "@/server/property/contracts";
import type { Bills } from "@/server/property/bills";
import type { Costs, Overview } from "@/server/property/service";
import { type Locale } from "@/server/locale";
import { propertyCopy } from "./copy";
import { PropertyContracts } from "./contracts";
import { LegacyBills } from "./bills";
import { PropertyForm, Schedules, Tables, Valuations, type PropertyRow } from "./forms";
import { ownershipText } from "./numbers";
import { euros } from "@/components/euros";
import { Icon } from "@/components/icon";
import { InfoTip } from "@/components/info-tip";
import "./property.css";

type ViewProps = { locale: Locale; data: Overview; accounts: AccountDto[]; costs: Costs };
type CostRow = Costs["total"];

function CostFigures({ locale, row }: { locale: Locale; row: CostRow }) {
  const copy = propertyCopy[locale];
  const figure = (label: string, cents: number, strong = false) =>
    <div><dt>{label}</dt><dd className={strong ? "amount cost-strong" : "amount"}>{euros(cents, locale)}</dd></div>;
  return <dl className="property-metrics">
    {figure(copy.costsPaid, row.paidTotal, true)}
    {figure(copy.costsOverdue, row.overdueOrdinary)}
    {figure(copy.costsForecast, row.forecastOrdinary)}
    {figure(copy.costsExpected, row.expectedTotal, true)}
  </dl>;
}

function PropertyCard({ locale, property, accounts, today, costs, contracts, bills }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string; costs?: CostRow; contracts: Contracts; bills: Bills["bills"] }) {
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
    {property.address && <p className="property-address">{property.address}</p>}
    <dl className="property-metrics">
      <div><dt>{copy.fullValue}</dt><dd className="amount">{property.valueCents === null ? "–" : euros(property.valueCents, locale)}</dd></div>
      <div><dt>{copy.ownership}</dt><dd className="amount">{ownershipText(property.ownershipBps, separator)}%</dd></div>
      <div><dt>{copy.yourShare}</dt><dd className="amount">{euros(property.shareValueCents, locale)}</dd></div>
      {mortgage && <div><dt>{copy.mortgageDebt}</dt><dd className="amount">{property.debtBalanceCents === null ? "–" : euros(property.debtBalanceCents, locale)}</dd></div>}
      {property.equityCents !== null && <div><dt>{copy.equity}</dt><dd className="amount">{euros(property.equityCents, locale)}</dd></div>}
    </dl>
    <Valuations locale={locale} property={property} today={today} />
    {costs && <div className="property-block">
      <div className="label-row"><h4>{copy.costsTitle}</h4><InfoTip text={copy.costsHint} /></div>
      <CostFigures locale={locale} row={costs} />
    </div>}
    <PropertyContracts locale={locale} property={property} contracts={contracts} />
    <LegacyBills locale={locale} bills={bills} />
    <details className="property-details">
      <summary>{copy.condoTitle}<Icon name="chevron" size={18} /></summary>
      <Tables locale={locale} property={property} />
      <Schedules locale={locale} property={property} accounts={accounts} today={today} />
    </details>
    <details className="property-details">
      <summary>{copy.editProperty}<Icon name="chevron" size={18} /></summary>
      <PropertyForm locale={locale} accounts={accounts} property={property} />
    </details>
  </section>;
}

function YearSelector({ locale, year, path }: { locale: Locale; year: number; path: string }) {
  const copy = propertyCopy[locale];
  const yearLink = (value: number) => `${path}?year=${value}`;
  return <nav className="property-actions property-year" aria-label={copy.costsYear}>
    {year > 2000 ? <Link className="button button-quiet" href={yearLink(year - 1)} aria-label={copy.costsPrevious} rel="nofollow"><Icon name="chevronLeft" size={20} /></Link> : <span aria-hidden="true" className="year-gap" />}
    <strong className="amount">{year}</strong>
    {year < 2100 ? <Link className="button button-quiet" href={yearLink(year + 1)} aria-label={copy.costsNext} rel="nofollow"><Icon name="chevronRight" size={20} /></Link> : <span aria-hidden="true" className="year-gap" />}
  </nav>;
}

function PropertyList({ locale, properties, year, today }: { locale: Locale; properties: PropertyRow[]; year: number; today: string }) {
  const copy = propertyCopy[locale];
  return <ul className="property-list">{properties.map((property) => <li key={property.id}>
    <Link className="property-list-link" href={`/${locale}/property/${property.id}?year=${year}`}>
      <span className="property-list-main"><strong>{property.name}</strong><span className="property-list-meta">{copy.kinds[property.kind]}{property.soldOn && property.soldOn <= today ? ` · ${copy.sold}` : ""}</span></span>
      <span className="property-list-value"><span>{copy.yourShare}</span><strong className="amount">{euros(property.shareValueCents, locale)}</strong></span>
      <Icon name="chevronRight" size={20} />
    </Link>
  </li>)}</ul>;
}

export function PropertyView({ locale, data, accounts, costs }: ViewProps) {
  const copy = propertyCopy[locale];
  const active = data.properties.filter((property) => !property.archived);
  const archived = data.properties.filter((property) => property.archived);
  return <div className="stack stack-fluid property-view">
    <section className="card hero" aria-labelledby="property-total-title">
      <div className="label-row">
        <h2 id="property-total-title" className="hero-label">{copy.totalValue}</h2>
        <InfoTip text={copy.totalNote} />
      </div>
      <p className="hero-amount amount">{euros(data.propertiesCents, locale)}</p>
    </section>
    {data.properties.length > 0 && <section className="card" aria-labelledby="property-costs-title">
      <div className="property-head">
        <div className="label-row property-costs-heading">
          <h2 id="property-costs-title">{copy.costsAll}</h2>
        </div>
        <YearSelector locale={locale} year={costs.year} path={`/${locale}/property`} />
      </div>
      <div className="property-block">
        <div className="label-row"><h3>{copy.costsTitle}</h3><InfoTip text={<>{copy.costsHint}<br /><br />{copy.incomeHint}</>} /></div>
        <CostFigures locale={locale} row={costs.total} />
      </div>
    </section>}
    {data.properties.length === 0 ? <p className="card empty-inline">{copy.noProperties}</p>
      : active.length > 0 && <section className="card"><h2>{copy.propertiesList}</h2><PropertyList locale={locale} properties={active} year={costs.year} today={data.today} /></section>}
    {archived.length > 0 && <details className="card property-archived">
      <summary>{copy.archivedSection} ({archived.length})<Icon name="chevron" size={18} /></summary>
      <PropertyList locale={locale} properties={archived} year={costs.year} today={data.today} />
    </details>}
    <section className="card" aria-labelledby="property-add-title">
      <h2 id="property-add-title">{copy.addProperty}</h2>
      <PropertyForm locale={locale} accounts={accounts} />
    </section>
  </div>;
}

export function PropertyDetail({ locale, property, accounts, today, year, cost, contracts, bills }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string; year: number; cost?: CostRow; contracts: Contracts; bills: Bills["bills"] }) {
  const copy = propertyCopy[locale];
  return <div className="stack stack-fluid property-view">
    <div className="property-head">
      <Link className="button button-quiet" href={`/${locale}/property?year=${year}`}><Icon name="chevronLeft" size={18} />{copy.backToProperties}</Link>
      <YearSelector locale={locale} year={year} path={`/${locale}/property/${property.id}`} />
    </div>
    <PropertyCard locale={locale} property={property} accounts={accounts} today={today} costs={cost} contracts={contracts} bills={bills} />
  </div>;
}
