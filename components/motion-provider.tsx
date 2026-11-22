"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

/** App-wide Motion defaults. `reducedMotion="user"` turns transforms off when the device asks for less motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: duration.enter, ease }}>{children}</MotionConfig>;
}
