"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { call } from "./cash-flow/api";

/**
 * Silently refreshes market closes and benchmarks once per mount, then re-renders the page if anything changed.
 * Remount it (with a new key) to refresh again.
 */
export function MarketRefresh() {
  const router = useRouter();
  useEffect(() => {
    void call<{ changed: boolean; benchmarksChanged: boolean }>("POST", "/quotes/refresh", undefined, "/api/investments").then((result) => {
      if (result.ok && (result.data.changed || result.data.benchmarksChanged)) router.refresh();
    });
  }, [router]);
  return null;
}
