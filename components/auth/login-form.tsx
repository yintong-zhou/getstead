"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/server/locale";
import { PasswordInput } from "../password-input";
import { useTurnstile } from "../use-turnstile";
import { authCopy, errorKeyForStatus, postAuth, type AuthErrorKey } from "./auth-copy";

export function LoginForm({ locale }: { locale: Locale }) {
  const copy = authCopy[locale];
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const turnstile = useTurnstile("login");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);

    const status = await postAuth("/api/auth/login", {
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
      turnstile: String(data.get("cf-turnstile-response") ?? ""),
    });

    if (status === 204 || status === 202) {
      // Full navigation so the server re-reads the new session cookie.
      window.location.replace(status === 202 ? `/${locale}/login/mfa` : `/${locale}/overview`);
      return;
    }
    form.reset();
    turnstile.reset(); // a token works once
    setError(errorKeyForStatus(status, "login"));
    setPending(false);
  }

  return (
    // method="post" keeps credentials out of the URL if the form ever submits before hydration.
    <form className="auth-form" method="post" onSubmit={submit} aria-describedby={error ? "login-error" : undefined}>
      <div>
        <h1>{copy.signInTitle}</h1>
        <p className="auth-intro">{copy.signInIntro}</p>
      </div>
      <div className="auth-field">
        <label htmlFor="email">{copy.email}</label>
        <input
          id="email" name="email" type="email" className="auth-input" required autoFocus
          autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
          aria-invalid={error === "invalidLogin" || error === "badLogin"}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="password">{copy.password}</label>
        <PasswordInput
          locale={locale} id="password" name="password" className="auth-input" required
          autoComplete="current-password"
          aria-invalid={error === "invalidLogin" || error === "badLogin"}
        />
      </div>
      {turnstile.widget}
      <div id="login-error" role="alert">
        {error && <p className="auth-error">{copy.errors[error]}</p>}
      </div>
      <button className="auth-button" type="submit" disabled={pending}>
        {pending ? copy.signingIn : copy.signIn}
      </button>
    </form>
  );
}
