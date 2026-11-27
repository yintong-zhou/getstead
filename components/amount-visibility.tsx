"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import type { Locale } from "@/server/locale";
import { Icon } from "./icon";
import { privateAmount } from "./money";

const HIDE_KEY = "getstead.hideAmounts";
let hiddenInMemory = false;
const listeners = new Set<() => void>();
function readHidden() {
  try { const stored = localStorage.getItem(HIDE_KEY); return stored === null ? hiddenInMemory : stored === "1"; } catch { return hiddenInMemory; }
}
function writeHidden(hidden: boolean) {
  hiddenInMemory = hidden;
  try { localStorage.setItem(HIDE_KEY, hidden ? "1" : "0"); } catch { /* Memory fallback when storage is unavailable. */ }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

export function useAmountsHidden() {
  // Hide until the stored preference is available, preventing a flash of visible amounts.
  return useSyncExternalStore(subscribe, readHidden, () => true);
}

export function AmountVisibilityToggle({ locale }: { locale: Locale }) {
  const hidden = useAmountsHidden();
  const label = locale === "it" ? "Nascondi importi" : "Hide amounts";
  return <button type="button" className="button button-quiet" aria-label={label} title={label} aria-pressed={hidden} onClick={() => writeHidden(!hidden)}>
    <Icon name={hidden ? "eyeOff" : "eye"} size={18} />
  </button>;
}

export function PrivateAmount({ children }: { children: ReactNode }) {
  const hidden = useAmountsHidden();
  return hidden ? privateAmount("", true) : children;
}
