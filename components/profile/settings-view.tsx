import Link from "next/link";
import type { Locale } from "@/server/locale";
import { BackupSettings } from "./backup-settings";
import { CashReportingSettings } from "./cash-reporting-settings";
import { profileCopy } from "./copy";
import { GlassSettings } from "./glass-settings";
import { ThemeSettings } from "./theme-settings";

export function SettingsView({ locale, admin, excludeCash }: { locale: Locale; admin: boolean; excludeCash: boolean }) {
  const copy = profileCopy[locale];
  return <div className="profile-grid">
    <ThemeSettings locale={locale} />
    <GlassSettings locale={locale} />
    <section className="card profile-card" aria-labelledby="profile-language-title">
      <h2 id="profile-language-title">{copy.language}</h2>
      <div className="profile-languages">
        <Link className="button button-quiet" href="/en/profile/settings" lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link>
        <Link className="button button-quiet" href="/it/profile/settings" lang="it" hrefLang="it" aria-current={locale === "it" ? "page" : undefined}>Italiano</Link>
      </div>
    </section>
    {!admin && <><CashReportingSettings locale={locale} excludeCash={excludeCash} /><BackupSettings locale={locale} /></>}
  </div>;
}
