"use client";

import { useState } from "react";
import type { Contracts } from "@/server/property/contracts";
import type { Locale } from "@/server/locale";
import { NoticeLine } from "../cash-flow/use-action";
import { formatDate } from "../format";
import { Icon } from "../icon";
import { Choice, dateBounds, Input, propertyCall, SaveButton, usePropertyAction, type PropertyRow } from "./forms";

const labels = {
  it: { title: "Contratti delle utenze di casa", empty: "Nessun contratto registrato.", add: "Aggiungi contratto", edit: "Modifica", renew: "Rinnova", cancel: "Annulla", save: "Salva", saved: "Contratto salvato.", type: "Tipo di utenza", provider: "Fornitore", price: "Prezzo materia prima (EUR per unità)", unit: "Unità di misura", select: "Seleziona", month: "mese", start: "Inizio periodo", end: "Fine periodo contrattuale", duration: "Durata (mesi)", history: "Il rinnovo crea un nuovo periodo e conserva quello precedente.", invalid: "Controlla il prezzo e le date del contratto.", types: { ELECTRICITY: "Luce", GAS: "Gas", INTERNET: "Internet" } },
  en: { title: "Home utility contracts", empty: "No contracts recorded.", add: "Add contract", edit: "Edit", renew: "Renew", cancel: "Cancel", save: "Save", saved: "Contract saved.", type: "Utility type", provider: "Provider", price: "Raw material price (EUR per unit)", unit: "Unit of measure", select: "Select", month: "month", start: "Period start", end: "Contract period end", duration: "Duration (months)", history: "Renewal creates a new period and keeps the previous one.", invalid: "Check the price and contract dates.", types: { ELECTRICITY: "Electricity", GAS: "Gas", INTERNET: "Internet" } },
} as const;
type Contract = Contracts[number];

function ContractForm({ locale, property, contract, renew, done }: { locale: Locale; property: PropertyRow; contract?: Contract; renew?: boolean; done?: () => void }) {
  const t = labels[locale];
  const action = usePropertyAction(locale);
  const next = contract && renew ? new Date(`${contract.periodEnd}T00:00:00Z`) : null;
  if (next) next.setUTCDate(next.getUTCDate() + 1);
  return <form onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const price = text("unitPrice").replace(",", ".");
    if (!/^\d{1,6}(?:\.\d{1,6})?$/.test(price) || !/[1-9]/.test(price) || text("periodStart") > text("periodEnd")) {
      action.setNotice({ kind: "error", text: t.invalid }); return;
    }
    const body = { type: text("type"), provider: text("provider"), unitPrice: price, unit: text("unit"), activationDate: contract && !renew ? contract.activationDate : text("periodStart"), periodStart: text("periodStart"), periodEnd: text("periodEnd"), durationMonths: Number(text("durationMonths")) };
    const saved = await action.run(() => contract && !renew ? propertyCall("PATCH", `/contracts/${contract.id}`, body) : propertyCall("POST", "/contracts", { propertyId: property.id, ...body }), t.saved);
    if (saved) { if (!contract) form.reset(); done?.(); }
  }}>
    <div className="form-grid">
      <Choice label={t.type} name="type" defaultValue={contract?.type ?? "ELECTRICITY"} options={Object.entries(t.types).map(([value, label]) => ({ value, label }))} />
      <Input label={t.provider} name="provider" maxLength={80} required defaultValue={contract?.provider ?? ""} />
      <Input label={t.price} name="unitPrice" inputMode="decimal" maxLength={13} required defaultValue={contract?.unitPrice.replace(".", locale === "it" ? "," : ".") ?? ""} />
      <Choice label={t.unit} name="unit" required defaultValue={contract?.unit ?? ""} options={[
        { value: "", label: t.select, disabled: true },
        { value: "kWh", label: "kWh" }, { value: "Smc", label: "Smc" }, { value: "m³", label: "m³" }, { value: "month", label: t.month },
        ...(contract && !["kWh", "Smc", "m³", "month"].includes(contract.unit) ? [{ value: contract.unit, label: contract.unit }] : []),
      ]} />
      <Input label={t.start} name="periodStart" {...dateBounds} dateLocale={locale} required defaultValue={next ? next.toISOString().slice(0, 10) : contract?.periodStart ?? ""} />
      <Input label={t.end} name="periodEnd" {...dateBounds} dateLocale={locale} required defaultValue={renew ? "" : contract?.periodEnd ?? ""} />
      <Input label={t.duration} name="durationMonths" type="number" min={1} max={1200} required defaultValue={contract?.durationMonths ?? 12} />
    </div>
    <div className="form-actions"><SaveButton pending={action.pending} locale={locale} label={t.save} />{done && <button type="button" className="button button-quiet" onClick={done}>{t.cancel}</button>}</div>
    <NoticeLine notice={action.notice} />
  </form>;
}

function ContractRow({ locale, property, contract }: { locale: Locale; property: PropertyRow; contract: Contract }) {
  const [mode, setMode] = useState<"edit" | "renew" | null>(null);
  const t = labels[locale];
  return <li className="property-charge"><div className="property-line"><strong>{contract.provider} · {t.types[contract.type]}</strong><span>{contract.unitPrice.replace(".", locale === "it" ? "," : ".")} €/{contract.unit === "month" ? t.month : contract.unit}</span></div>
    <p className="bill-meta">{t.start}: {formatDate(contract.periodStart, locale)} · {t.end}: {formatDate(contract.periodEnd, locale)} · {t.duration}: {contract.durationMonths}</p>
    <div className="property-actions"><button type="button" className="button button-quiet" onClick={() => setMode(mode === "edit" ? null : "edit")}>{t.edit}</button><button type="button" className="button button-quiet" onClick={() => setMode(mode === "renew" ? null : "renew")}>{t.renew}</button></div>
    {mode && <ContractForm key={mode} locale={locale} property={property} contract={contract} renew={mode === "renew"} done={() => setMode(null)} />}
  </li>;
}

export function PropertyContracts({ locale, property, contracts }: { locale: Locale; property: PropertyRow; contracts: Contracts }) {
  const t = labels[locale];
  return <div className="property-block"><h4>{t.title}</h4><p className="empty-inline">{t.history}</p>
    {contracts.length ? <ul className="rows">{contracts.map((contract) => <ContractRow key={contract.id} locale={locale} property={property} contract={contract} />)}</ul> : <p className="empty-inline">{t.empty}</p>}
    <details className="property-details"><summary>{t.add}<Icon name="chevron" size={18} /></summary><ContractForm locale={locale} property={property} /></details>
  </div>;
}
