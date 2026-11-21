"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** The "⋯" row menu: a native <details> that closes on Escape, an outside pointer, or a chosen item. */
export function MoreActions({ label, title, triggerRef, children }: {
  label: string;
  title: string;
  triggerRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (menu.current && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  return (
    <details
      ref={menu} className="more-actions" onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary ref={triggerRef} aria-label={label} title={title}><span aria-hidden="true">⋯</span></summary>
      <div
        className="more-actions-list"
        onClick={(event) => {
          if (menu.current && event.target instanceof Element && event.target.closest("button, a")) menu.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
