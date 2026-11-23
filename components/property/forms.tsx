"use client";

import { DateField } from "../date-field";
import Link from "next/link";
import { useId, useState, type ComponentProps } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { Overview } from "@/server/property/service";
import { type Locale } from "@/server/locale";
import { call, errorText } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { amountInputProps } from "../amount-input";
import { editableEuros } from "../money";
import { Select } from "../select";
import { InfoTip } from "@/components/info-tip";
import { propertyCopy } from "./copy";
import { MAX_BUILDING_CENTS, MAX_PAYABLE_CENTS, MAX_VALUE_CENTS, millesimiShare, ownershipText, parseEurosUpTo, parseOwnership } from "./numbers";
import { euros } from "@/components/euros";

export type PropertyRow = Overview["properties"][number];

const propertyCall = (method: string, path: string, body?: unknown) => call(method, path, body, "/api/property");
const dateBounds = { min: "2000-01-01", max: "2100-12-31" } as const;

function usePropertyAction(locale: Locale) {
  const copy = propertyCopy[locale];
  return useAction(locale, (failure) => copy.errors[failure.error] ?? errorText(cashFlowCopy[locale], failure));
}

function Input({ label, hint, dateLocale, ...props }: ComponentProps<"input"> & { label: string; hint?: string; dateLocale?: Locale }) {
  const id = useId();
  return <div className="form-field">
    <div className="label-row"><label htmlFor={id}>{label}</label>{hint && <InfoTip id={`${id}-hint`} text={hint} />}</div>
    {dateLocale ? <DateField locale={dateLocale} id={id} name={props.name} required={props.required}
      min={String(props.min)} max={String(props.max)} defaultValue={String(props.defaultValue ?? "")} aria-describedby={hint ? `${id}-hint` : undefined} />
      : <input {...props} className="field" id={id} aria-describedby={hint ? `${id}-hint` : undefined} />}
  </div>;
}
type Opt = { value: string; label: string; disabled?: boolean };
function Choice({ label, hint, options, ...props }: { label: string; hint?: string; options: Opt[]; name?: string; required?: boolean } & (
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
function SaveButton({ pending, locale, label }: { pending: boolean; locale: Locale; label?: string }) {
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
      mortgageAccountId: text("mortgage") || null, soldOn: text("soldOn") || null,
    };
    const saved = await action.run(() => property ? propertyCall("PATCH", `/properties/${property.id}`, body) : propertyCall("POST", "/properties", body), copy.propertySaved);
    if (saved && !property) form.reset();
    // The edit form lives in a collapsible <details>: fold it away once the change is saved.
    if (saved && property) form.closest("details")?.removeAttribute("open");
  }}>
    <div className="form-grid">
      <Input label={copy.name} name="name" maxLength={80} required defaultValue={property?.name ?? ""} />
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
  return <div className="property-block">
    <h4>{copy.valuationsTitle}</h4>
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
    <h4>{copy.tablesTitle}</h4>
    <p className="hint">{copy.tablesHint}</p>
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
    <h4>{copy.schedulesTitle}</h4>
    <p className="hint">{copy.schedulesHint}</p>
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

// ------------------------------------------------------------------ one-off charges

function ChargeForm({ locale, property, today }: { locale: Locale; property: PropertyRow; today: string }) {
  const copy = propertyCopy[locale];
  const action = usePropertyAction(locale);
  const [tableId, setTableId] = useState("");
  const [building, setBuilding] = useState("");
  const [amount, setAmount] = useState("");
  const table = property.tables.find((row) => row.id === tableId);
  const buildingCents = parseEurosUpTo(building, MAX_BUILDING_CENTS);
  const guide = table && buildingCents !== null ? millesimiShare(buildingCents, table.unitMillesimi, table.totalMillesimi) : null;
  return <form onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (field: string) => String(data.get(field) ?? "");
    const amountCents = parseEurosUpTo(amount, MAX_PAYABLE_CENTS);
    if (amountCents === null) { action.setNotice({ kind: "error", text: copy.payableError }); return; }
    if (tableId && buildingCents === null) { action.setNotice({ kind: "error", text: copy.valueError }); return; }
    const saved = await action.run(() => propertyCall("POST", "/charges", {
      propertyId: property.id, kind: text("kind"), title: text("title"), dueDate: text("dueDate"), amountCents,
      approvedOn: text("approvedOn") || null, tableId: tableId || null, buildingTotalCents: tableId ? buildingCents : null,
    }), copy.chargeSaved);
    if (saved) { form.reset(); setTableId(""); setBuilding(""); setAmount(""); }
  }}>
    <div className="form-grid">
      <Choice label={copy.chargeKind} name="kind" defaultValue="BALANCING"
        options={Object.entries(copy.chargeKinds).map(([value, label]) => ({ value, label }))} />
      <Input label={copy.title2} name="title" maxLength={120} required />
      <Input label={copy.dueDate} name="dueDate" {...dateBounds} dateLocale={locale} required defaultValue={today} />
      <Input label={copy.approvedOn} name="approvedOn" {...dateBounds} dateLocale={locale} />
      <Choice label={copy.tableOptional} value={tableId} onChange={setTableId}
        options={[{ value: "", label: copy.noTable }, ...property.tables.map((row) => ({ value: row.id, label: `${row.label} (${row.unitMillesimi}/${row.totalMillesimi})` }))]} />
      {tableId && <Input label={copy.buildingTotal} value={building} onChange={(event) => setBuilding(event.target.value)} {...amountInputProps(locale, (value) => parseEurosUpTo(value, MAX_BUILDING_CENTS), setBuilding)} hint={copy.buildingHint} />}
      <Input label={copy.chargeAmount} value={amount} onChange={(event) => setAmount(event.target.value)} {...amountInputProps(locale, (value) => parseEurosUpTo(value, MAX_PAYABLE_CENTS), setAmount)} required />
    </div>
    {guide !== null && <p className="hint">{copy.expectedShare}: <strong className="amount">{euros(guide, locale)}</strong>{" "}
      <button className="button button-quiet" type="button" onClick={() => setAmount(editableEuros(guide, locale))}>{copy.useShare}</button></p>}
    <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={copy.addCharge} /></div>
    <NoticeLine notice={action.notice} />
  </form>;
}

function ChargeRow({ locale, charge, accounts, today }: { locale: Locale; charge: PropertyRow["charges"][number]; accounts: AccountDto[]; today: string }) {
  const copy = propertyCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = usePropertyAction(locale);
  const [settling, setSettling] = useState(false);
  const payable = accounts.filter((account) => account.type !== "DEBT");
  const status = charge.voided ? copy.voidedLabel : charge.settled ? copy.settled : copy.pending;
  const patch = (body: unknown, success: string) => action.run(() => propertyCall("PATCH", `/charges/${charge.id}`, body), success);
  return <li className="property-charge">
    <div className="property-line">
      <span><strong>{charge.title}</strong> · {copy.chargeKinds[charge.kind]} · <time dateTime={charge.dueDate}>{charge.dueDate}</time> · <span className="amount">{euros(charge.amountCents, locale)}</span>
        {charge.expectedShareCents !== null && <> · {copy.expectedShare}: <span className="amount">{euros(charge.expectedShareCents, locale)}</span></>}
      </span>
      <span className={`badge ${charge.settled ? "badge-green" : charge.voided ? "badge-blue" : "badge-amber"}`}>{status}</span>
    </div>
    <div className="property-actions">
      {!charge.voided && !charge.settled && <button className="button button-solid" type="button" onClick={() => setSettling((open) => !open)} aria-expanded={settling}>{copy.settle}</button>}
      {charge.settled && <button className="button button-quiet" type="button" disabled={action.pending} onClick={() => patch({ action: "reopen" }, copy.reopened)}>{copy.reopen}</button>}
      {!charge.settled && <button className="button button-quiet" type="button" disabled={action.pending}
        onClick={() => patch({ voided: !charge.voided }, charge.voided ? copy.chargeRestored : copy.chargeVoided)}>{charge.voided ? copy.restoreCharge : copy.voidCharge}</button>}
    </div>
    {settling && <form onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const saved = await patch({ action: "settle", accountId: String(data.get("accountId")), bookingDate: String(data.get("bookingDate")) }, copy.settledDone);
      if (saved) setSettling(false);
    }}>
      <div className="form-grid">
        <Choice label={copy.settleAccount} name="accountId" defaultValue="" required
          options={[{ value: "", label: copy.select, disabled: true }, ...accountOptions(payable, shared.archivedSuffix)]} />
        <Input label={copy.settleDate} name="bookingDate" {...dateBounds} dateLocale={locale} required defaultValue={charge.dueDate <= today ? charge.dueDate : today} />
      </div>
      <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={copy.settleConfirm} /></div>
    </form>}
    <NoticeLine notice={action.notice} />
  </li>;
}

export function Charges({ locale, property, accounts, today }: { locale: Locale; property: PropertyRow; accounts: AccountDto[]; today: string }) {
  const copy = propertyCopy[locale];
  // Pending first by due date (the service orders by due date), then what was settled, most recent first, then voided.
  const groups = [
    { label: copy.pending, rows: property.charges.filter((charge) => !charge.settled && !charge.voided) },
    { label: copy.settled, rows: property.charges.filter((charge) => charge.settled && !charge.voided).reverse() },
    { label: copy.voidedLabel, rows: property.charges.filter((charge) => charge.voided) },
  ];
  return <div className="property-block">
    <h4>{copy.chargesTitle}</h4>
    <p className="hint">{copy.chargesHint}</p>
    {property.charges.length === 0 ? <p className="empty-inline">{copy.noCharges}</p> : groups.map(({ label, rows }) => rows.length > 0 && <div key={label}>
      <h5 className="property-group">{label}</h5>
      <ul className="rows">{rows.map((charge) => <ChargeRow key={charge.id} locale={locale} charge={charge} accounts={accounts} today={today} />)}</ul>
    </div>)}
    <ChargeForm locale={locale} property={property} today={today} />
  </div>;
}
