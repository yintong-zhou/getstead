"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays } from "@/server/cash-flow/dates";
import type { CheckDto, NetWorthData } from "@/server/net-worth/service";
import { type Locale } from "@/server/locale";
import { call } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { amountInputProps } from "../amount-input";
import { parseLimit } from "../money";
import { Select } from "../select";
import { netWorthCopy } from "./copy";
import { euros } from "@/components/euros";
import { TrendCard } from "@/components/trend-card";
import "./net-worth.css";

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
    <div className="stack stack-fluid worth-view">
      {data.trend && <TrendCard locale={locale} title={copy.title} note={copy.trendNote} today={data.today} trend={data.trend} />}

      <dl className="worth-totals">
        <div className="card"><dt>{copy.assets}</dt><dd className="amount">{euros(data.assetsCents, locale)}</dd></div>
        <div className="card"><dt>{copy.liabilities}</dt><dd className="amount">{euros(data.liabilitiesCents, locale)}</dd></div>
      </dl>

      <section className={`card${data.perAccount.length > 0 ? " stack-half" : ""}`} aria-labelledby="worth-accounts-title">
        <h2 id="worth-accounts-title">{copy.accounts}</h2>
        <p className="hint">{copy.closingHint}</p>
        {data.perAccount.length === 0 && data.holdingsCents === 0 && data.propertiesCents === 0 ? (
          <div className="empty-inline"><p>{shared.noAccountsBody}</p><Link className="text-link" href={`/${locale}/accounts`}>{shared.goToAccounts}</Link></div>
        ) : <ul className="rows">{data.perAccount.map((account) => (
          <li className="manage-row worth-account" key={account.id}>
            <div className="row-text">
              <p>{account.name}{account.archived && <span className="badge">{shared.archivedSuffix}</span>}</p>
              <span>{account.customTypeName ?? shared.accountTypes[account.type]} ·{account.lastCheckDate ? `${copy.lastCheck}: ${account.lastCheckDate}` : copy.noCheck}</span>
              {account.archived && account.balanceCents !== 0 && <p className="worth-flag">{copy.archivedBalance}</p>}
            </div>
            <span className={`amount${account.balanceCents < 0 ? " negative" : ""}`}>{euros(account.balanceCents, locale)}</span>
          </li>
        ))}{data.holdingsCents > 0 && (
          <li className="manage-row worth-account">
            <div className="row-text">
              <p>{copy.holdings}</p>
              <Link className="text-link" href={`/${locale}/investments`}>{copy.holdingsLink}</Link>
            </div>
            <span className="amount">{euros(data.holdingsCents, locale)}</span>
          </li>
        )}{data.propertiesCents > 0 && (
          <li className="manage-row worth-account">
            <div className="row-text">
              <p>{copy.properties}</p>
              <Link className="text-link" href={`/${locale}/property`}>{copy.propertiesLink}</Link>
            </div>
            <span className="amount">{euros(data.propertiesCents, locale)}</span>
          </li>
        )}</ul>}
        {(data.perAccount.length > 0 || data.holdingsCents > 0 || data.propertiesCents > 0) && <p><Link className="text-link" href={`/${locale}/accounts`}>{shared.goToAccounts}</Link></p>}
      </section>

      {data.perAccount.length > 0 && <section className="card stack-half" aria-labelledby="worth-record-title">
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
            <input id="worth-amount" className="field amount-field" name="amount" {...amountInputProps(locale, parseLimit)} aria-describedby="worth-amount-hint" required />
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
            <span className="amount">{euros(check.balanceCents, locale)}</span>
            <button className="button button-quiet" type="button" disabled={action.pending}
              aria-label={`${shared.delete}: ${names.get(check.accountId)}, ${check.asOf}`}
              onClick={() => action.run(() => call("DELETE", `/balances/${check.id}`, undefined, "/api/net-worth"), copy.removed)}>{shared.delete}</button>
          </li>
        ))}</ul>}
      </section>
    </div>
  );
}
