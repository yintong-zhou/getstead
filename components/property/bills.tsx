"use client";

import { useState } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { BillDto, Bills } from "@/server/property/bills";
import { type Locale } from "@/server/locale";
import { useConfirm } from "../confirm-dialog";
import { amountInputProps } from "../amount-input";
import { cashFlowCopy } from "../cash-flow/copy";
import { MovementPicker } from "../cash-flow/movement-picker";
import { errorText } from "../cash-flow/api";
import { NoticeLine } from "../cash-flow/use-action";
import { euros } from "@/components/euros";
import { formatDate } from "../format";
import { Icon } from "../icon";
import { InfoTip } from "../info-tip";
import { editableEuros } from "../money";
import { propertyCopy } from "./copy";
import { Choice, dateBounds, Input, propertyCall, SaveButton, usePropertyAction, type PropertyRow } from "./forms";
import { MAX_PAYABLE_CENTS, parseEurosUpTo } from "./numbers";

type Totals = Bills["total"];

/** Retain access to old records and their existing payment links after moving to contracts. */
export function LegacyBills({ locale, bills }: { locale: Locale; bills: BillDto[] }) {
  const action = usePropertyAction(locale);
  const copy = propertyCopy[locale];
  if (!bills.length) return null;
  return <details className="property-details"><summary>{locale === "it" ? "Registrazioni precedenti" : "Previous records"}<Icon name="chevron" size={18} /></summary>
    <ul className="rows">{bills.map((bill) => <li key={bill.id} className="property-charge">
      <div className="property-line"><span>{bill.provider} · {copy.billTypes[bill.type]} · {formatDate(bill.dueDate, locale)}</span><span>{euros(bill.totalCents, locale)}</span></div>
      {bill.payment && <button className="button button-quiet" type="button" disabled={action.pending} onClick={() => action.run(() => propertyCall("DELETE", `/bills/${bill.id}/payment`), copy.billUnlinked)}>{copy.unlinkPayment}</button>}
    </li>)}</ul><NoticeLine notice={action.notice} />
  </details>;
}

/** Paid, due and overdue amounts for the bills due in the selected year. */
export function BillFigures({ locale, totals }: { locale: Locale; totals: Totals }) {
  const copy = propertyCopy[locale];
  const figure = (label: string, cents: number, tone = "") =>
    <div><dt>{label}</dt><dd className={`amount ${tone}`}>{euros(cents, locale)}</dd></div>;
  return <dl className="property-metrics">
    {figure(copy.billsPaid, totals.paidCents, "cost-strong")}
    {figure(copy.billsDue, totals.dueCents)}
    {figure(copy.billsOverdue, totals.overdueCents, totals.overdueCents > 0 ? "bill-overdue-amount" : "")}
  </dl>;
}

const statusTone = { PAID: "badge-green", DUE: "badge-blue", OVERDUE: "badge-red" } as const;

/** Create (no `bill`) or edit form. The raw-material field exists for electricity and gas only. */
function BillForm({ locale, property, bill, today, onDone }: { locale: Locale; property: PropertyRow; bill?: BillDto; today: string; onDone?: () => void }) {
  const copy = propertyCopy[locale];
  const action = usePropertyAction(locale);
  const [type, setType] = useState<string>(bill?.type ?? "ELECTRICITY");
  const paid = bill?.status === "PAID";
  const parse = (value: string) => parseEurosUpTo(value, MAX_PAYABLE_CENTS);
  return <form onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (field: string) => String(data.get(field) ?? "").trim();
    const totalCents = paid ? bill.totalCents : parse(text("total"));
    if (totalCents === null) { action.setNotice({ kind: "error", text: copy.billTotalError }); return; }
    const rawText = type === "INTERNET" ? "" : text("rawMaterial");
    const rawMaterialCents = rawText ? parse(rawText) : null;
    if (rawText && (rawMaterialCents === null || rawMaterialCents > totalCents)) { action.setNotice({ kind: "error", text: copy.rawMaterialError }); return; }
    if (text("periodStart") > text("periodEnd")) { action.setNotice({ kind: "error", text: copy.periodError }); return; }
    const body = {
      type, provider: text("provider"), periodStart: text("periodStart"), periodEnd: text("periodEnd"), dueDate: text("dueDate"),
      totalCents, rawMaterialCents,
      ...(!bill && text("address") ? { address: text("address") } : {}),
    };
    const saved = await action.run(() => bill ? propertyCall("PATCH", `/bills/${bill.id}`, body) : propertyCall("POST", "/bills", { propertyId: property.id, ...body }), copy.billSaved);
    if (saved && !bill) { form.reset(); setType("ELECTRICITY"); }
    if (saved) onDone?.();
  }}>
    <div className="form-grid">
      <Choice label={copy.billType} name="type" value={type} onChange={setType}
        options={Object.entries(copy.billTypes).map(([value, label]) => ({ value, label }))} />
      <Input label={copy.provider} name="provider" maxLength={80} required defaultValue={bill?.provider ?? ""} />
      <Input label={copy.periodStart} name="periodStart" {...dateBounds} dateLocale={locale} required defaultValue={bill?.periodStart ?? ""} />
      <Input label={copy.periodEnd} name="periodEnd" {...dateBounds} dateLocale={locale} required defaultValue={bill?.periodEnd ?? ""} />
      <Input label={copy.dueDate} name="dueDate" {...dateBounds} dateLocale={locale} required defaultValue={bill?.dueDate ?? today} />
      <Input label={copy.billTotal} name="total" {...amountInputProps(locale, parse)} required={!paid} disabled={paid}
        hint={paid ? copy.paidTotalLocked : undefined} defaultValue={bill ? editableEuros(bill.totalCents, locale) : ""} />
      {type !== "INTERNET" && <Input label={copy.rawMaterial} name="rawMaterial" {...amountInputProps(locale, parse)} hint={copy.rawMaterialHint}
        defaultValue={bill?.rawMaterialCents ? editableEuros(bill.rawMaterialCents, locale) : ""} />}
      {!bill && !property.address && <Input label={copy.billAddress} name="address" maxLength={200} autoComplete="street-address" hint={copy.billAddressHint} />}
    </div>
    <div className="form-actions">
      <SaveButton pending={action.pending} locale={locale} label={bill ? copy.saveBill : copy.addBill} />
      {onDone && <button className="button button-quiet" type="button" onClick={onDone}>{cashFlowCopy[locale].cancel}</button>}
    </div>
    <NoticeLine notice={action.notice} />
  </form>;
}

function BillRow({ locale, property, bill, accounts, today }: { locale: Locale; property: PropertyRow; bill: BillDto; accounts: AccountDto[]; today: string }) {
  const copy = propertyCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = usePropertyAction(locale);
  const { confirm, dialog } = useConfirm(shared.cancel);
  const [mode, setMode] = useState<"edit" | "link" | null>(null);
  const account = bill.payment && accounts.find((row) => row.id === bill.payment!.accountId);
  return <li className="property-charge bill-row">
    <div className="property-line">
      <span className="bill-title">
        <strong>{bill.provider}</strong> · {copy.billTypes[bill.type]}
        <span className={`badge ${statusTone[bill.status]}`}>{copy.billStatus[bill.status]}</span>
      </span>
      <span className="amount">{euros(bill.totalCents, locale)}</span>
    </div>
    <p className="bill-meta">
      {copy.period} {formatDate(bill.periodStart, locale)} – {formatDate(bill.periodEnd, locale)}
      {" · "}{copy.dueOn} <time dateTime={bill.dueDate}>{formatDate(bill.dueDate, locale)}</time>
      {bill.rawMaterialCents !== null && <> · {copy.rawMaterialShort} <span className="amount">{euros(bill.rawMaterialCents, locale)}</span></>}
      {bill.payment && <> · {copy.paidOn} <time dateTime={bill.payment.bookingDate}>{formatDate(bill.payment.bookingDate, locale)}</time>{account ? ` · ${account.name}` : ""}</>}
    </p>
    <div className="property-actions">
      <button className="button button-quiet" type="button" aria-expanded={mode === "edit"} onClick={() => setMode(mode === "edit" ? null : "edit")}>{copy.editBill}</button>
      {bill.payment
        ? <button className="button button-quiet" type="button" disabled={action.pending}
          onClick={() => action.run(() => propertyCall("DELETE", `/bills/${bill.id}/payment`), copy.billUnlinked)}>{copy.unlinkPayment}</button>
        : <button className="button" type="button" aria-expanded={mode === "link"} onClick={() => setMode(mode === "link" ? null : "link")}>{copy.linkPayment}</button>}
      {!bill.payment && <button className="button button-quiet" type="button" disabled={action.pending}
        onClick={async () => { if (await confirm(copy.deleteBillConfirm, copy.deleteBill, true)) await action.run(() => propertyCall("DELETE", `/bills/${bill.id}`), copy.billRemoved); }}>
        {copy.deleteBill}</button>}
    </div>
    {mode === "edit" && <BillForm locale={locale} property={property} bill={bill} today={today} onDone={() => setMode(null)} />}
    {mode === "link" && <MovementPicker locale={locale} base="/api/property" accounts={accounts} success={copy.billLinked}
      failureText={(failure) => copy.errors[failure.error] ?? errorText(shared, failure)}
      path={(query) => `/bills/${bill.id}/candidates?${query}`}
      link={(movementId) => propertyCall("POST", `/bills/${bill.id}/payment`, { movementId })} onDone={() => setMode(null)} />}
    <NoticeLine notice={action.notice} />
    {dialog}
  </li>;
}

/** One property's bills due in the selected year, with their totals and an add form. Shown for archived and sold properties too. */
export function PropertyBills({ locale, property, bills, totals, year, accounts, today }: {
  locale: Locale; property: PropertyRow; bills: BillDto[]; totals: Totals; year: number; accounts: AccountDto[]; today: string;
}) {
  const copy = propertyCopy[locale];
  return <div className="property-block">
    <div className="label-row"><h4>{copy.billsTitle} · {year}</h4><InfoTip text={copy.billsHint} /></div>
    <BillFigures locale={locale} totals={totals} />
    {bills.length === 0 ? <p className="empty-inline">{copy.noBills}</p> : <ul className="rows">
      {bills.map((bill) => <BillRow key={bill.id} locale={locale} property={property} bill={bill} accounts={accounts} today={today} />)}
    </ul>}
    <details className="property-details">
      <summary>{copy.addBill}<Icon name="chevron" size={18} /></summary>
      <BillForm locale={locale} property={property} today={today} />
    </details>
  </div>;
}
