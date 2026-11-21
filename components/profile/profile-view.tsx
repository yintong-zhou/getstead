"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/server/locale";
import type { Profile } from "@/server/profile/service";
import { call } from "../cash-flow/api";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { profileCopy } from "./copy";
import { GlassSettings } from "./glass-settings";
import { TotpSettings } from "./totp-settings";
import "./profile.css";

export function ProfileView({ locale, profile }: { locale: Locale; profile: Profile }) {
  const copy = profileCopy[locale];
  const failureText = (result: { error: string }) => copy.errors[result.error] ?? copy.errors.generic;
  const nameAction = useAction(locale, failureText);
  const emailAction = useAction(locale, failureText);
  const passwordAction = useAction(locale, failureText);
  const [email, setEmail] = useState(profile.email);

  return <div className="profile-grid">
    {profile.mustChangePassword && <p className="notice notice-warn profile-must-change" role="alert">
      {copy.mustChangePassword} <a className="text-link" href="#profile-password-title">{copy.password}</a>
    </p>}
    <GlassSettings locale={locale} />
    <TotpSettings locale={locale} initialEnabled={profile.totpEnabled} />
    <section className="card profile-card" aria-labelledby="profile-name-title">
      <h2 id="profile-name-title">{copy.displayName}</h2>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await nameAction.run(() => call("PATCH", "", { displayName: data.get("displayName") }, "/api/profile"), copy.saved);
      }}>
        <div className="form-field">
          <label htmlFor="profile-name">{copy.displayName}</label>
          <input className="field" id="profile-name" name="displayName" autoComplete="nickname"
            defaultValue={profile.displayName ?? ""} aria-describedby="profile-name-hint" />
          <p className="profile-hint" id="profile-name-hint">{copy.nameHint}</p>
        </div>
        <button className="button" disabled={nameAction.pending}>{nameAction.pending ? copy.saving : copy.save}</button>
        <NoticeLine notice={nameAction.notice} />
      </form>
    </section>
    <section className="card profile-card" aria-labelledby="profile-email-title">
      <h2 id="profile-email-title">{copy.email}</h2>
      <p className="profile-email">{email}</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const payload = { email: data.get("email"), currentPassword: data.get("currentPassword") };
        form.querySelector<HTMLInputElement>('input[type="password"]')!.value = "";
        const result = await emailAction.run(() => call<{ email: string }>("POST", "/email", payload, "/api/profile"), copy.saved);
        if (result) { setEmail(result.data.email); form.reset(); }
      }}>
        <div className="form-field">
          <label htmlFor="profile-email">{copy.newEmail}</label>
          <input className="field" id="profile-email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </div>
        <div className="form-field">
          <label htmlFor="email-current-password">{copy.currentPassword}</label>
          <input className="field" id="email-current-password" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <button className="button" disabled={emailAction.pending}>{emailAction.pending ? copy.saving : copy.save}</button>
        <NoticeLine notice={emailAction.notice} />
      </form>
    </section>
    <section className="card profile-card" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title">{copy.password}</h2>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const payload = { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") };
        const matches = payload.newPassword === data.get("confirmPassword");
        form.reset();
        if (!matches) { passwordAction.setNotice({ kind: "error", text: copy.errors.mismatch }); return; }
        await passwordAction.run(() => call("POST", "/password", payload, "/api/profile"), copy.passwordSaved);
      }}>
        <div className="form-field">
          <label htmlFor="password-current">{copy.currentPassword}</label>
          <input className="field" id="password-current" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="form-field">
          <label htmlFor="password-new">{copy.newPassword}</label>
          <input className="field" id="password-new" name="newPassword" type="password" autoComplete="new-password" required aria-describedby="profile-password-hint" />
          <p className="profile-hint" id="profile-password-hint">{copy.passwordHint}</p>
        </div>
        <div className="form-field">
          <label htmlFor="password-confirm">{copy.confirmPassword}</label>
          <input className="field" id="password-confirm" name="confirmPassword" type="password" autoComplete="new-password" required />
        </div>
        <button className="button" disabled={passwordAction.pending}>{passwordAction.pending ? copy.saving : copy.save}</button>
        <NoticeLine notice={passwordAction.notice} />
      </form>
    </section>
    <section className="card profile-card" aria-labelledby="profile-language-title">
      <h2 id="profile-language-title">{copy.language}</h2>
      <div className="profile-languages">
        <Link className="button button-quiet" href="/en/profile" lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link>
        <Link className="button button-quiet" href="/it/profile" lang="it" hrefLang="it" aria-current={locale === "it" ? "page" : undefined}>Italiano</Link>
      </div>
    </section>
  </div>;
}
