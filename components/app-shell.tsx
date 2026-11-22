import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/server/locale";
import type { Profile } from "@/server/profile/service";
import { ProfileMenu } from "./profile/profile-menu";
import { adminCopy } from "./admin/copy";
import { dashboardCopy } from "./dashboard-copy";
import { BrandMark } from "./brand-mark";
import { Icon } from "./icon";
import { PageEnter } from "./page-enter";
import "./cash-flow/cash-flow.css";

export type Section = "overview" | "cash-flow" | "budget" | "recurring" | "accounts" | "net-worth" | "investments" | "property" | "profile" | "admin" | "admin-logs";

const sections = [
  { id: "overview", path: "/overview", icon: "overview", label: "overview" },
  { id: "cash-flow", path: "/cash-flow", icon: "cashFlow", label: "cashFlow" },
  { id: "budget", path: "/budget", icon: "budget", label: "budget" },
  { id: "net-worth", path: "/net-worth", icon: "netWorth", label: "netWorth" },
  { id: "investments", path: "/investments", icon: "investments", label: "investments" },
  { id: "property", path: "/property", icon: "home", label: "property" },
  { id: "recurring", path: "/recurring", icon: "recurring", label: "recurring" },
  { id: "accounts", path: "/accounts", icon: "accounts", label: "accounts" },
] as const;

/** The four mobile tabs. A tab stays active on every page of its group; the group's pages are the subtabs shown under the heading. */
const mobileTabs = [
  { id: "overview", path: "/overview", icon: "overview", label: "overview", group: ["overview"] },
  { id: "cash-flow", path: "/cash-flow", icon: "cashFlow", label: "cashFlow", group: ["cash-flow", "budget", "recurring", "accounts"] },
  { id: "net-worth", path: "/net-worth", icon: "netWorth", label: "netWorth", group: ["net-worth", "investments"] },
  { id: "property", path: "/property", icon: "home", label: "property", group: ["property"] },
] as const;

const subTabs = {
  "cash-flow": [
    { id: "cash-flow", path: "/cash-flow", label: "movements" },
    { id: "budget", path: "/budget", label: "budget" },
    { id: "recurring", path: "/recurring", label: "recurring" },
    { id: "accounts", path: "/accounts", label: "accounts" },
  ],
  "net-worth": [
    { id: "net-worth", path: "/net-worth", label: "summary" },
    { id: "investments", path: "/investments", label: "investments" },
  ],
} as const;

type Props = {
  profile: Profile;
  locale: Locale;
  current: Section;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Query string (with "?") kept when switching language. */
  query?: string;
  routePath?: string;
  children: ReactNode;
};

/** Admin accounts see only these two entries; the finance sections above are for user accounts. */
const adminSections = [
  { id: "admin", path: "/admin", icon: "users", label: "users" },
  { id: "admin-logs", path: "/admin/logs", icon: "logs", label: "logs" },
] as const;

/** Navigation and profile menu shared by every signed-in page. */
export function AppShell({ locale, current, title, subtitle, action, query = "", routePath, children, profile }: Props) {
  const copy = dashboardCopy[locale];
  const admin = profile.admin;
  const adminLabels = adminCopy[locale];
  // One shape for both roles: { id, path, icon, label, short, mobile }.
  const desktopItems = admin
    ? adminSections.map(({ label, ...item }) => ({ ...item, label: adminLabels[label], short: adminLabels[label], mobile: adminLabels[label] }))
    : sections.map(({ label, ...item }) => ({ ...item, label: copy.nav[label], short: copy.shortNav[label], mobile: "" }));
  const mobileItems = admin
    ? desktopItems
    : mobileTabs.map(({ label, ...item }) => ({ ...item, label: copy.nav[label], short: "", mobile: copy.mobileNav[label] }));
  const currentPath = routePath ?? (current === "profile" ? "/profile" : sections.find((section) => section.id === current)?.path ?? "");
  // "page" only on the exact route; "true" marks the section a deeper route (such as the movements history) belongs to.
  const marker = (id: Section, path: string) => (id !== current ? undefined : (routePath ?? path) === path ? "page" : "true");
  const tab = admin ? undefined : mobileTabs.find((item) => (item.group as readonly Section[]).includes(current));
  const subs = tab && tab.id in subTabs ? subTabs[tab.id as keyof typeof subTabs] : undefined;
  const profileMenu = <ProfileMenu locale={locale} profile={profile} currentPath={currentPath} query={query} />;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">{copy.skip}</a>
      <aside className="sidebar">
        <div className="wordmark"><BrandMark /><span>getstead</span></div>
        <nav className={`navigation desktop-navigation${admin ? " admin-navigation" : ""}`} aria-label={copy.navigation}>
          {desktopItems.map(({ id, path, icon, label, short }) => (
            <Link
              key={id}
              className="nav-item"
              href={`/${locale}${path}`}
              title={label}
              aria-label={label}
              aria-current={marker(id, path)}
            >
              <Icon name={icon} />
              <span className="nav-label-short" aria-hidden="true">{short}</span>
              <span className="nav-label-full" aria-hidden="true">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-profile">{profileMenu}</div>
      </aside>

      <main id="main" className="main-content" tabIndex={-1}>
        <div className="page">
          <header className="page-head">
            <div className="utility-bar">
              <div className="wordmark mobile-wordmark"><BrandMark /><span>getstead</span></div>
              {profileMenu}
            </div>
            <div className="page-title-row">
              <div>
                <h1>{title}</h1>
                {subtitle && <p className="month-label">{subtitle}</p>}
              </div>
              {action}
            </div>
            {subs && tab && (
              <nav className="section-nav" aria-label={copy.subNav[tab.label as "cashFlow" | "netWorth"]}>
                {subs.map(({ id, path, label }) => (
                  <Link key={id} className="section-link" href={`/${locale}${path}`} aria-current={marker(id, path)}>{copy.subNav[label]}</Link>
                ))}
              </nav>
            )}
          </header>
          <PageEnter>{children}</PageEnter>
        </div>
      </main>

      <nav className={`navigation mobile-navigation${admin ? " admin-navigation" : ""}`} aria-label={copy.navigation}
        style={admin ? { gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` } : undefined}>
        {mobileItems.map(({ id, path, icon, label, mobile }) => (
          <Link
            key={id}
            className="nav-item"
            href={`/${locale}${path}`}
            aria-label={label}
            aria-current={marker(id, path) ?? (id === tab?.id ? "true" : undefined)}
          >
            <Icon name={icon} />
            <span className="nav-label-mobile" aria-hidden="true">{mobile}</span>
          </Link>
        ))}
      </nav>
      <div id="toast-region" className="toast-region" />
    </div>
  );
}
