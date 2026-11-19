"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import type { BudgetRow } from "@/server/cash-flow/budget";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import { formatEuros, type Locale } from "@/server/locale";
import { addMonths, formatMonth } from "../format";
import { parseLimit } from "../money";
import { call, type ApiResult } from "./api";
import { cashFlowCopy } from "./copy";
import { NoticeLine, useAction, type Notice } from "./use-action";

const palette = ["var(--brand)", "var(--chart-2)", "var(--warning)", "#a855f7", "#f43f5e"];

type BudgetResponse = { month: string; rows: BudgetRow[] };

/**
 * The base limit always starts in the current month, whichever month is on screen, and a one-month
 * limit belongs to the month on screen. Every action says so, and the feedback reports what the
 * selected month actually shows afterwards, so a saved value that does not apply is never hidden.
 */
function LimitForm({ locale, row, month, currentMonth, frozen }: {
  locale: Locale; row: BudgetRow; month: string; currentMonth: string; frozen: boolean;
}) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  const { pending, notice, run, setNotice } = useAction(locale);
  const [value, setValue] = useState("");
  const current = formatMonth(currentMonth, locale);
  const selected = formatMonth(month, locale);

  /** Runs a change, then reads the selected month back so the message matches what it now shows. */
  function change(request: () => Promise<ApiResult<unknown>>, message: (shown: BudgetRow | undefined) => NonNullable<Notice>) {
    return run(async () => {
      const saved = await request();
      if (!saved.ok) return saved;
      const view = await call<BudgetResponse>("GET", `/budget?month=${month}`);
      const shown = view.ok ? view.data.rows.find((item) => item.categoryId === row.categoryId) : undefined;
      return { ok: true as const, data: shown };
    }, message);
  }

  async function save(event: FormEvent, scope: "base" | "month") {
    event.preventDefault();
    const cents = parseLimit(value);
    if (cents === null) return setNotice({ kind: "error", text: `${copy.errors.validation} (${copy.fields.limitCents}). ${copy.amountHint}` });
    const result = await change(
      () => call("PUT", "/budget/limits", { categoryId: row.categoryId, limitCents: cents, ...(scope === "month" ? { month } : {}) }),
      (shown): NonNullable<Notice> => {
        if (scope === "month") return { kind: "ok", text: copy.savedOnlyFor(selected) };
        // A one-month limit on the selected month outranks the base: say so instead of "saved".
        return shown?.limitSource === "override"
          ? { kind: "warn", text: copy.overrideStillApplies(selected) }
          : { kind: "ok", text: copy.savedFrom(current) };
      },
    );
    if (result) setValue("");
  }

  if (frozen) return <p className="hint">{copy.pastMonthNote}</p>;

  return (
    <form className="limit-form" onSubmit={(event) => save(event, "base")}>
      <div className="form-field">
        <label htmlFor={id}>{copy.limitInput} (€)</label>
        <input id={id} className="field amount-field" inputMode="decimal" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} required aria-describedby={`${id}-hint`} />
        <span id={`${id}-hint`} className="hint">{copy.baseStartsHint(current)}</span>
      </div>
      <div className="form-actions">
        <button className="button button-solid" type="submit" disabled={pending}>{copy.applyFrom(current)}</button>
        <button className="button" type="button" disabled={pending} onClick={(event) => save(event, "month")}>{copy.applyOnlyFor(selected)}</button>
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

function MonthStep({ href, label, symbol, disabledLabel }: { href: string | null; label: string; symbol: string; disabledLabel: string }) {
  return href
    ? <Link className="icon-button" href={href} aria-label={label}><span aria-hidden="true">{symbol}</span></Link>
    : <span className="icon-button is-disabled" role="link" aria-disabled="true" aria-label={`${label} (${disabledLabel})`}><span aria-hidden="true">{symbol}</span></span>;
}

export function BudgetView({ locale, month, currentMonth, rows }: { locale: Locale; month: string; currentMonth: string; rows: BudgetRow[] }) {
  const copy = cashFlowCopy[locale];
  const frozen = month < currentMonth;
  const link = (target: string) => `/${locale}/budget?month=${target}`;

  return (
    <div className="stack">
      <section className="card" aria-labelledby="budget-month-title">
        <div className="card-head">
          <h2 id="budget-month-title">{copy.budgetTitle}</h2>
          <nav className="month-nav" aria-label={copy.month}>
            <MonthStep href={month > FIRST_MONTH ? link(addMonths(month, -1)) : null} label={copy.previousMonth} symbol="‹" disabledLabel={copy.firstMonth} />
            <time className="month-nav-label" dateTime={month}>{formatMonth(month, locale)}</time>
            <MonthStep href={month < LAST_MONTH ? link(addMonths(month, 1)) : null} label={copy.nextMonth} symbol="›" disabledLabel={copy.lastMonth} />
          </nav>
        </div>
        <p className="hint">{copy.refundNote}</p>

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
                      <strong>{formatEuros(row.spentCents, locale)}</strong>
                      {row.limitCents !== null ? ` / ${formatEuros(row.limitCents, locale)}` : ` · ${copy.noLimit}`}
                    </span>
                  </div>
                  {row.limitCents !== null && (
                    <progress value={Math.max(0, Math.min(row.spentCents, row.limitCents))} max={Math.max(row.limitCents, 1)} aria-label={row.name} />
                  )}
                  <dl className="budget-facts">
                    <div><dt>{copy.spent}</dt><dd className="amount">{formatEuros(row.spentCents, locale)}</dd></div>
                    <div><dt>{copy.limit}</dt><dd className="amount">{row.limitCents === null ? "—" : formatEuros(row.limitCents, locale)}</dd></div>
                    <div>
                      <dt>{copy.variance}</dt>
                      <dd className={`amount${over ? " negative" : ""}`}>
                        {variance === null ? "—" : over ? `▲ ${copy.overBy} ${formatEuros(-variance, locale)}` : `${formatEuros(variance, locale)} ${copy.leftOf}`}
                      </dd>
                    </div>
                  </dl>
                  {row.limitSource !== "none" && <p className="hint">{row.limitSource === "override" ? copy.limitOverride : copy.limitBase}</p>}
                  {over && !frozen && <p className="budget-flag">{copy.overBudgetAction}</p>}
                  <details className="limit-details">
                    <summary>{copy.edit}<span className="visually-hidden"> — {row.name}</span></summary>
                    <LimitForm locale={locale} row={row} month={month} currentMonth={currentMonth} frozen={frozen} />
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
