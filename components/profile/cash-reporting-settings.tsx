"use client";

import type { Locale } from "@/server/locale";
import { call } from "../cash-flow/api";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { profileCopy } from "./copy";

export function CashReportingSettings({ locale, excludeCash }: { locale: Locale; excludeCash: boolean }) {
  const copy = profileCopy[locale];
  const action = useAction(locale);
  return <section className="card profile-card" aria-labelledby="cash-reporting-title">
    <h2 id="cash-reporting-title">{copy.cashReporting}</h2>
    <p className="profile-hint cash-reporting-hint" id="cash-reporting-hint">{copy.cashReportingHint}</p>
    <button className="button archived-filter cash-reporting-toggle" type="button" role="switch"
      aria-checked={excludeCash} aria-describedby="cash-reporting-hint" disabled={action.pending}
      onClick={() => void action.run(() => call("PATCH", "/settings", { excludeCash: !excludeCash }), copy.saved)}>
      <span className="cash-reporting-label">{copy.excludeCash}</span><span className="archived-filter-track" aria-hidden="true" />
    </button>
    <NoticeLine notice={action.notice} />
  </section>;
}
