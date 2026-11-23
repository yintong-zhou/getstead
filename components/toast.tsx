"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";
import type { Notice } from "./cash-flow/use-action";

/**
 * Shows an action's outcome as a toast in the shell's `#toast-region`, which stacks several at once.
 * Successes and warnings dismiss themselves; errors stay until closed or until the next action starts.
 */
export function Toast({ notice }: { notice: Notice }) {
  const [hidden, setHidden] = useState<Notice>(null);
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = setTimeout(() => setHidden(notice), notice.kind === "warn" ? 8000 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice || hidden === notice) return null;
  return createPortal(
    <div className={`toast toast-${notice.kind}`} role={notice.kind === "ok" ? "status" : "alert"}>
      <span className="toast-mark" aria-hidden="true">{notice.kind === "ok" ? <Icon name="check" size={16} /> : "!"}</span>
      <span className="toast-text">{notice.text}</span>
      <button className="toast-close" type="button" aria-label={document.documentElement.lang === "it" ? "Chiudi" : "Close"} onClick={() => setHidden(notice)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
    </div>,
    document.getElementById("toast-region") ?? document.body,
  );
}
