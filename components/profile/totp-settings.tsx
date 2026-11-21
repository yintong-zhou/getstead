"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import type { Locale } from "@/server/locale";
import { SetupKey } from "../auth/setup-key";
import { call } from "../cash-flow/api";
import { NoticeLine, useAction } from "../cash-flow/use-action";
import { profileCopy } from "./copy";

type Setup = { secret: string; enrollmentToken: string; qrCode: string };

export function TotpSettings({ locale, initialEnabled }: { locale: Locale; initialEnabled: boolean }) {
  const copy = profileCopy[locale];
  const [enabled, setEnabled] = useState(initialEnabled);
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState<Setup>();
  const request = useAction(locale, (result) => copy.errors[result.error] ?? copy.errors.generic);

  function close() {
    setEditing(false);
    setSetup(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    form.reset();
    const currentPassword = data.get("currentPassword");
    const code = data.get("code");
    if (!enabled && !setup) {
      const result = await request.run(() => call<Setup>("POST", "/totp", { action: "begin", currentPassword }, "/api/profile"));
      if (result) setSetup(result.data);
      return;
    }
    const payload = enabled ? { action: "disable", currentPassword, code }
      : { action: "enable", enrollmentToken: setup?.enrollmentToken, code };
    const result = await request.run(() => call<{ totpEnabled: boolean }>("POST", "/totp", payload, "/api/profile"), copy.saved);
    if (result) {
      setEnabled(result.data.totpEnabled);
      close();
    }
  }

  return <section className="card profile-card" aria-labelledby="profile-totp-title">
    <h2 id="profile-totp-title">{copy.totp.title}</h2>
    <p className="profile-hint">{enabled ? copy.totp.on : copy.totp.off}</p>
    {editing ? <form method="post" onSubmit={submit}>
      {setup ? <>
        <p className="profile-hint">{copy.totp.setup}</p>
        <Image className="profile-totp-qr" src={setup.qrCode} alt={copy.totp.qrAlt} width={224} height={224} unoptimized />
        <SetupKey secret={setup.secret} locale={locale} />
      </> : <div className="form-field">
        <label htmlFor="totp-password">{copy.currentPassword}</label>
        <input className="field" id="totp-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>}
      {(enabled || setup) && <div className="form-field">
        <label htmlFor="totp-code">{copy.totp.code}</label>
        <input className="field" id="totp-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </div>}
      <div className="profile-languages">
        <button className="button" disabled={request.pending}>{request.pending ? copy.saving : enabled ? copy.totp.disable : setup ? copy.totp.enable : copy.totp.continue}</button>
        <button type="button" className="button button-quiet" disabled={request.pending} onClick={() => { close(); request.setNotice(null); }}>{copy.cancel}</button>
      </div>
    </form> : <button type="button" className="button" onClick={() => { request.setNotice(null); setEditing(true); }}>
      {enabled ? copy.totp.disable : copy.totp.enable}
    </button>}
    <NoticeLine notice={request.notice} />
  </section>;
}
