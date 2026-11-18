import assert from "node:assert/strict";
import test from "node:test";
import { formatEuros, getDemoDashboard } from "./demo-dashboard.ts";

test("November cash flow and budget reconcile with the demo transactions", () => {
  const dashboard = getDemoDashboard();

  assert.deepEqual(dashboard.cashFlow.at(-1), {
    month: "2026-11",
    incomeCents: 422_000,
    expenseCents: 243_540,
  });
  assert.equal(dashboard.monthlyBalanceCents, 178_460);
  assert.deepEqual(dashboard.budgets.map(({ spentCents }) => spentCents), [23_180, 22_000, 10_720]);
});

test("amount formatting preserves cents and uses the selected locale", () => {
  assert.equal(formatEuros(-6_420, "en"), "−€64.20");
  assert.equal(formatEuros(178_460, "it", { showPlus: true }), "+€ 1.784,60");
  assert.equal(formatEuros(12_458_050, "en", { wholeEuros: true }), "€124,581");
  assert.equal(formatEuros(Number.MAX_SAFE_INTEGER, "en"), "€90,071,992,547,409.91");
  assert.throws(() => formatEuros(1.5, "en"), RangeError);
});
