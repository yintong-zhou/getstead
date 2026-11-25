"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { euros } from "@/components/euros";
import { Icon } from "./icon";
import type { Locale } from "@/server/locale";
import { cashFlowCopy } from "./cash-flow/copy";

// Which groups are open is a per-browser convenience: kept in memory, and in localStorage when it is available.
const PREFIX = "getstead.accountGroup.";
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
function readOpen(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try { return localStorage.getItem(PREFIX + key) === "1"; } catch { return false; }
}
function writeOpen(key: string, open: boolean) {
  memory.set(key, open);
  try { localStorage.setItem(PREFIX + key, open ? "1" : "0"); } catch { /* memory keeps it for this visit */ }
  for (const listener of listeners) listener();
}

/**
 * The accounts of one institution. Closed, it reads like a single account: optional logo, name and the total.
 * Open, it lists each account with its own balance (the list hides logos, which only take room there).
 */
export function AccountGroup({ groupKey, name, count, totalCents, locale, logo, children }: {
  groupKey: string; name: string; count: number; totalCents: number; locale: Locale; logo?: ReactNode; children: ReactNode;
}) {
  const copy = cashFlowCopy[locale];
  const listId = useId();
  // The server renders it closed; the stored choice applies after hydration.
  const open = useSyncExternalStore(subscribe, () => readOpen(groupKey), () => false);
  return (
    <li className="account-group">
      <div className="manage-row account-group-head">
        {!open && logo}
        <div className="row-text">
          <p>{name}</p>
          <span>{copy.accountsCount(count)}</span>
        </div>
        {!open && <span className={`amount${totalCents < 0 ? " negative" : ""}`}>{euros(totalCents, locale)}</span>}
        <button className="account-group-toggle" type="button" aria-expanded={open} aria-controls={listId}
          aria-label={`${open ? copy.hideAccounts : copy.showAccounts}: ${name}`} onClick={() => writeOpen(groupKey, !open)}>
          <Icon name="chevron" size={20} />
        </button>
      </div>
      <ul id={listId} className="rows account-group-list" hidden={!open}>{children}</ul>
    </li>
  );
}
