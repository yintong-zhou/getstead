import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/server/demo-dashboard";
import { authCopy } from "./auth-copy";
import "./auth.css";

/** Page frame shared by login, MFA and unavailable states. `path` is the locale-less route, so the language link keeps the current phase. */
export function AuthShell({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  const copy = authCopy[locale];
  const alternative = locale === "en" ? "it" : "en";
  const languageName = alternative === "it" ? "Italiano" : "English";

  return (
    <main className="auth-page">
      <div className="auth-bar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true">S</span><span>Stead</span></div>
        <Link className="language-link" href={`/${alternative}${path}`} lang={alternative} hrefLang={alternative} aria-label={`${copy.language}: ${languageName}`}>
          {alternative.toUpperCase()}
        </Link>
      </div>
      <div className="auth-card">{children}</div>
    </main>
  );
}

/** Shown instead of any protected content when the session store cannot be reached. */
export function UnavailableNotice({ locale, path }: { locale: Locale; path: string }) {
  const copy = authCopy[locale];

  return (
    <AuthShell locale={locale} path={path}>
      <h1>{copy.unavailableTitle}</h1>
      <p className="auth-intro">{copy.unavailableBody}</p>
      {/* Plain anchor on purpose: a full reload re-checks the session. */}
      <a className="auth-button" href={`/${locale}${path}`}>{copy.retry}</a>
    </AuthShell>
  );
}
