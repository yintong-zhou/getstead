"use client";

import { DateField } from "../date-field";
import { useEffect, useId, useState } from "react";
import type { AccountDto } from "@/server/cash-flow/catalog";
import type { MovementDto } from "@/server/cash-flow/movements";
import { FIRST_MONTH, LAST_MONTH } from "@/server/cash-flow/dates";
import { formatEuros, type Locale } from "@/server/locale";
import { formatDay } from "../format";
import { Select } from "../select";
import { call, type ApiResult } from "./api";
import { cashFlowCopy } from "./copy";
import { NoticeLine, useAction } from "./use-action";

type CandidatePage = { movements: MovementDto[]; hasMore: boolean; pageSize: number };

type Props = {
  locale: Locale;
  /** GET path (relative to `base`) for a candidate page; the picker adds `offset` and `month`. */
  path: (query: URLSearchParams) => string;
  base?: string;
  /** With accounts, each option names the movement's account (the bill picker searches every account). */
  accounts?: AccountDto[];
  link: (movementId: string) => Promise<ApiResult<unknown>>;
  success: string;
  failureText?: Parameters<typeof useAction>[1];
  onDone: () => void;
};

/**
 * Booked expenses nearest to a due date first, as the server orders them; a month and "show more"
 * reach older or later payments. Shared by recurring occurrences and utility bills.
 */
export function MovementPicker({ locale, path, base, accounts, link, success, failureText, onDone }: Props) {
  const copy = cashFlowCopy[locale];
  const id = useId();
  const { pending, notice, run } = useAction(locale, failureText);
  const [month, setMonth] = useState("");
  const [list, setList] = useState<MovementDto[] | null>(null);
  const [more, setMore] = useState(false);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(false);
  const validMonth = month === "" || (/^\d{4}-\d{2}$/.test(month) && month >= FIRST_MONTH && month <= LAST_MONTH);

  const url = (offset?: number) => {
    const query = new URLSearchParams();
    if (offset !== undefined) query.set("offset", String(offset));
    if (month) query.set("month", month);
    return path(query);
  };

  async function showMore() {
    setLoading(true);
    const result = await call<CandidatePage>("GET", url(list?.length ?? 0), undefined, base);
    setLoading(false);
    if (!result.ok) return;
    setList([...(list ?? []), ...result.data.movements]);
    setMore(result.data.hasMore);
  }

  const first = url();
  useEffect(() => {
    if (!validMonth) return;
    let current = true;
    call<CandidatePage>("GET", first, undefined, base).then((result) => {
      if (!current) return;
      const next = result.ok ? result.data.movements : [];
      setList(next);
      setMore(result.ok && result.data.hasMore);
      setChoice(next[0]?.id ?? "");
    });
    return () => { current = false; };
  }, [first, base, validMonth]);

  const accountName = (accountId: string) => accounts?.find((account) => account.id === accountId)?.name;
  return (
    <div className="pair-panel">
      <h3>{copy.matchTitle}</h3>
      <div className="form-field">
        <label htmlFor={`${id}-month`}>{copy.matchMonth}</label>
        <DateField locale={locale}
          id={`${id}-month`} type="month" min={FIRST_MONTH} max={LAST_MONTH} placeholder="YYYY-MM"
          pattern="\d{4}-\d{2}" value={month} onValueChange={setMonth} aria-describedby={`${id}-hint`} aria-invalid={!validMonth}
        />
        <span id={`${id}-hint`} className="hint">{copy.matchMonthHint}</span>
      </div>
      {list === null ? <p className="hint">…</p> : list.length === 0 ? <p className="hint">{copy.matchNone}</p> : (
        <div className="form-field">
          <label className="visually-hidden" htmlFor={id}>{copy.matchTitle}</label>
          <Select id={id} value={choice} onChange={setChoice} options={list.map((candidate) => ({
            value: candidate.id,
            label: [
              `${formatDay(candidate.bookingDate, locale)} ${candidate.bookingDate.slice(0, 4)}`, formatEuros(candidate.amountCents, locale),
              accountName(candidate.accountId), candidate.description,
            ].filter(Boolean).join(" · "),
          }))} />
        </div>
      )}
      <div className="form-actions">
        {list && list.length > 0 && (
          <button
            className="button button-solid" type="button" disabled={pending || !choice}
            onClick={async () => {
              const result = await run(() => link(choice), success);
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
