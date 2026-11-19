"use client";

import { useState } from "react";
import type { Locale } from "@/server/locale";
import { authCopy, postAuth } from "./auth-copy";
import "./auth.css";

/** Toolbar control for the dashboard: ends the session, then does a full navigation to the login page. */
export function LogoutButton({ locale }: { locale: Locale }) {
  const copy = authCopy[locale];
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    if ((await postAuth("/api/auth/logout")) === 204) {
      window.location.replace(`/${locale}/login`);
      return;
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <>
      <button type="button" className="language-link signout-button" onClick={signOut} disabled={pending}>
        {pending ? copy.signingOut : copy.signOut}
      </button>
      <span className="signout-error" role="alert">{failed ? copy.errors.unavailable : ""}</span>
    </>
  );
}
