"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/server/locale";
import { Select } from "../select";
import { readTheme, saveTheme, subscribeTheme, themes, type Theme } from "./appearance";
import { profileCopy } from "./copy";

/** System / Light / Dark. The choice applies immediately and is saved in this browser. */
export function ThemeSettings({ locale }: { locale: Locale }) {
  const copy = profileCopy[locale];
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  return <section className="card profile-card" aria-labelledby="profile-theme-title">
    <h2 id="profile-theme-title">{copy.theme}</h2>
    <div className="form-field">
      <label htmlFor="theme-select">{copy.theme}</label>
      <Select id="theme-select" value={theme} onChange={(value) => saveTheme(value as Theme)}
        options={themes.map((value) => ({ value, label: copy.themes[value] }))} aria-describedby="theme-hint" />
      <p className="profile-hint" id="theme-hint">{copy.themeHint}</p>
    </div>
  </section>;
}
