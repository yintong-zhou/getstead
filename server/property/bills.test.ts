import { strict as assert } from "node:assert";
import { test } from "node:test";
import { romeToday } from "../cash-flow/dates.ts";
import { billStatus, billTotals } from "./calc.ts";

test("a bill is due through its due date and overdue from the next Rome day; a link makes it paid", () => {
  // 23:30 UTC on 30 November is already 1 December in Rome.
  const late = romeToday(new Date("2026-11-30T23:30:00Z"));
  assert.equal(late, "2026-12-01");
  assert.equal(billStatus(false, "2026-11-30", romeToday(new Date("2026-11-30T22:30:00Z"))), "DUE", "still 30 November in Rome");
  assert.equal(billStatus(false, "2026-11-30", late), "OVERDUE");
  assert.equal(billStatus(true, "2026-11-30", late), "PAID");
  assert.equal(billStatus(false, "2026-12-01", late), "DUE", "due today is not overdue");
});

test("bill totals add integer cents per status", () => {
  const totals = billTotals([
    { totalCents: 12_345, status: "PAID" }, { totalCents: 1, status: "PAID" },
    { totalCents: 5_000, status: "DUE" }, { totalCents: 7_777, status: "OVERDUE" },
  ]);
  assert.deepEqual(totals, { paidCents: 12_346, dueCents: 5_000, overdueCents: 7_777 });
  assert.deepEqual(billTotals([]), { paidCents: 0, dueCents: 0, overdueCents: 0 });
});
