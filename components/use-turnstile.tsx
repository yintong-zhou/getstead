"use client";

import Script from "next/script";
import { useEffect, useRef, type ReactNode } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Minimal shape of the Cloudflare Turnstile global used here.
declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, options: Record<string, unknown>): string; reset(id?: string): void; remove(id?: string): void };
  }
}

/**
 * Cloudflare Turnstile for a form. Render `widget` inside the form: it adds a hidden
 * `cf-turnstile-response` field that FormData picks up. Without a site key nothing is rendered
 * (the server skips the check outside production).
 * - `reset()`: a token works once, so call it after every attempt that did not leave the page.
 * - `remove()`: call it before the widget's node leaves the page while the component stays mounted.
 *   Unmounting does it automatically; otherwise Turnstile logs "Cannot find Widget".
 */
export function useTurnstile(action: string): { widget: ReactNode; reset: () => void; remove: () => void } {
  const node = useRef<HTMLDivElement>(null);
  const id = useRef<string>(undefined);

  function remove() {
    if (id.current) window.turnstile?.remove(id.current);
    id.current = undefined;
  }
  useEffect(() => remove, []);

  // Runs on first load and on every remount, so the widget also appears after a client-side navigation.
  function render() {
    if (node.current && !node.current.hasChildNodes() && window.turnstile) {
      id.current = window.turnstile.render(node.current, { sitekey: SITE_KEY, action });
    }
  }

  const widget = SITE_KEY && (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div ref={node} />
    </>
  );
  return { widget, reset: () => window.turnstile?.reset(id.current), remove };
}
