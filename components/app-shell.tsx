import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/server/locale";
import type { Profile } from "@/server/profile/service";
import { ProfileMenu } from "./profile/profile-menu";
import { dashboardCopy } from "./dashboard-copy";
import { BrandMark } from "./brand-mark";
import { Icon } from "./icon";
import "./cash-flow/cash-flow.css";

export type Section = "overview" | "cash-flow" | "budget" | "recurring" | "accounts" | "net-worth" | "investments" | "profile";

const sections = [
  { id: "overview", path: "", icon: "overview", label: "overview" },
  { id: "cash-flow", path: "/cash-flow", icon: "cashFlow", label: "cashFlow" },
  { id: "budget", path: "/budget", icon: "budget", label: "budget" },
  { id: "net-worth", path: "/net-worth", icon: "netWorth", label: "netWorth" },
  { id: "investments", path: "/investments", icon: "investments", label: "investments" },
  { id: "recurring", path: "/recurring", icon: "recurring", label: "recurring" },
  { id: "accounts", path: "/accounts", icon: "accounts", label: "accounts" },
] as const;

type Props = {
  profile: Profile;
  locale: Locale;
  current: Section;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Query string (with "?") kept when switching language. */
  query?: string;
  children: ReactNode;
};

/** Navigation and profile menu shared by every signed-in page. */
export function AppShell({ locale, current, title, subtitle, action, query = "", children, profile }: Props) {
  const copy = dashboardCopy[locale];
  const currentPath = current === "profile" ? "/profile" : sections.find((section) => section.id === current)!.path;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">{copy.skip}</a>
      <aside className="sidebar">
        <div className="wordmark"><BrandMark /><span>getstead</span></div>
        <nav className="navigation" aria-label={copy.navigation}>
          {sections.map(({ id, path, icon, label }) => (
            <Link
              key={id}
              className="nav-item"
              href={`/${locale}${path}`}
              title={copy.nav[label]}
              aria-label={copy.nav[label]}
              aria-current={id === current ? "page" : undefined}
            >
              <Icon name={icon} />
              <span className="nav-label-short" aria-hidden="true">{copy.shortNav[label]}</span>
              <span className="nav-label-full" aria-hidden="true">{copy.nav[label]}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main id="main" className="main-content" tabIndex={-1}>
        <div className="page">
          <header className="page-head">
            <div className="utility-bar">
              <div className="wordmark mobile-wordmark"><BrandMark /><span>getstead</span></div>
              <ProfileMenu locale={locale} profile={profile} currentPath={currentPath} query={query} />
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
