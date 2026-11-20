"use client";

import { useState } from "react";
import type { Locale } from "@/server/locale";
import { postAuth } from "./auth-copy";

/** Ends the session, then does a full navigation to the login page. Used by the profile menu. */
export function useLogout(locale: Locale) {
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

  return { pending, failed, signOut };
}
