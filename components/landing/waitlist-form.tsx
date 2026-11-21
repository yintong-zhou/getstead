"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/server/locale";
import { landingCopy } from "./copy";

type ErrorKey = keyof (typeof landingCopy)["en"]["waitlist"]["errors"];

/** Waitlist sign-up. The "sent" line only shows after the server accepted the email. */
export function WaitlistForm({ locale }: { locale: Locale }) {
  const copy = landingCopy[locale].waitlist;
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("invalid");
    if (data.get("consent") !== "on") return setError("consent");

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent: true, locale, website: String(data.get("website") ?? "") }),
      });
      if (response.ok) setDone(true);
      else setError(response.status === 400 ? "invalid" : response.status === 429 ? "limit" : "failed");
    } catch {
      setError("failed");
    }
    setPending(false);
  }

  if (done) return <p className="waitlist-done" role="status">{copy.done}</p>;

  return (
    // method="post" keeps the email out of the URL if the form ever submits before hydration.
    <form className="waitlist-form" method="post" onSubmit={submit} noValidate>
      <div className="waitlist-field">
        <label htmlFor="waitlist-email">{copy.label}</label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          aria-invalid={error === "invalid" || undefined}
          aria-describedby={error === "invalid" ? "waitlist-error" : undefined}
        />
        {error === "invalid" && <p id="waitlist-error" className="waitlist-error" role="alert">{copy.errors.invalid}</p>}
      </div>
      {/* Honeypot: people never see it, so a filled value marks a bot. */}
      <div className="waitlist-trap" aria-hidden="true">
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="waitlist-consent">
        <input id="waitlist-consent" name="consent" type="checkbox" aria-describedby={error === "consent" ? "consent-error" : undefined} />
        <label htmlFor="waitlist-consent">
          {copy.consent} <a href={`/${locale}/privacy`}>{copy.privacy}</a>.
        </label>
      </div>
      {error === "consent" && <p id="consent-error" className="waitlist-error" role="alert">{copy.errors.consent}</p>}
      {(error === "limit" || error === "failed") && <p className="waitlist-error" role="alert">{copy.errors[error]}</p>}
      <p className="waitlist-status" role="status">{pending ? copy.sending : ""}</p>
      <button className="landing-button" type="submit" disabled={pending}>{copy.submit}</button>
    </form>
  );
}
