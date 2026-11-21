"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/server/locale";
import { authCopy, errorKeyForStatus, postAuth, type AuthErrorKey } from "./auth-copy";

export function MfaForm({ locale }: { locale: Locale }) {
  const copy = authCopy[locale];
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!/^\d{6}$/.test(code)) {
      setError("invalidCode");
      return;
    }
    setPending(true);
    setError(null);

    const status = await postAuth("/api/auth/mfa", { code });
    if (status === 204) {
      // Full navigation so the dashboard is rendered with the upgraded session.
      window.location.replace(`/${locale}`);
      return;
    }
    setCode("");
    setError(errorKeyForStatus(status, "mfa"));
    setPending(false);
  }

  const invalid = error === "invalidCode" || error === "badCode";

  return (
    <>
      <h1>{copy.mfaTitle}</h1>
      <p className="auth-intro">{copy.mfaIntro}</p>
      <form className="auth-form" method="post" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="code">{copy.code}</label>
          <input
            id="code" name="code" type="text" className="auth-input auth-code" required
            autoFocus
            autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
            enterKeyHint="done" spellCheck={false} value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={invalid} aria-describedby="code-hint"
          />
          <span id="code-hint" className="auth-hint">{copy.codeHint}</span>
        </div>
        <div role="alert">
          {error && (
            <p className="auth-error">
              {copy.errors[error]}
              {error === "expired" && <> <Link href={`/${locale}/login`}>{copy.signInAgain}</Link></>}
            </p>
          )}
        </div>
        <button className="auth-button" type="submit" disabled={pending}>
          {pending ? copy.verifying : copy.verify}
        </button>
        <Link className="auth-link" href={`/${locale}/login`}>{copy.backToSignIn}</Link>
      </form>
    </>
  );
}
