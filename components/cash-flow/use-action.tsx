"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/server/locale";
import { errorText, type ApiResult } from "./api";
import { cashFlowCopy } from "./copy";

/** `warn` means the request succeeded but did not leave the screen the way the person intended. */
export type Notice = { kind: "ok" | "warn" | "error"; text: string } | null;

/**
 * Runs an API call, shows its outcome, and refreshes the server-rendered data on success.
 * `success` is a message, or a function that inspects the result and picks the message (and kind).
 * A 401 means the session ended, so it sends the person to sign in instead of showing an error.
 */
export function useAction(locale: Locale, failureText?: (result: Extract<ApiResult<unknown>, { ok: false }>) => string) {
  const router = useRouter();
  const copy = cashFlowCopy[locale];
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function run<T>(request: () => Promise<ApiResult<T>>, success?: string | ((data: T) => NonNullable<Notice>)) {
    if (pending) return null;
    setPending(true);
    setNotice(null);
    const result = await request();
    setPending(false);
    if (!result.ok) {
      if (result.status === 401) {
        window.location.replace(`/${locale}/login`);
        return null;
      }
      setNotice({ kind: "error", text: failureText ? failureText(result) : errorText(copy, result) });
      return null;
    }
    if (typeof success === "function") setNotice(success(result.data));
    else if (success) setNotice({ kind: "ok", text: success });
    router.refresh();
    return result;
  }

  return { pending, notice, run, setNotice };
}

/** One live region per form so assistive technology announces outcomes. */
export function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p className={`notice${notice ? ` notice-${notice.kind}` : ""}`} role={notice && notice.kind !== "ok" ? "alert" : "status"}>
      {notice?.text ?? ""}
    </p>
  );
}
