"use client";

import { useParams } from "next/navigation";
import { useId, useRef, type ReactNode } from "react";
import { cashFlowCopy } from "./cash-flow/copy";
import { Icon } from "./icon";

/**
 * A help note behind an info icon: it opens on mouse hover, keyboard focus or tap.
 * The text stays in the DOM, so a field can keep `aria-describedby` pointing at `id`.
 * It renders in the top layer (Popover API), so no card can clip it.
 */
export function InfoTip({ text, id }: { text: ReactNode; id?: string }) {
  const label = cashFlowCopy[useParams<{ locale?: string }>().locale === "it" ? "it" : "en"].info;
  const generated = useId();
  const tipId = id ?? generated;
  const tip = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef("");
  const isOpen = () => tip.current?.matches(":popover-open") ?? false;
  const open = () => {
    const note = tip.current, anchor = button.current;
    if (!note || !anchor || isOpen()) return;
    note.showPopover();
    const box = anchor.getBoundingClientRect();
    note.style.left = `${Math.max(8, Math.min(box.left, innerWidth - note.offsetWidth - 8))}px`;
    const below = box.bottom + 6;
    note.style.top = `${below + note.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - 6 - note.offsetHeight) : below}px`;
  };
  const close = () => { if (isOpen()) tip.current?.hidePopover(); };
  return <>
    <button ref={button} type="button" className="info-tip" aria-label={label} aria-describedby={tipId}
      onPointerEnter={(event) => { pointer.current = event.pointerType; if (event.pointerType === "mouse") open(); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") close(); }}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) open(); }}
      onBlur={close}
      onClick={() => { if (pointer.current !== "mouse") (isOpen() ? close : open)(); }}>
      <Icon name="info" size={16} />
    </button>
    <span ref={tip} id={tipId} popover="auto" role="tooltip" className="info-tip-text">{text}</span>
  </>;
}
