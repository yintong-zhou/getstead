"use client";

import Link from "next/link";
import { useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { BudgetRow } from "@/server/cash-flow/budget";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import { formatEuros, type Locale } from "@/server/locale";
import { addMonths, formatMonth } from "../format";
import { editableEuros, parseLimit } from "../money";
import { call, type ApiResult } from "./api";
import { cashFlowCopy } from "./copy";
import { Step } from "./movements-view";
import { NoticeLine, useAction, type Notice } from "./use-action";
import { euros } from "@/components/euros";

const palette = ["var(--brand)", "var(--chart-2)", "var(--warning)", "#a855f7", "#f43f5e"];

type BudgetResponse = { month: string; rows: BudgetRow[] };

/**
 * The base limit always starts in the current month, whichever month is on screen, and a one-month
 * limit belongs to the month on screen. Every action says so, and the feedback reports what the
 * selected month actually shows afterwards, so a saved value that does not apply is never hidden.
 */
function LimitForm({ locale, row, month, currentMonth, onDone }: {
  locale: Locale; row: BudgetRow; month: string; currentMonth: string; onDone: (notice: Notice) => void;
}) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const [value, setValue] = useState(() => row.limitCents === null ? "" : editableEuros(row.limitCents, locale));
  const current = formatMonth(currentMonth, locale);
  const selected = formatMonth(month, locale);
  const monthlyFirst = row.limitSource === "override" || month !== currentMonth;
  const scopes = monthlyFirst ? (["month", "base"] as const) : (["base", "month"] as const);

  /** Runs a change, then reads the selected month back so the message matches what it now shows. */
  async function change(request: () => Promise<ApiResult<unknown>>, message: (shown: BudgetRow | undefined) => NonNullable<Notice>) {
    const result = await run(async () => {
      const saved = await request();
      if (!saved.ok) return saved;
      const view = await call<BudgetResponse>("GET", `/budget?month=${month}`);
      const shown = view.ok ? view.data.rows.find((item) => item.categoryId === row.categoryId) : undefined;
      return { ok: true as const, data: shown };
    });
    if (result) onDone(message(result.data));
  }

  async function save(event: FormEvent, scope: "base" | "month") {
    event.preventDefault();
    const cents = parseLimit(value);
    if (cents === null) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.limitCents}). ${copy.amountHint}` });
    await change(
      () => call("PUT", "/budget/limits", { categoryId: row.categoryId, limitCents: cents, ...(scope === "month" ? { month } : {}) }),
      (shown): NonNullable<Notice> => {
        if (scope === "month") return { kind: "ok", text: copy.savedOnlyFor(selected) };
        // A one-month limit on the selected month outranks the base: say so instead of "saved".
        return shown?.limitSource === "override"
          ? { kind: "warn", text: copy.overrideStillApplies(selected) }
          : { kind: "ok", text: copy.savedFrom(current) };
      },
    );
  }

  return (
    <form className="limit-form" onSubmit={(event) => save(event, scopes[0])}>
      <div className="form-field">
        <label htmlFor={id}>{copy.limitInput} (€)</label>
        <input id={id} className="field amount-field" inputMode="decimal" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} required aria-describedby={`${id}-hint`} />
        <span id={`${id}-hint`} className="hint">{copy.baseStartsHint(current)}</span>
      </div>
      <div className="form-actions">
        {scopes.map((scope, index) => <button key={scope} className={index === 0 ? "button button-solid" : "button"}
          type={index === 0 ? "submit" : "button"} disabled={pending}
          onClick={index === 0 ? undefined : (event) => save(event, scope)}>
          {scope === "base" ? copy.applyFrom(current) : copy.applyOnlyFor(selected)}
        </button>)}
        <button className="button button-quiet" type="button" disabled={pending} onClick={() => onDone(null)}>{copy.cancel}</button>
      </div>
      {row.limitSource !== "none" && (
        <div className="form-actions">
          {row.limitSource === "override" && (
            <button
              className="button button-quiet" type="button" disabled={pending}
              onClick={() => change(
                () => call("DELETE", `/budget/limits?categoryId=${row.categoryId}&month=${month}`),
                (): NonNullable<Notice> => ({ kind: "ok", text: copy.overrideRemoved }),
              )}
            >
              {copy.removeOverride}
            </button>
          )}
          <button
            className="button button-quiet" type="button" disabled={pending}
            onClick={() => change(
              () => call("PUT", "/budget/limits", { categoryId: row.categoryId, limitCents: null }),
              (shown): NonNullable<Notice> => shown?.limitCents != null
                ? { kind: "warn", text: copy.endedButOverride(current, selected) }
                : { kind: "ok", text: copy.budgetEnded(current) },
            )}
          >
            {copy.endBudgetFrom(current)}
          </button>
        </div>
      )}
      <NoticeLine notice={notice} />
    </form>
  );
}

export function BudgetView({ locale, month, currentMonth, rows }: { locale: Locale; month: string; currentMonth: string; rows: BudgetRow[] }) {
  return <BudgetMonth key={month} locale={locale} month={month} currentMonth={currentMonth} rows={rows} />;
}

function BudgetMonth({ locale, month, currentMonth, rows }: { locale: Locale; month: string; currentMonth: string; rows: BudgetRow[] }) {
  const copy = cashFlowCopy[locale];
  const frozen = month < currentMonth;
  const link = (target: string) => `/${locale}/budget?month=${target}`;
  const [editing, setEditing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; notice: Notice } | null>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="budget-month-title">
        <div className="card-head">
          <h2 id="budget-month-title">{copy.month}</h2>
          <nav className="month-nav" aria-label={copy.month}>
            <Step href={month > FIRST_MONTH ? link(addMonths(month, -1)) : null} label={copy.previousMonth} direction="previous" disabledLabel={copy.firstMonth} />
            <time className="month-nav-label" dateTime={month}>{formatMonth(month, locale)}</time>
            <Step href={month < LAST_MONTH ? link(addMonths(month, 1)) : null} label={copy.nextMonth} direction="next" disabledLabel={copy.lastMonth} />
          </nav>
        </div>
        <p className="hint">{copy.refundNote}</p>
        {frozen && <p className="hint">{copy.pastMonthNote}</p>}

        {rows.length === 0 ? (
          <div className="empty-inline">
            <p><strong>{copy.noExpenseCategoriesTitle}</strong></p>
            <p>{copy.noExpenseCategoriesBody}</p>
            <Link className="primary-link" href={`/${locale}/accounts`}>{copy.goToCategories}</Link>
          </div>
        ) : (
          <ul className="budget-table">
            {rows.map((row, index) => {
              const over = (row.varianceCents ?? 0) < 0;
              const variance = row.varianceCents;
              return (
                <li key={row.categoryId} className={`budget-item${over ? " budget-over" : ""}`} style={over ? undefined : ({ "--budget-color": palette[index % palette.length] } as CSSProperties)}>
                  <div className="budget-caption">
                    <span className="budget-name"><i aria-hidden="true" />{row.name}{row.archived ? ` (${copy.archivedSuffix})` : ""}</span>
                    <span className="amount budget-amount">
                      <strong>{euros(row.spentCents, locale)}</strong>
                      {row.limitCents !== null ? ` / ${formatEuros(row.limitCents, locale)}` : ` · ${copy.noLimit}`}
                    </span>
                  </div>
                  {row.limitCents !== null && (
                    <progress value={Math.max(0, Math.min(row.spentCents, row.limitCents))} max={Math.max(row.limitCents, 1)} aria-label={row.name} />
                  )}
                  <div className="budget-row-footer">
                    <div>
                      {variance !== null && <p className={`budget-variance amount${over ? " negative" : ""}`}>
                        {over ? `▲ ${copy.overBy} ${formatEuros(-variance, locale)}` : `${formatEuros(variance, locale)} ${copy.leftOf}`}
                      </p>}
                      {row.limitSource !== "none" && <p className="hint">{row.limitSource === "override" ? copy.limitOverride : copy.limitBase}</p>}
                    </div>
                    {!frozen && <button ref={editing === row.categoryId ? editTrigger : undefined} className="button button-quiet" type="button"
                      data-category={row.categoryId}
                      aria-expanded={editing === row.categoryId}
                      onClick={() => { setFeedback(null); setEditing(editing === row.categoryId ? null : row.categoryId); }}>
                      {copy.edit}<span className="visually-hidden"> — {row.name}</span>
                    </button>}
                  </div>
                  {over && !frozen && <p className="budget-flag">{copy.overBudgetAction}</p>}
                  {editing === row.categoryId && !frozen && <LimitForm locale={locale} row={row} month={month} currentMonth={currentMonth}
                    onDone={(notice) => {
                      if (editTrigger.current?.dataset.category === row.categoryId) editTrigger.current.focus();
                      setEditing((open) => open === row.categoryId ? null : open);
                      setFeedback({ id: row.categoryId, notice });
                    }} />}
                  <NoticeLine notice={feedback?.id === row.categoryId ? feedback.notice : null} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
