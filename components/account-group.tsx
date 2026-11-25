"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { euros } from "@/components/euros";
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

/** A collapsed row for the accounts of one institution, with their total; it opens to list each account. */
export function AccountGroup({ groupKey, name, count, totalCents, locale, children }: {
  groupKey: string; name: string; count: number; totalCents: number; locale: Locale; children: ReactNode;
}) {
  const copy = cashFlowCopy[locale];
  const listId = useId();
  // The server renders it closed; the stored choice applies after hydration.
  const open = useSyncExternalStore(subscribe, () => readOpen(groupKey), () => false);
  return (
    <li className="account-group">
      <div className="manage-row account-group-head">
        <div className="row-text">
          <p>{name}</p>
          <span>{copy.accountsCount(count)}</span>
        </div>
        <span className={`amount${totalCents < 0 ? " negative" : ""}`}>{euros(totalCents, locale)}</span>
        <button className="button button-quiet" type="button" aria-expanded={open} aria-controls={listId} onClick={() => writeOpen(groupKey, !open)}>
          {open ? copy.hideAccounts : copy.showAccounts}
        </button>
      </div>
      <ul id={listId} className="rows account-group-list" hidden={!open}>{children}</ul>
    </li>
  );
}
