"use client";

import { useLayoutEffect } from "react";
import type { Locale } from "@/server/locale";
import { restoreTheme } from "./appearance";

export function ThemeRestorer({ locale }: { locale: Locale }) {
  useLayoutEffect(() => { restoreTheme(); }, [locale]);
  return null;
}
