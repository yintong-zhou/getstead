import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/server/locale";
import { LogoutButton } from "./auth/logout-button";
import { dashboardCopy } from "./dashboard-copy";
import { Icon } from "./icon";
import "./cash-flow/cash-flow.css";

export type Section = "overview" | "cash-flow" | "budget" | "recurring" | "accounts";

const sections = [
  { id: "overview", path: "", icon: "overview", label: "overview" },
  { id: "cash-flow", path: "/cash-flow", icon: "cashFlow", label: "cashFlow" },
  { id: "budget", path: "/budget", icon: "budget", label: "budget" },
  { id: "recurring", path: "/recurring", icon: "recurring", label: "recurring" },
  { id: "accounts", path: "/accounts", icon: "accounts", label: "accounts" },
] as const;

type Props = {
  locale: Locale;
  current: Section;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Query string (with "?") kept when switching language. */
  query?: string;
  children: ReactNode;
};

/** Navigation, language switch and sign-out shared by every signed-in page. */
export function AppShell({ locale, current, title, subtitle, action, query = "", children }: Props) {
  const copy = dashboardCopy[locale];
  const alternativeLocale = locale === "en" ? "it" : "en";
  const languageName = alternativeLocale === "it" ? "Italiano" : "English";
  const currentPath = sections.find((section) => section.id === current)!.path;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">{copy.skip}</a>
      <aside className="sidebar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true">S</span><span>Stead</span></div>
        <nav className="navigation" aria-label={copy.navigation}>
          {sections.map(({ id, path, icon, label }) => (
            <Link
              key={id}
              className="nav-item"
              href={`/${locale}${path}`}
              title={copy[label]}
              aria-current={id === current ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{copy[label]}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main id="main" className="main-content" tabIndex={-1}>
        <div className="page">
          <header className="page-head">
            <div className="utility-bar">
              <div className="wordmark mobile-wordmark"><span className="brand-mark" aria-hidden="true">S</span><span>Stead</span></div>
              <Link
                className="language-link utility-language"
                href={`/${alternativeLocale}${currentPath}${query}`}
                lang={alternativeLocale}
                hrefLang={alternativeLocale}
                aria-label={`${copy.language}: ${languageName}`}
              >
                {alternativeLocale.toUpperCase()}
              </Link>
              <LogoutButton locale={locale} />
            </div>
            <div className="page-title-row">
              <div>
                <h1>{title}</h1>
                {subtitle && <p className="month-label">{subtitle}</p>}
              </div>
              {action}
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
