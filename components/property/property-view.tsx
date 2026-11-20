"use client";

import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Overview } from "@/server/property/service";
import { formatEuros, type Locale } from "@/server/locale";
import { propertyCopy } from "./copy";
import { Charges, PropertyForm, Schedules, Tables, Valuations, type PropertyRow } from "./forms";
import { ownershipText } from "./numbers";
import "./property.css";

type ViewProps = { locale: Locale; data: Overview; accounts: AccountDto[] };

function PropertyCard({ locale, property, accounts, today }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string }) {
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

export function PropertyView({ locale, data, accounts }: ViewProps) {
  const copy = propertyCopy[locale];
  return <div className="stack property-view">
    <section className="card hero" aria-labelledby="property-total-title">
      <h2 id="property-total-title" className="hero-label">{copy.totalValue}</h2>
      <p className="hero-amount amount">{formatEuros(data.propertiesCents, locale)}</p>
      <p className="hero-note">{copy.totalNote}</p>
    </section>
    {data.properties.length === 0 ? <p className="card empty-inline">{copy.noProperties}</p>
      : data.properties.map((property) => <PropertyCard key={property.id} locale={locale} property={property} accounts={accounts} today={data.today} />)}
    <section className="card" aria-labelledby="property-add-title">
      <h2 id="property-add-title">{copy.addProperty}</h2>
      <PropertyForm locale={locale} accounts={accounts} />
    </section>
  </div>;
}
