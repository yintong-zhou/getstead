import assert from "node:assert/strict";
import test from "node:test";
import { balanceAt, monthlySeries, netWorthAt } from "./calc.ts";
import { Reader } from "../cash-flow/validate.ts";
import { addDays, addMonths, monthOf, monthStart } from "../cash-flow/dates.ts";

const checks = [
  { accountId: "a", asOf: "2026-09-30", balanceCents: 10_000 },
  { accountId: "a", asOf: "2026-11-01", balanceCents: 20_000 },
];
const movements = [
  { accountId: "a", bookingDate: "2026-09-29", amountCents: 100 },
  { accountId: "a", bookingDate: "2026-09-30", amountCents: 200 },
  { accountId: "a", bookingDate: "2026-10-01", amountCents: -300 },
  { accountId: "a", bookingDate: "2026-10-02", amountCents: -400, voidedAt: new Date() },
  { accountId: "a", bookingDate: "2026-11-20", amountCents: 500 },
];

test("without checks, balance starts at zero and includes only non-voided movements through the date", () => {
  assert.equal(balanceAt([], [], "2026-10-01"), 0);
  assert.equal(balanceAt([], movements, "2026-10-31"), 0);
  assert.equal(balanceAt([], movements, "2026-09-30"), 300);
});

test("the latest eligible check replaces history, including movements on its own date", () => {
  assert.equal(balanceAt(checks, movements, "2026-09-29"), 100);
  assert.equal(balanceAt(checks, movements, "2026-09-30"), 10_000);
  assert.equal(balanceAt(checks, movements, "2026-10-31"), 9_700);
  assert.equal(balanceAt([...checks].reverse(), movements, "2026-11-19"), 20_000);
  assert.equal(balanceAt(checks, movements, "2026-11-20"), 20_500);
});

test("signed balances classify assets and liabilities by balance, including archived accounts and transfer legs", () => {
  const accounts = [{ id: "a", archived: true }, { id: "b" }, { id: "c" }];
  const result = netWorthAt(accounts, checks, [
    ...movements,
    { accountId: "a", bookingDate: "2026-11-02", amountCents: -1_000 },
    { accountId: "b", bookingDate: "2026-11-02", amountCents: 1_000 },
    { accountId: "c", bookingDate: "2026-11-02", amountCents: -5_000 },
    { accountId: "stranger", bookingDate: "2026-11-02", amountCents: 99_999 },
  ], "2026-11-19");
  assert.deepEqual(result, {
    assetsCents: 20_000, liabilitiesCents: 5_000, netCents: 15_000,
    perAccount: [{ accountId: "a", balanceCents: 19_000 }, { accountId: "b", balanceCents: 1_000 }, { accountId: "c", balanceCents: -5_000 }],
  });
});

test("12-month series uses each month end, leap years, and today for the current month", () => {
  const accounts = [{ id: "a" }];
  const series = monthlySeries(accounts, checks, movements, "2026-11-19");
  assert.equal(series.length, 12);
  assert.equal(series[0].month, "2025-12");
  assert.deepEqual(series.at(-2), { month: "2026-10", netCents: 9_700, assetsCents: 9_700, liabilitiesCents: 0 });
  assert.deepEqual(series.at(-1), { month: "2026-11", netCents: 20_000, assetsCents: 20_000, liabilitiesCents: 0 });
  const leap = monthlySeries(accounts, [], [{ accountId: "a", bookingDate: "2024-02-29", amountCents: 1 }], "2024-03-01");
  assert.equal(leap.at(-2)?.netCents, 1);
  assert.equal(monthlySeries(accounts, [{ accountId: "a", asOf: "2026-09-30", balanceCents: 0 }], movements, "2026-11-19").at(-2)?.netCents, -300);
});

test("monthly series matches independent month-end totals across unsorted multi-account history", () => {
  const accounts = [{ id: "a" }, { id: "no-check" }, { id: "negative" }, { id: "empty" }];
  const historyChecks = [
    { accountId: "a", asOf: "2026-08-16", balanceCents: 4_000 },
    { accountId: "a", asOf: "2025-11-30", balanceCents: 1_000 },
    { accountId: "negative", asOf: "2026-03-01", balanceCents: -5_000 },
    { accountId: "a", asOf: "2026-08-16", balanceCents: 99_999 }, // First same-date check wins, as in balanceAt.
    { accountId: "a", asOf: "2026-11-20", balanceCents: 99_999 },
    { accountId: "stranger", asOf: "2026-01-01", balanceCents: 99_999 },
  ];
  const historyMovements = [
    { accountId: "a", bookingDate: "2026-11-20", amountCents: 99_999 },
    { accountId: "a", bookingDate: "2026-08-16", amountCents: 99_999 },
    { accountId: "a", bookingDate: "2026-02-01", amountCents: 500 },
    { accountId: "a", bookingDate: "2026-08-17", amountCents: -100 },
    { accountId: "a", bookingDate: "2026-09-01", amountCents: -900, voidedAt: new Date("2026-09-02T00:00:00Z") },
    { accountId: "a", bookingDate: "2026-11-19", amountCents: 50 },
    { accountId: "no-check", bookingDate: "2025-10-01", amountCents: 200 },
    { accountId: "no-check", bookingDate: "2026-04-01", amountCents: -300 },
    { accountId: "no-check", bookingDate: "2026-11-01", amountCents: 600 },
    { accountId: "negative", bookingDate: "2026-03-01", amountCents: 99_999 },
    { accountId: "negative", bookingDate: "2026-05-01", amountCents: -200 },
    { accountId: "stranger", bookingDate: "2026-01-01", amountCents: 99_999 },
  ];
  const today = "2026-11-19";
  const expected = Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(monthOf(today), index - 11);
    const date = index === 11 ? today : addDays(monthStart(addMonths(month, 1)), -1);
    const { netCents, assetsCents, liabilitiesCents } = netWorthAt(accounts, historyChecks, historyMovements, date);
    return { month, netCents, assetsCents, liabilitiesCents };
  });
  assert.deepEqual(monthlySeries(accounts, historyChecks, historyMovements, today), expected);
  assert.deepEqual(expected.at(-1), { month: "2026-11", netCents: -750, assetsCents: 4_450, liabilitiesCents: 5_200 });
  assert.deepEqual(monthlySeries([], historyChecks, historyMovements, today), expected.map((point) => ({
    ...point, netCents: 0, assetsCents: 0, liabilitiesCents: 0,
  })));
});

test("signedCents accepts zero and both signed bounds, rejecting invalid amounts", () => {
  for (const value of [0, -1_000_000_000, 1_000_000_000]) {
    const reader = new Reader({ balanceCents: value });
    assert.equal(reader.signedCents("balanceCents"), value);
    reader.done();
  }
  for (const value of [undefined, null, "0", 0.1, NaN, Infinity, -1_000_000_001, 1_000_000_001]) {
    assert.throws(() => new Reader({ balanceCents: value }).signedCents("balanceCents"), { status: 422, field: "balanceCents" });
  }
  assert.throws(() => new Reader({ amountCents: 0 }).cents("amountCents"), { status: 422 });
});
