"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/server/locale";
import type { Profile } from "@/server/profile/service";
import { useLogout } from "../auth/use-logout";
import { Icon } from "../icon";
import { profileCopy } from "./copy";
import "./profile.css";

export function ProfileMenu({ locale, profile, currentPath, query }: {
  locale: Locale; profile: Profile; currentPath: string; query: string;
}) {
  const copy = profileCopy[locale];
  const displayName = profile.displayName ?? profile.email.split("@")[0];
  const alternative = locale === "en" ? "it" : "en";
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const logout = useLogout(locale);

  function items() { return Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []); }
  function show(index: number) {
    initialFocus.current = index;
    setActive(index);
    setOpen(true);
  }
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    items()[initialFocus.current]?.focus();
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === "Tab") {
      // The trigger is the single tab stop; let the browser continue from there.
      trigger.current?.focus();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const controls = items();
    const index = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1
      : (active + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
    setActive(index);
    controls[index]?.focus();
  }

  return <div className="profile-menu" ref={root}>
    <button ref={trigger} type="button" className="profile-trigger" aria-label={`${copy.title} — ${displayName}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show(0)}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); show(event.key === "ArrowUp" || event.key === "End" ? 2 : 0);
        } else if (event.key === "Escape" && open) { event.preventDefault(); close(true); }
      }}>
      <Icon name="user" />
      <span className="profile-trigger-name">{displayName}</span>
    </button>
    {open && <div ref={menu} id={id} className="profile-popup" onKeyDown={keyDown}>
      <div className="profile-menu-header" id={`${id}-who`}>
        <strong>{displayName}</strong>
        <span>{profile.email}</span>
      </div>
      <div role="menu" aria-label={copy.title} aria-describedby={`${id}-who`}>
      <Link role="menuitem" tabIndex={active === 0 ? 0 : -1} href={`/${locale}/profile`}
        onFocus={() => setActive(0)} onClick={() => close()}>{copy.title}</Link>
      <Link role="menuitem" tabIndex={active === 1 ? 0 : -1} href={`/${alternative}${currentPath}${query}`}
        lang={alternative} hrefLang={alternative} onFocus={() => setActive(1)} onClick={() => close()}>
        {alternative === "it" ? "Italiano" : "English"}
      </Link>
      <button role="menuitem" type="button" tabIndex={active === 2 ? 0 : -1} aria-disabled={logout.pending}
        onFocus={() => setActive(2)} onClick={() => { if (!logout.pending) void logout.signOut(); }}>
        {logout.pending ? copy.signingOut : copy.signOut}
      </button>
      </div>
      {logout.failed && <p role="alert" className="profile-menu-error">{copy.signOutFailed}</p>}
    </div>}
  </div>;
}
