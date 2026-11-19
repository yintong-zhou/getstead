import assert from "node:assert/strict";
import test from "node:test";
import {
  applicableLimit, counts, matchRule, normalizePhrase, spentByCategory, summarize, varianceOf,
  type CalcMovement, type LimitRow,
} from "./calc.ts";

const move = (amountCents: number, categoryId: string | null, categoryKind: CalcMovement["categoryKind"], flags: Partial<CalcMovement> = {}): CalcMovement =>
  ({ amountCents, categoryId, categoryKind, voided: false, paired: false, ...flags });

test("income and net expenses follow the category kind and the sign", () => {
  const month = [
    move(250_000, "salary", "INCOME"),
    move(-12_000, "food", "EXPENSE"),
    move(-3_000, null, null), // uncategorised outflow is spending
    move(500, null, null), // uncategorised inflow is income
  ];
  assert.deepEqual(summarize(month), { incomeCents: 250_500, expenseCents: 15_000, netCents: 235_500 });
});

test("a refund reduces category spending and the cash-flow net expense, not income", () => {
  const month = [move(-10_000, "shoes", "EXPENSE"), move(4_000, "shoes", "EXPENSE")];
  assert.equal(spentByCategory(month).get("shoes"), 6_000);
  assert.deepEqual(summarize(month), { incomeCents: 0, expenseCents: 6_000, netCents: -6_000 });

  // A refund larger than the month's spending leaves a negative net.
  assert.equal(spentByCategory([move(-1_000, "shoes", "EXPENSE"), move(5_000, "shoes", "EXPENSE")]).get("shoes"), -4_000);
});

test("voided movements and both transfer legs are excluded from every total", () => {
  const month = [
    move(-50_000, null, null, { paired: true }),
    move(50_000, null, null, { paired: true }),
    move(-9_900, "food", "EXPENSE", { voided: true }),
    move(-2_500, "food", "EXPENSE"),
  ];
  assert.equal(month.filter(counts).length, 1);
  assert.deepEqual(summarize(month), { incomeCents: 0, expenseCents: 2_500, netCents: -2_500 });
  assert.equal(spentByCategory(month).get("food"), 2_500);
});

test("integer cents stay exact where floating point would drift", () => {
  const month = Array.from({ length: 10 }, () => move(-10, "food", "EXPENSE"));
  assert.equal(spentByCategory(month).get("food"), 100);
  assert.equal(summarize([move(10, null, null), move(20, null, null)]).incomeCents, 30);
});

test("the applicable limit is the month's override, else the latest base from that month or earlier", () => {
  const rows: LimitRow[] = [
    { month: "2026-09", kind: "BASE", limitCents: 10_000 },
    { month: "2026-11", kind: "BASE", limitCents: 15_000 },
    { month: "2026-12", kind: "OVERRIDE", limitCents: 30_000 },
  ];
  const limit = (month: string) => applicableLimit(rows, month).limitCents;
  assert.equal(limit("2026-08"), null); // before any budget existed
  assert.equal(limit("2026-10"), 10_000); // frozen: the later base does not reach back
  assert.equal(limit("2026-11"), 15_000);
  assert.equal(limit("2026-12"), 30_000); // override wins for its month only
  assert.equal(limit("2027-01"), 15_000);
  assert.equal(applicableLimit(rows, "2026-12").source, "override");
});

test("a base without a limit ends the budget from that month onward", () => {
  const rows: LimitRow[] = [{ month: "2026-01", kind: "BASE", limitCents: 5_000 }, { month: "2026-06", kind: "BASE", limitCents: null }];
  assert.equal(applicableLimit(rows, "2026-05").limitCents, 5_000);
  assert.deepEqual(applicableLimit(rows, "2026-06"), { limitCents: null, source: "none" });
});

test("variance is limit minus net spent, and absent without a limit", () => {
  assert.equal(varianceOf(10_000, 6_000), 4_000);
  assert.equal(varianceOf(10_000, 12_500), -2_500);
  assert.equal(varianceOf(10_000, -500), 10_500);
  assert.equal(varianceOf(null, 6_000), null);
});

test("phrases are normalised without case, accents or punctuation", () => {
  assert.equal(normalizePhrase("  CAFFÈ   d'Orzo! "), "caffe d orzo");
  assert.equal(normalizePhrase("Società Acqua-Gas"), "societa acqua gas");
});

test("the longest matching phrase wins and ties resolve deterministically", () => {
  const rules = [
    { id: "3", phrase: "coop", categoryId: "groceries" },
    { id: "1", phrase: "coop pharmacy", categoryId: "health" },
    { id: "2", phrase: "pharmacy", categoryId: "other" },
  ];
  assert.equal(matchRule("COOP Pharmacy via Roma", rules)?.categoryId, "health");
  assert.equal(matchRule("Coop checkout", rules)?.categoryId, "groceries");
  assert.equal(matchRule("Cooperative bank", rules), null, "whole words only");
  assert.equal(matchRule("nothing relevant", rules), null);

  // Equal length: alphabetical phrase, then id. Row order must not matter.
  const tied = [
    { id: "b", phrase: "bar", categoryId: "2" },
    { id: "a", phrase: "gym", categoryId: "1" },
  ];
  assert.equal(matchRule("bar gym", tied)?.categoryId, "2");
  assert.equal(matchRule("bar gym", [...tied].reverse())?.categoryId, "2");
});
