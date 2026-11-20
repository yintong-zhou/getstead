import assert from "node:assert/strict";
import test from "node:test";
import { dashboardCopy } from "./dashboard-copy.ts";

// WCAG 2.5.3 Label in Name: the visible short label must appear in the accessible name (the full label).
test("every short navigation label is contained in its accessible name", () => {
  for (const locale of ["en", "it"] as const) {
    const { nav, shortNav } = dashboardCopy[locale];
    for (const key of Object.keys(nav) as (keyof typeof nav)[]) {
      const short = shortNav[key].replace(/\.$/, "").toLowerCase();
      assert.ok(nav[key].toLowerCase().includes(short), `${locale}.${key}: "${shortNav[key]}" not in "${nav[key]}"`);
    }
  }
});
