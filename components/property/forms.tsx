"use client";

import { DateField } from "../date-field";
import Link from "next/link";
import { useId, type ComponentProps } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Overview } from "@/server/property/service";
import { type Locale } from "@/server/locale";
import { call, errorText } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { amountInputProps } from "../amount-input";
import { Select } from "../select";
import { InfoTip } from "@/components/info-tip";
import { propertyCopy } from "./copy";
import { MAX_PAYABLE_CENTS, MAX_VALUE_CENTS, ownershipText, parseEurosUpTo, parseOwnership } from "./numbers";
import { euros } from "@/components/euros";

export type PropertyRow = Overview["properties"][number];

export const propertyCall = (method: string, path: string, body?: unknown) => call(method, path, body, "/api/property");
export const dateBounds = { min: "2000-01-01", max: "2100-12-31" } as const;

export function usePropertyAction(locale: Locale) {
  const copy = propertyCopy[locale];
  return useAction(locale, (failure) => copy.errors[failure.error] ?? errorText(cashFlowCopy[locale], failure));
}

export function Input({ label, hint, dateLocale, ...props }: ComponentProps<"input"> & { label: string; hint?: string; dateLocale?: Locale }) {
  const id = useId();
  return <div className="form-field">
    <div className="label-row"><label htmlFor={id}>{label}</label>{hint && <InfoTip id={`${id}-hint`} text={hint} />}</div>
    {dateLocale ? <DateField locale={dateLocale} id={id} name={props.name} required={props.required}
      min={String(props.min)} max={String(props.max)} defaultValue={String(props.defaultValue ?? "")} aria-describedby={hint ? `${id}-hint` : undefined} />
      : <input {...props} className="field" id={id} aria-describedby={hint ? `${id}-hint` : undefined} />}
  </div>;
}
type Opt = { value: string; label: string; disabled?: boolean };
export function Choice({ label, hint, options, ...props }: { label: string; hint?: string; options: Opt[]; name?: string; required?: boolean } & (
  { value: string; onChange: (value: string) => void; defaultValue?: never } | { defaultValue?: string; value?: never; onChange?: never }
)) {
  const id = useId();
  return <div className="form-field">
    <div className="label-row"><label htmlFor={id}>{label}</label>{hint && <InfoTip id={`${id}-hint`} text={hint} />}</div>
    <Select {...(props as { name: string; defaultValue?: string })} id={id} options={options} aria-describedby={hint ? `${id}-hint` : undefined} />
    </div>;
}
function accountOptions(rows: AccountDto[], archived: string, currentId?: string): Opt[] {
  return rows.map((row) => ({ value: row.id, label: row.name + (row.archived ? ` · ${archived}` : ""), disabled: row.archived && row.id !== currentId }));
}
export function SaveButton({ pending, locale, label }: { pending: boolean; locale: Locale; label?: string }) {
  const shared = cashFlowCopy[locale];
  return <button className="button button-solid" type="submit" disabled={pending}>{pending ? shared.saving : label ?? shared.save}</button>;
}

// ------------------------------------------------------------------ property

export function PropertyForm({ locale, accounts, property }: { locale: Locale; accounts: AccountDto[]; property?: PropertyRow }) {
  const copy = propertyCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = usePropertyAction(locale);
  const separator = locale === "it" ? "," : ".";
  const debts = accounts.filter((account) => account.type === "DEBT");
  return <form onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (field: string) => String(data.get(field) ?? "");
    const ownershipBps = parseOwnership(text("ownership"));
    if (ownershipBps === null) { action.setNotice({ kind: "error", text: copy.ownershipError }); return; }
    const body = {
      name: text("name"), kind: text("kind"), ownershipBps,
      mortgageAccountId: text("mortgage") || null, soldOn: text("soldOn") || null, address: text("address").trim() || null,
    };
    const saved = await action.run(() => property ? propertyCall("PATCH", `/properties/${property.id}`, body) : propertyCall("POST", "/properties", body), copy.propertySaved);
    if (saved && !property) form.reset();
    // The edit form lives in a collapsible <details>: fold it away once the change is saved.
    if (saved && property) form.closest("details")?.removeAttribute("open");
  }}>
    <div className="form-grid">
      <Input label={copy.name} name="name" maxLength={80} required defaultValue={property?.name ?? ""} />
      <Input label={copy.address} name="address" maxLength={200} autoComplete="street-address" hint={copy.addressHint} defaultValue={property?.address ?? ""} />
      <Choice label={copy.kind} name="kind" defaultValue={property?.kind ?? "PRIMARY_RESIDENCE"}
        options={Object.entries(copy.kinds).map(([value, label]) => ({ value, label }))} />
      <Input label={copy.ownership} name="ownership" inputMode="decimal" maxLength={6} required hint={copy.ownershipHint}
        defaultValue={ownershipText(property?.ownershipBps ?? 10_000, separator)} />
      <Choice label={copy.mortgage} name="mortgage" defaultValue={property?.mortgageAccountId ?? ""} hint={copy.mortgageHint}
        options={[{ value: "", label: copy.noMortgage }, ...accountOptions(debts, shared.archivedSuffix, property?.mortgageAccountId ?? undefined)]} />
      {property && <Input label={copy.soldOn} name="soldOn" {...dateBounds} dateLocale={locale} defaultValue={property.soldOn ?? ""} hint={copy.soldHint} />}
    </div>
    <div className="form-actions">
      <SaveButton pending={action.pending} locale={locale} />
      {property && <button className="button button-quiet" type="button" disabled={action.pending}
        onClick={() => action.run(() => propertyCall("PATCH", `/properties/${property.id}`, { archived: !property.archived }), property.archived ? copy.restore : copy.archive)}>
        {property.archived ? copy.restore : copy.archive}
      </button>}
    </div>
    <NoticeLine notice={action.notice} />
  </form>;
}

// ------------------------------------------------------------------ valuations

export function Valuations({ locale, property, today }: { locale: Locale; property: PropertyRow; today: string }) {
  const copy = propertyCopy[locale];
  const action = usePropertyAction(locale);
  const missingCurrentValue = property.noValuation && (!property.soldOn || property.soldOn > today);
  return <div className="property-block">
    <div className="label-row">
      <h4>{copy.valuationsTitle}</h4>
      <InfoTip text={missingCurrentValue ? copy.noValuationHint : copy.estimateLabel} />
    </div>
    {missingCurrentValue && property.valuations.length > 0 && <p className="empty-inline">{copy.noValuation}</p>}
    {property.valuations.length === 0 ? <p className="empty-inline">{copy.noValuations}</p> : <ul className="rows">
      {property.valuations.map((row) => <li className="property-line" key={row.id}>
        <span><time dateTime={row.asOf}>{row.asOf}</time> · <span className="amount">{euros(row.valueCents, locale)}</span></span>
        <button className="button button-quiet" type="button" disabled={action.pending}
          onClick={() => action.run(() => propertyCall("DELETE", `/valuations/${row.id}`), copy.valuationRemoved)}>{copy.remove}</button>
      </li>)}
    </ul>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const valueCents = parseEurosUpTo(String(data.get("value") ?? ""), MAX_VALUE_CENTS);
      if (valueCents === null) { action.setNotice({ kind: "error", text: copy.valueError }); return; }
      const saved = await action.run(() => propertyCall("POST", "/valuations", { propertyId: property.id, asOf: String(data.get("asOf")), valueCents }), copy.valuationSaved);
      if (saved) form.reset();
    }}>
      <div className="form-grid">
        <Input label={copy.valuationDate} name="asOf" {...dateBounds} dateLocale={locale} required defaultValue={today} />
        <Input label={copy.valuationValue} name="value" {...amountInputProps(locale, (value) => parseEurosUpTo(value, MAX_VALUE_CENTS))} required />
      </div>
      <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={copy.addValuation} /></div>
      <NoticeLine notice={action.notice} />
    </form>
  </div>;
}

// ------------------------------------------------------------------ millesimi tables

export function Tables({ locale, property }: { locale: Locale; property: PropertyRow }) {
  const copy = propertyCopy[locale];
  const action = usePropertyAction(locale);
  return <div className="property-block">
    <div className="label-row"><h4>{copy.tablesTitle}</h4><InfoTip text={copy.tablesHint} /></div>
    {property.tables.length === 0 ? <p className="empty-inline">{copy.noTables}</p> : <ul className="rows">
      {property.tables.map((row) => <li className="property-line" key={row.id}>
        <span>{row.label} · <strong>{row.unitMillesimi} / {row.totalMillesimi}</strong> ({row.weight.percent}% {copy.votes})</span>
        <button className="button button-quiet" type="button" disabled={action.pending}
          onClick={() => action.run(() => propertyCall("DELETE", `/tables/${row.id}`), copy.tableRemoved)}>{copy.remove}</button>
      </li>)}
    </ul>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const unit = Number(data.get("unit")), total = Number(data.get("total"));
      if (!Number.isInteger(unit) || !Number.isInteger(total) || unit < 1 || unit > total || total > 100_000) { action.setNotice({ kind: "error", text: copy.millesimiError }); return; }
      const saved = await action.run(() => propertyCall("POST", "/tables", { propertyId: property.id, label: String(data.get("label")), unitMillesimi: unit, totalMillesimi: total }), copy.tableSaved);
      if (saved) form.reset();
    }}>
      <div className="form-grid">
        <Input label={copy.tableLabel} name="label" maxLength={60} required />
        <Input label={copy.unitMillesimi} name="unit" type="number" min="1" max="100000" step="1" required />
        <Input label={copy.totalMillesimi} name="total" type="number" min="1" max="100000" step="1" required defaultValue="1000" />
      </div>
      <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={copy.addTable} /></div>
      <NoticeLine notice={action.notice} />
    </form>
  </div>;
}

// ------------------------------------------------------------------ instalment schedules

export function Schedules({ locale, property, accounts, today }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string }) {
  const copy = propertyCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = usePropertyAction(locale);
  const payable = accounts.filter((account) => account.type !== "DEBT");
  return <div className="property-block">
    <div className="label-row"><h4>{copy.schedulesTitle}</h4><InfoTip text={copy.schedulesHint} /></div>
    {property.schedules.length === 0 ? <p className="empty-inline">{copy.noSchedules}</p> : <ul className="rows">
      {property.schedules.map((row) => <li className="property-line" key={row.id}>
        <span>{row.description} · <span className="amount">{euros(row.amountCents, locale)}</span> · {copy.frequencies[row.frequency]}
          {" · "}{row.archived ? copy.endedOrArchived : row.nextDue ? <>{copy.nextDue} <time dateTime={row.nextDue}>{row.nextDue}</time></> : null}</span>
        <span className="property-actions">
          <Link className="button button-quiet" href={`/${locale}/recurring`}>{copy.openRecurring}</Link>
          <button className="button button-quiet" type="button" disabled={action.pending}
            onClick={() => action.run(() => propertyCall("DELETE", `/schedules/${row.id}`), copy.scheduleUnlinked)}>{copy.unlink}</button>
        </span>
      </li>)}
    </ul>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const text = (field: string) => String(data.get(field) ?? "");
      const amountCents = parseEurosUpTo(text("amount"), MAX_PAYABLE_CENTS);
      if (amountCents === null) { action.setNotice({ kind: "error", text: copy.payableError }); return; }
      const saved = await action.run(() => propertyCall("POST", "/schedules", {
        propertyId: property.id, accountId: text("accountId"), description: text("description"), amountCents,
        frequency: text("frequency"), startDate: text("startDate"),
      }), copy.scheduleSaved);
      if (saved) form.reset();
    }}>
      <div className="form-grid">
        <Input label={copy.description} name="description" maxLength={200} required />
        <Input label={copy.amount} name="amount" {...amountInputProps(locale, (value) => parseEurosUpTo(value, MAX_PAYABLE_CENTS))} required />
        <Choice label={copy.frequency} name="frequency" defaultValue="MONTHLY"
          options={Object.entries(copy.frequencies).map(([value, label]) => ({ value, label }))} />
        <Input label={copy.startDate} name="startDate" {...dateBounds} dateLocale={locale} required defaultValue={today} />
        <Choice label={copy.account} name="accountId" defaultValue="" required
          options={[{ value: "", label: copy.select, disabled: true }, ...accountOptions(payable, shared.archivedSuffix)]} />
      </div>
      <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={copy.addSchedule} /></div>
      <NoticeLine notice={action.notice} />
    </form>
  </div>;
}
