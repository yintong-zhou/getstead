"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminUserDto } from "@/server/admin/users";
import { localeTags, type Locale } from "@/server/locale";
import { call } from "../cash-flow/api";
import { cashFlowCopy } from "../cash-flow/copy";
import { Pager } from "../cash-flow/movements-view";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { Select } from "../select";
import { usersHref, type UsersQuery } from "./admin-query";
import { adminCopy, type AdminCopy } from "./copy";
import "./admin.css";

type Overview = { total: number; active: number; disabled: number; withTotp: number; admins: number; errors24h: number; security24h: number };
type Props = {
  locale: Locale;
  selfId: string;
  overview: Overview;
  query: UsersQuery;
  list: { page: number; hasMore: boolean; users: AdminUserDto[] };
};

export function AdminNav({ locale, current }: { locale: Locale; current: "users" | "logs" }) {
  const copy = adminCopy[locale];
  return <nav className="section-nav admin-nav" aria-label={copy.sections}>
    <Link className="section-link" href={`/${locale}/admin`} aria-current={current === "users" ? "page" : undefined}>{copy.users}</Link>
    <Link className="section-link" href={`/${locale}/admin/logs`} aria-current={current === "logs" ? "page" : undefined}>{copy.logs}</Link>
  </nav>;
}

function TemporaryPassword({ copy, email, password, onDone }: { copy: AdminCopy; email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div className="admin-secret" role="status">
    <strong>{copy.tempTitle} — {email}</strong>
    <code>{password}</code>
    <p className="profile-hint">{copy.tempHint}</p>
    <div className="row-actions">
      <button type="button" className="button" onClick={async () => {
        try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? copy.copied : copy.copy}</button>
      <button type="button" className="button button-quiet" onClick={onDone}>{copy.dismiss}</button>
    </div>
  </div>;
}

export function AdminView({ locale, selfId, overview, query, list }: Props) {
  const copy = adminCopy[locale];
  const failureText = (result: { error: string }) => copy.errors[result.error] ?? copy.errors.generic;
  const createAction = useAction(locale, failureText);
  const rowAction = useAction(locale, failureText);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const date = new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });
  const when = (value: string | null) => (value ? date.format(new Date(value)) : copy.never);
  const filtered = Boolean(query.q) || query.status !== "all";

  const tiles: [string, number][] = [
    [copy.total, overview.total], [copy.active, overview.active], [copy.disabled, overview.disabled],
    [copy.withTotp, overview.withTotp], [copy.admins, overview.admins],
    [copy.errors24h, overview.errors24h], [copy.security24h, overview.security24h],
  ];

  async function reset(user: AdminUserDto) {
    if (!window.confirm(copy.confirmReset)) return;
    const result = await rowAction.run(() => call<{ temporaryPassword: string }>("POST", `/users/${user.id}/reset-password`, undefined, "/api/admin"), copy.passwordReset);
    if (result) setSecret({ email: user.email, password: result.data.temporaryPassword });
  }

  async function toggle(user: AdminUserDto) {
    const disable = !user.disabledAt;
    if (disable && !window.confirm(copy.confirmDisable)) return;
    await rowAction.run(() => call("POST", `/users/${user.id}/${disable ? "disable" : "enable"}`, undefined, "/api/admin"),
      disable ? copy.userDisabled : copy.userEnabled);
  }

  return <div className="stack">
    <section className="card" aria-labelledby="admin-overview-title">
      <h2 id="admin-overview-title">{copy.overview}</h2>
      <dl className="stats admin-stats">
        {tiles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="profile-hint">{copy.activeHint}</p>
    </section>

    <section className="card" aria-labelledby="admin-create-title">
      <h2 id="admin-create-title">{copy.createTitle}</h2>
      <form className="filters" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const email = String(data.get("email") ?? "");
        const result = await createAction.run(
          () => call<{ temporaryPassword: string }>("POST", "/users", { email, displayName: data.get("displayName") }, "/api/admin"),
          copy.userCreated,
        );
        if (result) { form.reset(); setSecret({ email, password: result.data.temporaryPassword }); }
      }}>
        <div className="form-field">
          <label htmlFor="admin-create-email">{copy.email}</label>
          <input className="field" id="admin-create-email" name="email" type="email" required maxLength={254} autoComplete="off" />
        </div>
        <div className="form-field">
          <label htmlFor="admin-create-name">{copy.displayName}</label>
          <input className="field" id="admin-create-name" name="displayName" maxLength={60} autoComplete="off" />
        </div>
        <div className="form-field admin-submit">
          <button className="button button-solid" disabled={createAction.pending}>{createAction.pending ? copy.creating : copy.create}</button>
        </div>
      </form>
      <NoticeLine notice={createAction.notice} />
    </section>

    {secret && <TemporaryPassword copy={copy} {...secret} onDone={() => setSecret(null)} />}

    <section className="card" aria-labelledby="admin-users-title">
      <h2 id="admin-users-title">{copy.users}</h2>
      {/* A plain GET form: the URL holds the filters, and submitting resets the page. */}
      <form className="filters" method="get" action={`/${locale}/admin`}>
        <div className="form-field">
          <label htmlFor="admin-search">{copy.search}</label>
          <input className="field" id="admin-search" name="q" type="search" defaultValue={query.q} maxLength={254} />
        </div>
        <div className="form-field">
          <label htmlFor="admin-status">{copy.status}</label>
          <Select id="admin-status" name="status" defaultValue={query.status} options={[
            { value: "all", label: copy.statusAll }, { value: "active", label: copy.statusActive }, { value: "disabled", label: copy.statusDisabled },
          ]} />
        </div>
        <div className="form-field admin-submit"><button className="button">{copy.apply}</button></div>
      </form>
      {filtered && <Link className="text-link" href={usersHref(locale, {})}>{copy.resetFilters}</Link>}
      <NoticeLine notice={rowAction.notice} />

      {list.users.length === 0 ? (
        <div className="empty-inline">
          <p>{query.page > 1 ? copy.emptyPage : copy.noUsers}</p>
          {query.page > 1 && <Link className="text-link" href={usersHref(locale, { ...query, page: 1 })}>{copy.backToFirstPage}</Link>}
        </div>
      ) : (
        <ul className="rows">{list.users.map((user) => (
          <li key={user.id} className={`manage-row${user.disabledAt ? " is-archived" : ""}`}>
            <div className="row-text">
              <p>
                {user.displayName ?? user.email}
                {user.admin && <span className="badge badge-blue">{copy.badgeAdmin}</span>}
                {user.totpEnabled && <span className="badge badge-green">{copy.badgeTotp}</span>}
                {user.mustChangePassword && <span className="badge badge-amber">{copy.badgeMustChange}</span>}
                {user.disabledAt && <span className="badge">{copy.badgeDisabled}</span>}
              </p>
              <span>{user.displayName ? `${user.email} · ` : ""}{copy.created}: {when(user.createdAt)} · {copy.lastLogin}: {when(user.lastLoginAt)}</span>
            </div>
            {user.id !== selfId && <div className="row-actions">
              <button type="button" className="button button-quiet" disabled={rowAction.pending} onClick={() => reset(user)}>{copy.resetPassword}</button>
              <button type="button" className="button button-quiet" disabled={rowAction.pending} onClick={() => toggle(user)}>
                {user.disabledAt ? copy.enable : copy.disable}
              </button>
            </div>}
          </li>
        ))}</ul>
      )}
      <Pager copy={cashFlowCopy[locale]} title={copy.users} page={query.page} hasMore={list.hasMore} href={(page) => usersHref(locale, { ...query, page })} />
    </section>
  </div>;
}
