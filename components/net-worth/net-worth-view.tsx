"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { addDays } from "@/server/cash-flow/dates";
import type { CheckDto, NetWorthData } from "@/server/net-worth/service";
import { formatEuros, type Locale } from "@/server/locale";
import { call } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { formatMonth } from "../format";
import { parseLimit } from "../money";
import { Select } from "../select";
import { netWorthCopy } from "./copy";
import "./net-worth.css";

function Trend({ data, locale }: { data: NetWorthData; locale: Locale }) {
  const copy = netWorthCopy[locale];
  const gradient = useId();
  const low = Math.min(0, ...data.series.map((point) => point.netCents));
  const high = Math.max(0, ...data.series.map((point) => point.netCents));
  const y = (value: number) => 172 - (value - low) / Math.max(1, high - low) * 152;
  const points = data.series.map((point, index) => `${20 + index * 560 / 11},${y(point.netCents)}`);
  const line = `M ${points.join(" L ")}`;
  return (
    <section className="card" aria-labelledby="worth-trend-title">
      <h2 id="worth-trend-title">{copy.trend}</h2>
      <p className="hint">{copy.trendLabel}</p>
      <svg className="worth-chart" viewBox="0 0 600 192" role="img" aria-label={`${copy.trendLabel}. ${data.series.map(
        (point) => `${formatMonth(point.month, locale)}: ${formatEuros(point.netCents, locale)}`,
      ).join("; ")}`}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity=".24" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity=".02" />
        </linearGradient></defs>
        <path d={`M 20,${y(0)} H 580`} stroke="var(--border)" />
        <path d={`${line} L 580,${y(0)} L 20,${y(0)} Z`} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="worth-chart-labels" aria-hidden="true">
        {[data.series[0], data.series[5], data.series[11]].map((point) => <span key={point.month}>{formatMonth(point.month, locale)}</span>)}
      </div>
    </section>
  );
}

export function NetWorthView({ locale, data, checks }: { locale: Locale; data: NetWorthData; checks: CheckDto[] }) {
  const copy = netWorthCopy[locale];
  const shared = cashFlowCopy[locale];
  const action = useAction(locale);
  const [accountId, setAccountId] = useState(data.perAccount[0]?.id ?? "");
  const [asOf, setAsOf] = useState(() => addDays(data.today, -1));
  const isLiability = (id: string) => data.perAccount.some((account) => account.id === id && (account.type === "CARD" || account.type === "DEBT"));
  const [owed, setOwed] = useState(() => isLiability(accountId));
  const names = new Map(data.perAccount.map((account) => [account.id, account.name]));
  const checkType = data.perAccount.find((account) => account.id === accountId)?.type;
  const investmentCheck = checkType === "BROKERAGE" || checkType === "CRYPTO";

  return (
    <div className="stack worth-view">
      <section className="card hero" aria-labelledby="worth-total-title">
        <h2 id="worth-total-title" className="hero-label">{copy.title}</h2>
        <p className="hero-amount amount">{formatEuros(data.netCents, locale)}</p>
        <p className="worth-change"><span className="trend-chip">{formatEuros(data.changeCents, locale, { showPlus: true })}</span> {copy.change}</p>
        <p className="hero-note">{copy.asOf} <time dateTime={data.today}>{data.today}</time></p>
      </section>

      <dl className="worth-totals">
        <div className="card"><dt>{copy.assets}</dt><dd className="amount">{formatEuros(data.assetsCents, locale)}</dd></div>
        <div className="card"><dt>{copy.liabilities}</dt><dd className="amount">{formatEuros(data.liabilitiesCents, locale)}</dd></div>
      </dl>

      <Trend data={data} locale={locale} />

      <section className="card" aria-labelledby="worth-accounts-title">
        <h2 id="worth-accounts-title">{copy.accounts}</h2>
        <p className="hint">{copy.closingHint}</p>
        {data.perAccount.length === 0 ? (
          <div className="empty-inline"><p>{shared.noAccountsBody}</p><Link className="text-link" href={`/${locale}/accounts`}>{shared.goToAccounts}</Link></div>
        ) : <ul className="rows">{data.perAccount.map((account) => (
          <li className="manage-row worth-account" key={account.id}>
            <div className="row-text">
              <p>{account.name}{account.archived && <span className="badge">{shared.archivedSuffix}</span>}</p>
              <span>{shared.accountTypes[account.type]} · {account.lastCheckDate ? `${copy.lastCheck}: ${account.lastCheckDate}` : copy.noCheck}</span>
              {account.archived && account.balanceCents !== 0 && <p className="worth-flag">{copy.archivedBalance}</p>}
            </div>
            <span className={`amount${account.balanceCents < 0 ? " negative" : ""}`}>{formatEuros(account.balanceCents, locale)}</span>
          </li>
        ))}{data.holdingsCents > 0 && (
          <li className="manage-row worth-account">
            <div className="row-text">
              <p>{copy.holdings}</p>
              <Link className="text-link" href={`/${locale}/investments`}>{copy.holdingsLink}</Link>
            </div>
            <span className="amount">{formatEuros(data.holdingsCents, locale)}</span>
          </li>
        )}</ul>}
      </section>

      {data.perAccount.length > 0 && <section className="card" aria-labelledby="worth-record-title">
        <h2 id="worth-record-title">{copy.record}</h2>
        <p className="hint" id="worth-rule">{copy.rule}</p>
        {investmentCheck && <p className="hint" id="worth-investment-cash-note">{copy.investmentCashWarning}</p>}
        <form className="form-grid" aria-labelledby="worth-record-title"
          aria-describedby={investmentCheck ? "worth-rule worth-investment-cash-note" : "worth-rule"} onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const cents = parseLimit(String(form.get("amount") ?? ""));
          if (cents === null) {
            action.setNotice({ kind: "error", text: copy.amountError });
            return;
          }
          await action.run(() => call("POST", "/balances", {
            accountId, asOf: String(form.get("asOf")), balanceCents: owed ? -cents : cents,
          }, "/api/net-worth"), copy.saved);
        }}>
          <div className="form-field">
            <label htmlFor="worth-account">{shared.account}</label>
            <Select id="worth-account" value={accountId} onChange={(value) => { setAccountId(value); setOwed(isLiability(value)); }}
              options={data.perAccount.map((account) => ({ value: account.id, label: `${account.name}${account.archived ? ` · ${shared.archivedSuffix}` : ""}` }))} />
          </div>
          <div className="form-field">
            <label htmlFor="worth-date">{shared.date}</label>
            <input id="worth-date" className="field" name="asOf" type="date" min="2000-01-01" max={data.today}
              value={asOf} onChange={(event) => setAsOf(event.target.value)}
              aria-describedby={asOf === data.today ? "worth-today-note" : undefined} required />
            {asOf === data.today && <p id="worth-today-note" className="hint" role="note">{copy.todayWarning}</p>}
          </div>
          <div className="form-field">
            <label htmlFor="worth-amount">{shared.amount} (EUR)</label>
            <input id="worth-amount" className="field amount-field" name="amount" inputMode="decimal" aria-describedby="worth-amount-hint" required />
            <p className="hint" id="worth-amount-hint">{shared.amountHint}</p>
          </div>
          <label className="check wide"><input type="checkbox" checked={owed} onChange={(event) => setOwed(event.target.checked)} />{copy.owed}</label>
          <button className="button button-solid form-submit" type="submit" disabled={action.pending}>{action.pending ? shared.saving : copy.record}</button>
        </form>
        <NoticeLine notice={action.notice} />
      </section>}

      <section className="card" aria-labelledby="worth-checks-title">
        <h2 id="worth-checks-title">{copy.recent}</h2>
        {checks.length === 0 ? <p className="empty-inline">{copy.empty}</p> : <ul className="rows">{checks.map((check) => (
          <li className="manage-row worth-account" key={check.id}>
            <div className="row-text"><p>{names.get(check.accountId)}</p><time dateTime={check.asOf}>{check.asOf}</time></div>
            <span className="amount">{formatEuros(check.balanceCents, locale)}</span>
            <button className="button button-quiet" type="button" disabled={action.pending}
              aria-label={`${shared.delete}: ${names.get(check.accountId)}, ${check.asOf}`}
              onClick={() => action.run(() => call("DELETE", `/balances/${check.id}`, undefined, "/api/net-worth"), copy.removed)}>{shared.delete}</button>
          </li>
        ))}</ul>}
      </section>
    </div>
  );
}
