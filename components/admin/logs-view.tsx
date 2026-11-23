"use client";

import { DateField } from "../date-field";
import Link from "next/link";
import type { EventDto } from "@/server/admin/logs";
import { localeTags, type Locale } from "@/server/locale";
import { cashFlowCopy } from "../cash-flow/copy";
import { Pager } from "../cash-flow/movements-view";
import { Select } from "../select";
import { logsHref, type LogsQuery } from "./admin-query";
import { adminCopy } from "./copy";
import "./admin.css";

type Props = { locale: Locale; query: LogsQuery; list: { hasMore: boolean; events: EventDto[] } };

/** Filterable, paginated event log. Filters live in the URL through a plain GET form. */
export function LogsView({ locale, query, list }: Props) {
  const copy = adminCopy[locale];
  const date = new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });
  const filtered = query.kind !== "all" || Boolean(query.code || query.email || query.from || query.to);

  return <div className="stack">
    <section className="card" aria-labelledby="logs-filters-title">
      <h2 id="logs-filters-title">{cashFlowCopy[locale].filters}</h2>
      <form className="filters" method="get" action={`/${locale}/admin/logs`}>
        <div className="form-field">
          <label htmlFor="logs-kind">{copy.kind}</label>
          <Select id="logs-kind" name="kind" defaultValue={query.kind} options={[
            { value: "all", label: copy.kindAll }, { value: "ERROR", label: copy.kindError }, { value: "SECURITY", label: copy.kindSecurity },
          ]} />
        </div>
        <div className="form-field">
          <label htmlFor="logs-code">{copy.code}</label>
          <input className="field" id="logs-code" name="code" defaultValue={query.code} maxLength={64} pattern="[A-Za-z0-9_.:\-]+" />
        </div>
        <div className="form-field">
          <label htmlFor="logs-email">{copy.user}</label>
          <input className="field" id="logs-email" name="email" type="search" defaultValue={query.email} maxLength={254} />
        </div>
        <div className="form-field">
          <label htmlFor="logs-from">{copy.from}</label>
          <DateField locale={locale} id="logs-from" name="from" type="date" defaultValue={query.from} />
        </div>
        <div className="form-field">
          <label htmlFor="logs-to">{copy.to}</label>
          <DateField locale={locale} id="logs-to" name="to" type="date" defaultValue={query.to} />
        </div>
        <div className="form-field admin-submit"><button className="button">{copy.apply}</button></div>
      </form>
      {filtered && <Link className="text-link" href={logsHref(locale, {})}>{copy.resetFilters}</Link>}
      <p className="profile-hint">{copy.retention}</p>
    </section>

    <section className="card" aria-labelledby="logs-list-title">
      <h2 id="logs-list-title">{copy.logs}</h2>
      {list.events.length === 0 ? (
        <div className="empty-inline">
          <p>{query.page > 1 ? copy.emptyPage : copy.noEvents}</p>
          {query.page > 1 && <Link className="text-link" href={logsHref(locale, { ...query, page: 1 })}>{copy.backToFirstPage}</Link>}
        </div>
      ) : (
        <ul className="rows">{list.events.map((event) => (
          <li key={event.id} className="manage-row">
            <div className="row-text">
              <p>
                <span className={`badge ${event.kind === "ERROR" ? "badge-amber" : "badge-blue"}`}>{event.kind === "ERROR" ? copy.kindError : copy.kindSecurity}</span>
                <code>{event.code}</code>
              </p>
              <span>
                <time dateTime={event.createdAt}>{date.format(new Date(event.createdAt))}</time>
                {event.route && <> · {copy.route}: {event.method} {event.route}</>}
                {event.userEmail && <> · {copy.user}: {event.userEmail}</>}
                {event.actorEmail && <> · {copy.actor}: {event.actorEmail}</>}
              </span>
            </div>
          </li>
        ))}</ul>
      )}
      <Pager copy={cashFlowCopy[locale]} title={copy.logs} page={query.page} hasMore={list.hasMore} href={(page) => logsHref(locale, { ...query, page })} />
    </section>
  </div>;
}
