"use client";

import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Bills } from "@/server/property/bills";
import type { Costs, Overview } from "@/server/property/service";
import { type Locale } from "@/server/locale";
import { propertyCopy } from "./copy";
import { BillFigures, PropertyBills } from "./bills";
import { PropertyForm, Schedules, Tables, Valuations, type PropertyRow } from "./forms";
import { ownershipText } from "./numbers";
import { euros } from "@/components/euros";
import { Icon } from "@/components/icon";
import { InfoTip } from "@/components/info-tip";
import "./property.css";

type ViewProps = { locale: Locale; data: Overview; accounts: AccountDto[]; costs: Costs; bills: Bills };
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

// `pair` puts cards two per row on wide screens; a single property spans the row like the other cards.
function PropertyCard({ locale, property, accounts, today, costs, bills, pair }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string; costs?: CostRow; bills: Bills; pair: boolean }) {
  const copy = propertyCopy[locale];
  const separator = locale === "it" ? "," : ".";
  const mortgage = accounts.find((account) => account.id === property.mortgageAccountId);
  const sold = property.soldOn !== null && property.soldOn <= today;
  return <section className={pair ? "card property-card stack-half" : "card property-card"} aria-labelledby={`property-${property.id}`}>
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
    <PropertyBills locale={locale} property={property} accounts={accounts} today={today} year={bills.year}
      bills={bills.bills.filter((bill) => bill.propertyId === property.id)}
      totals={bills.properties.find((row) => row.propertyId === property.id) ?? { paidCents: 0, dueCents: 0, overdueCents: 0 }} />
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

export function PropertyView({ locale, data, accounts, costs, bills }: ViewProps) {
  const copy = propertyCopy[locale];
  const active = data.properties.filter((property) => !property.archived);
  const archived = data.properties.filter((property) => property.archived);
  const costsOf = (id: string) => costs.properties.find((row) => row.propertyId === id);
  const yearLink = (year: number) => `/${locale}/property?year=${year}`;
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
        <nav className="property-actions property-year" aria-label={copy.costsYear}>
          {costs.year > 2000 ? <a className="button button-quiet" href={yearLink(costs.year - 1)} aria-label={copy.costsPrevious} rel="nofollow"><Icon name="chevronLeft" size={20} /></a> : <span aria-hidden="true" className="year-gap" />}
          <strong className="amount">{costs.year}</strong>
          {costs.year < 2100 ? <a className="button button-quiet" href={yearLink(costs.year + 1)} aria-label={copy.costsNext} rel="nofollow"><Icon name="chevronRight" size={20} /></a> : <span aria-hidden="true" className="year-gap" />}
        </nav>
      </div>
      <div className="property-block">
        <div className="label-row"><h3>{copy.costsTitle}</h3><InfoTip text={<>{copy.costsHint}<br /><br />{copy.incomeHint}</>} /></div>
        <CostFigures locale={locale} row={costs.total} />
      </div>
      <div className="property-block">
        <div className="label-row"><h3>{copy.billsTitle}</h3><InfoTip text={copy.billsHint} /></div>
        <BillFigures locale={locale} totals={bills.total} />
      </div>
    </section>}
    {data.properties.length === 0 ? <p className="card empty-inline">{copy.noProperties}</p>
      : active.map((property) => <PropertyCard key={property.id} pair={active.length > 1} locale={locale} property={property} accounts={accounts} today={data.today} costs={costsOf(property.id)} bills={bills} />)}
    {archived.length > 0 && <details className="card property-archived">
      <summary>{copy.archivedSection} ({archived.length})<Icon name="chevron" size={18} /></summary>
      <div className="stack">
        {archived.map((property) => <PropertyCard key={property.id} pair={false} locale={locale} property={property} accounts={accounts} today={data.today} costs={costsOf(property.id)} bills={bills} />)}
      </div>
    </details>}
    <section className="card" aria-labelledby="property-add-title">
      <h2 id="property-add-title">{copy.addProperty}</h2>
      <PropertyForm locale={locale} accounts={accounts} />
    </section>
  </div>;
}
