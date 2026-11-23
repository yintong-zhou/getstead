"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { AccountDto, CategoryDto } from "@/server/cash-flow/catalog";
import type { MovementDto } from "@/server/cash-flow/movements";
import type { OccurrenceRef, TemplateDto } from "@/server/cash-flow/recurring";
import { formatEuros, type Locale } from "@/server/locale";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import { formatDay } from "../format";
import { amountInputProps } from "../amount-input";
import { editableEuros, parseEuros } from "../money";
import { Icon } from "../icon";
import { Select } from "../select";
import { call } from "./api";
import { cashFlowCopy } from "./copy";
import { NoticeLine, useAction } from "./use-action";
import { euros } from "@/components/euros";

type Props = {
  locale: Locale;
  today: string;
  accounts: AccountDto[];
  categories: CategoryDto[];
  templates: TemplateDto[];
  due: OccurrenceRef[];
  upcoming: OccurrenceRef[];
  skipped: OccurrenceRef[];
};

const days = (locale: Locale) => (locale === "it" ? { today: "Oggi", yesterday: "Ieri" } : { today: "Today", yesterday: "Yesterday" });

type CandidatePage = { movements: MovementDto[]; hasMore: boolean; pageSize: number };

/** Booked expenses in the template's account, nearest to the due date first; a month and "show more" reach older or later payments. */
function MatchPanel({ locale, template, dueDate, onDone }: { locale: Locale; template: TemplateDto; dueDate: string; onDone: () => void }) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  const { pending, notice, run } = useAction(locale);
  const [month, setMonth] = useState("");
  const [list, setList] = useState<MovementDto[] | null>(null);
  const [more, setMore] = useState(false);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(false);
  const validMonth = month === "" || (/^\d{4}-\d{2}$/.test(month) && month >= FIRST_MONTH && month <= LAST_MONTH);

  const url = (offset: number) => {
    const query = new URLSearchParams({ templateId: template.id, dueDate, offset: String(offset) });
    if (month) query.set("month", month);
    return `/recurring/candidates?${query}`;
  };

  async function showMore() {
    setLoading(true);
    const result = await call<CandidatePage>("GET", url(list?.length ?? 0));
    setLoading(false);
    if (!result.ok) return;
    setList([...(list ?? []), ...result.data.movements]);
    setMore(result.data.hasMore);
  }

  useEffect(() => {
    if (!validMonth) return;
    let current = true;
    const query = new URLSearchParams({ templateId: template.id, dueDate });
    if (month) query.set("month", month);
    call<CandidatePage>("GET", `/recurring/candidates?${query}`).then((result) => {
      if (!current) return;
      const next = result.ok ? result.data.movements : [];
      setList(next);
      setMore(result.ok && result.data.hasMore);
      setChoice(next[0]?.id ?? "");
    });
    return () => { current = false; };
  }, [template.id, dueDate, month, validMonth]);

  return (
    <div className="pair-panel">
      <h3>{copy.matchTitle}</h3>
      <div className="form-field">
        <label htmlFor={`${id}-month`}>{copy.matchMonth}</label>
        <input
          id={`${id}-month`} className="field" type="month" min={FIRST_MONTH} max={LAST_MONTH} placeholder="YYYY-MM"
          pattern="\d{4}-\d{2}" value={month} onChange={(event) => setMonth(event.target.value)} aria-describedby={`${id}-hint`} aria-invalid={!validMonth}
        />
        <span id={`${id}-hint`} className="hint">{copy.matchMonthHint}</span>
      </div>
      {list === null ? <p className="hint">…</p> : list.length === 0 ? <p className="hint">{copy.matchNone}</p> : (
        <div className="form-field">
          <label className="visually-hidden" htmlFor={id}>{copy.matchTitle}</label>
          <Select id={id} value={choice} onChange={setChoice} options={list.map((candidate) => ({
            value: candidate.id,
            label: `${formatDay(candidate.bookingDate, locale)} ${candidate.bookingDate.slice(0, 4)} · ${formatEuros(candidate.amountCents, locale)} · ${candidate.description}`,
          }))} />
        </div>
      )}
      <div className="form-actions">
        {list && list.length > 0 && (
          <button
            className="button button-solid" type="button" disabled={pending || !choice}
            onClick={async () => {
              const result = await run(() => call("POST", "/recurring/occurrences", { action: "match", templateId: template.id, dueDate, movementId: choice }), copy.matched);
              if (result) onDone();
            }}
          >
            {copy.link}
          </button>
        )}
        {more && <button className="button" type="button" disabled={loading} onClick={showMore}>{copy.showMore}</button>}
        <button className="button button-quiet" type="button" onClick={onDone}>{copy.cancel}</button>
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

function DueRow({ locale, template, dueDate, today }: { locale: Locale; template: TemplateDto; dueDate: string; today: string }) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const [amount, setAmount] = useState(editableEuros(template.amountCents, locale));
  const [matching, setMatching] = useState(false);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    const cents = parseEuros(amount);
    if (!cents) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.amountCents})` });
    await run(() => call("POST", "/recurring/occurrences", {
      action: "confirm", templateId: template.id, dueDate, ...(cents !== template.amountCents ? { amountCents: cents } : {}),
    }), copy.confirmed);
  }

  return (
    <li className="movement">
      <div className="data-row">
        <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
        <div className="row-text">
          <p>{template.description}</p>
          <span>{copy.dueOn} {formatDay(dueDate, locale, today, days(locale))} · {copy.frequencies[template.frequency]}</span>
        </div>
      </div>
      <form className="due-actions" onSubmit={confirm}>
        <div className="form-field">
          <label htmlFor={id}>{copy.expectedAmount} (€)</label>
          <input id={id} className="field amount-field" {...amountInputProps(locale, parseEuros, setAmount)} value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="form-actions">
          <button className="button button-solid" type="submit" disabled={pending}><Icon name="check" size={16} />{copy.confirm}</button>
          <button className="button" type="button" onClick={() => setMatching((value) => !value)} aria-expanded={matching}>{copy.matchOccurrence}</button>
          <button
            className="button button-quiet" type="button" disabled={pending}
            onClick={() => run(() => call("POST", "/recurring/occurrences", { action: "skip", templateId: template.id, dueDate }), copy.skipped)}
          >
            {copy.skipOccurrence}
          </button>
        </div>
      </form>
      {matching && <MatchPanel locale={locale} template={template} dueDate={dueDate} onDone={() => setMatching(false)} />}
      <NoticeLine notice={notice} />
    </li>
  );
}

function NewTemplate({ locale, today, accounts, categories }: Pick<Props, "locale" | "today" | "accounts" | "categories">) {
  const copy = cashFlowCopy[locale];
  const ids = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const active = accounts.filter((account) => !account.archived);
  const expense = categories.filter((category) => !category.archived && category.kind === "EXPENSE");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const cents = parseEuros(String(data.get("amount") ?? ""));
    if (!cents) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.amountCents})` });
    const result = await run(() => call("POST", "/recurring", {
      accountId: String(data.get("accountId")),
      categoryId: String(data.get("categoryId") ?? "") || null,
      description: String(data.get("description") ?? ""),
      amountCents: cents,
      frequency: String(data.get("frequency")),
      startDate: String(data.get("startDate")),
      ...(data.get("endDate") ? { endDate: String(data.get("endDate")) } : {}),
    }), copy.templateSaved);
    if (result) form.reset();
  }

  if (active.length === 0) return null;

  return (
    <section className="card" aria-labelledby="new-template-title">
      <h2 id="new-template-title">{copy.newTemplate}</h2>
      <form className="movement-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field wide">
            <label htmlFor={`${ids}description`}>{copy.description}</label>
            <input id={`${ids}description`} name="description" className="field" maxLength={200} required />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}account`}>{copy.account}</label>
            <Select id={`${ids}account`} name="accountId" options={active.map((account) => ({ value: account.id, label: account.name }))} />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}category`}>{copy.category}</label>
            <Select id={`${ids}category`} name="categoryId" options={[
              { value: "", label: copy.noCategory }, ...expense.map((category) => ({ value: category.id, label: category.name })),
            ]} />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}amount`}>{copy.expectedAmount} (€)</label>
            <input id={`${ids}amount`} name="amount" className="field amount-field" {...amountInputProps(locale, parseEuros)} placeholder="0,00" autoComplete="off" required />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}frequency`}>{copy.frequency}</label>
            <Select id={`${ids}frequency`} name="frequency" defaultValue="MONTHLY" options={
              (["WEEKLY", "MONTHLY", "YEARLY"] as const).map((value) => ({ value, label: copy.frequencies[value] }))
            } />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}start`}>{copy.startDate}</label>
            <input id={`${ids}start`} name="startDate" className="field" type="date" defaultValue={today} required />
          </div>
          <div className="form-field">
            <label htmlFor={`${ids}end`}>{copy.endDate}</label>
            <input id={`${ids}end`} name="endDate" className="field" type="date" />
          </div>
        </div>
        <div className="form-actions">
          <button className="button button-solid" type="submit" disabled={pending}>{pending ? copy.saving : copy.addTemplate}</button>
        </div>
        <NoticeLine notice={notice} />
      </form>
    </section>
  );
}

export function RecurringView(props: Props) {
  const { locale, today, accounts, templates, due, upcoming, skipped } = props;
  const copy = cashFlowCopy[locale];
  const { pending, notice, run } = useAction(locale);
  const byId = new Map(templates.map((template) => [template.id, template]));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const nextFor = new Map(upcoming.map((item) => [item.templateId, item.dueDate]));

  return (
    <div className="stack stack-fluid">
      <section className="card stack-half" aria-labelledby="due-title">
        <h2 id="due-title">{copy.dueSection}</h2>
        {due.length === 0 ? <p className="empty-inline">{copy.dueEmpty}</p> : (
          <ul className="rows movement-list">
            {due.map((item) => {
              const template = byId.get(item.templateId);
              return template && <DueRow key={`${item.templateId}-${item.dueDate}`} locale={locale} template={template} dueDate={item.dueDate} today={today} />;
            })}
          </ul>
        )}
        {skipped.length > 0 && (
          <details className="limit-details">
            <summary>{copy.skippedSection} ({skipped.length})</summary>
            <ul className="rows">
              {skipped.map((item) => (
                <li className="manage-row" key={`${item.templateId}-${item.dueDate}`}>
                  <div className="row-text"><p>{byId.get(item.templateId)?.description}</p><span>{formatDay(item.dueDate, locale)}</span></div>
                  <div className="row-actions">
                    <button
                      className="button button-quiet" type="button" disabled={pending}
                      onClick={() => run(() => call("POST", "/recurring/occurrences", { action: "unskip", templateId: item.templateId, dueDate: item.dueDate }), copy.saved)}
                    >
                      {copy.undoSkip}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
        <NoticeLine notice={notice} />
      </section>

      <section className="card stack-half" aria-labelledby="templates-title">
        <h2 id="templates-title">{copy.templatesSection}</h2>
        {templates.length === 0 ? <p className="empty-inline">{copy.templatesEmpty}</p> : (
          <ul className="rows">
            {templates.map((template) => (
              <li className="manage-row" key={template.id}>
                <span className="row-icon tone-amber"><Icon name="recurring" size={20} /></span>
                <div className="row-text">
                  <p>{template.description}</p>
                  <span>
                    {copy.frequencies[template.frequency]} · {accountName.get(template.accountId)}
                    {nextFor.has(template.id) && ` · ${copy.nextDue} ${formatDay(nextFor.get(template.id)!, locale)}`}
                  </span>
                </div>
                <span className="row-amount amount">{euros(-template.amountCents, locale)}</span>
                <div className="row-actions">
                  <button
                    className="button button-quiet" type="button" disabled={pending}
                    onClick={() => run(() => call("PATCH", `/recurring/${template.id}`, { archived: true }), copy.saved)}
                  >
                    {copy.archive}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewTemplate locale={locale} today={today} accounts={accounts} categories={props.categories} />
    </div>
  );
}
