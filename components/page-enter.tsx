"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { rise } from "@/lib/motion";

/** The page body fades in and rises a few pixels once, on arrival. Only opacity and transform move. */
export function PageEnter({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: rise }} animate={{ opacity: 1, y: 0 }}>
      {children}
    </motion.div>
  );
}
