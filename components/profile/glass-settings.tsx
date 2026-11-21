"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/server/locale";
import { glassStorageKey, previewGlass, readGlassLevel } from "./appearance";
import { profileCopy } from "./copy";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function GlassSettings({ locale }: { locale: Locale }) {
  const copy = profileCopy[locale];
  const stored = useSyncExternalStore(subscribe, readGlassLevel, () => 100);
  const [draft, setDraft] = useState<number | null>(null);
  const [notice, setNotice] = useState<"saved" | "error" | null>(null);
  const level = draft ?? stored;
  const changed = level !== stored;

  useEffect(() => {
    previewGlass(level);
    return () => previewGlass(readGlassLevel());
  }, [level]);

  return <section className="card profile-card glass-settings" aria-labelledby="profile-appearance-title">
    <h2 id="profile-appearance-title">{copy.appearance}</h2>
    <form onSubmit={(event) => {
      event.preventDefault();
      try {
        localStorage.setItem(glassStorageKey, String(level));
        setDraft(null);
        setNotice("saved");
      } catch {
        setNotice("error");
      }
    }}>
      <div className="form-field">
        <label htmlFor="glass-transparency">{copy.transparency}</label>
        <div className="glass-settings-range">
          <input id="glass-transparency" type="range" min={0} max={100} value={level}
            aria-valuetext={`${level}%`} aria-describedby="glass-transparency-hint"
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              previewGlass(next);
              setDraft(next);
              setNotice(null);
            }} />
          <span aria-hidden="true">{level}%</span>
        </div>
        <p className="profile-hint" id="glass-transparency-hint">{copy.transparencyHint}</p>
      </div>
      <div className="glass-sample">
        <div className="glass-sample-card">
          <span>{copy.appearancePreview}</span>
          <span className="glass-sample-button">{copy.save}</span>
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-solid" type="submit" disabled={!changed}>{copy.save}</button>
        <button className="button button-quiet" type="button" disabled={!changed} onClick={() => {
          previewGlass(stored);
          setDraft(null);
          setNotice(null);
        }}>{copy.cancel}</button>
      </div>
      <p className={`notice${notice === "error" ? " notice-error" : notice ? " notice-ok" : ""}`}
        role={notice === "error" ? "alert" : "status"}>
        {notice === "saved" ? copy.saved : notice === "error" ? copy.browserSaveFailed : ""}
      </p>
    </form>
  </section>;
}
