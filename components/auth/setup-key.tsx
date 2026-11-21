"use client";

import { useState } from "react";
import type { Locale } from "@/server/locale";
import { authCopy } from "./auth-copy";
import "./auth.css";

/** Authenticator setup key: grouped for reading, copied raw. */
export function SetupKey({ secret, locale }: { secret: string; locale: Locale }) {
  const copy = authCopy[locale];
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(secret);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="setup-key">
      <span className="setup-key-label" id="setup-key-label">{copy.setupKey}</span>
      <code aria-labelledby="setup-key-label">{secret.replace(/(.{4})(?=.)/g, "$1 ")}</code>
      <button type="button" className="auth-secondary" onClick={copyKey}>{copy.copy}</button>
      <span className="auth-hint" role="status">
        {status === "copied" ? copy.copied : status === "failed" ? copy.copyFailed : ""}
      </span>
      <p className="setup-key-note">{copy.setupKeyNote}</p>
    </div>
  );
}
