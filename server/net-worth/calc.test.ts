import assert from "node:assert/strict";
import test from "node:test";
import { assetSplit, balanceAt, monthlySeries, netWorthAt } from "./calc.ts";
import { Reader } from "../cash-flow/validate.ts";
import { addDays, addMonths, monthOf, monthStart } from "../cash-flow/dates.ts";
import type { Transaction } from "../investments/calc.ts";

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
    holdingsCents: 0, propertiesCents: 0, assetsCents: 20_000, liabilitiesCents: 5_000, netCents: 15_000,
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

test("investment effects use balance-check cutoff and holdings keep current and monthly totals in parity", () => {
  const accounts = [{ id: "broker" }];
  const transactions: Transaction[] = [
    { id: "b", accountId: "broker", instrumentId: "etf", type: "BUY", tradeDate: "2026-10-02", ordinal: 1, quantity: "2", amountCents: 60_000n, feesCents: 0n, taxWithheldCents: 0n },
    { id: "d", accountId: "broker", instrumentId: "etf", type: "DIVIDEND", tradeDate: "2026-11-02", ordinal: 1, quantity: null, amountCents: 1_000n, feesCents: 0n, taxWithheldCents: 260n },
    { id: "void", accountId: "broker", instrumentId: "etf", type: "COUPON", tradeDate: "2026-11-03", ordinal: 1, quantity: null, amountCents: 999_999n, feesCents: 0n, taxWithheldCents: 0n, voidedAt: new Date() },
  ];
  const investments = { instruments: [{ id: "etf", name: "Synthetic ETF", kind: "ETF" as const }], transactions,
    quotes: [{ instrumentId: "etf", asOf: "2026-11-01", unitPrice: "310" }] };
  const historyChecks = [{ accountId: "broker", asOf: "2026-10-01", balanceCents: 100_000 }];
  const today = "2026-11-20";
  const series = monthlySeries(accounts, historyChecks, [], today, investments);
  for (const [index, point] of series.entries()) {
    const date = index === 11 ? today : addDays(monthStart(addMonths(point.month, 1)), -1);
    const total = netWorthAt(accounts, historyChecks, [], date, investments);
    assert.equal(point.netCents, total.netCents);
    assert.equal(point.assetsCents, total.assetsCents);
  }
  assert.equal(series.at(-2)?.netCents, 100_000);
  assert.equal(series.at(-1)?.netCents, 102_740);
  assert.equal(netWorthAt(accounts, historyChecks, [], today, investments).perAccount[0].balanceCents, 40_740);
  assert.equal(netWorthAt(accounts, [{ accountId: "broker", asOf: "2026-11-02", balanceCents: 40_740 }], [], today, investments).netCents, 102_740);
});

test("combined net worth overflow returns the typed range failure before currency formatting", () => {
  const accounts = [{ id: "a" }, { id: "b" }];
  const tooLarge = accounts.map(({ id }) => ({ accountId: id, asOf: "2026-01-01", balanceCents: Number.MAX_SAFE_INTEGER }));
  assert.throws(() => netWorthAt(accounts, tooLarge, [], "2026-11-20"), { status: 422, code: "value_out_of_range" });
  assert.throws(() => monthlySeries(accounts, tooLarge, [], "2026-11-20"), { status: 422, code: "value_out_of_range" });
});

test("properties add their value share to assets in the total and the series, and a mortgage leaves liabilities unchanged", () => {
  const accounts = [{ id: "cash" }, { id: "mortgage" }];
  const accountChecks = [{ accountId: "cash", asOf: "2026-01-01", balanceCents: 1_000_000 }, { accountId: "mortgage", asOf: "2026-01-01", balanceCents: -12_000_000 }];
  const realEstate = {
    properties: [{ id: "home", ownershipBps: 5_000, soldOn: null }, { id: "flat", ownershipBps: 10_000, soldOn: "2026-10-15" }, { id: "plot", ownershipBps: 10_000, soldOn: null }],
    valuations: [
      { propertyId: "home", asOf: "2026-01-01", valueCents: 30_000_000 }, { propertyId: "home", asOf: "2026-11-01", valueCents: 32_000_000 },
      { propertyId: "flat", asOf: "2026-01-01", valueCents: 10_000_000 },
    ],
  };
  const today = "2026-11-20";
  const without = netWorthAt(accounts, accountChecks, [], today);
  const total = netWorthAt(accounts, accountChecks, [], today, undefined, realEstate);
  assert.equal(total.propertiesCents, 16_000_000, "latest valuation of the 50% home; the flat is sold and the plot has no valuation");
  assert.equal(total.liabilitiesCents, without.liabilitiesCents, "the loan is already a liability, so the property link changes nothing");
  assert.equal(total.netCents, without.netCents + 16_000_000);
  const series = monthlySeries(accounts, accountChecks, [], today, undefined, realEstate);
  for (const [index, point] of series.entries()) {
    const date = index === 11 ? today : addDays(monthStart(addMonths(point.month, 1)), -1);
    assert.equal(point.netCents, netWorthAt(accounts, accountChecks, [], date, undefined, realEstate).netCents);
  }
  assert.equal(series.at(-1)?.netCents, total.netCents, "the last point equals the current total");
  const september = series.find((point) => point.month === "2026-09")!;
  const october = series.find((point) => point.month === "2026-10")!;
  assert.equal(september.assetsCents - october.assetsCents, 10_000_000, "the flat drops out once it is sold on 2026-10-15");
});

test("a pension account counts once as an asset, next to holdings, and never inside them", () => {
  const accounts = [{ id: "broker" }, { id: "pension" }];
  const transactions: Transaction[] = [
    { id: "b", accountId: "broker", instrumentId: "etf", type: "BUY", tradeDate: "2026-10-02", ordinal: 1, quantity: "2", amountCents: 60_000n, feesCents: 0n, taxWithheldCents: 0n },
  ];
  const investments = { instruments: [{ id: "etf", name: "Synthetic ETF", kind: "ETF" as const }], transactions,
    quotes: [{ instrumentId: "etf", asOf: "2026-11-01", unitPrice: "310" }] };
  const pensionChecks = [
    { accountId: "pension", asOf: "2026-06-30", balanceCents: 1_500_000 },
    { accountId: "pension", asOf: "2026-09-30", balanceCents: 1_620_000 },
  ];
  const brokerChecks = [{ accountId: "broker", asOf: "2026-10-01", balanceCents: 100_000 }];
  const today = "2026-11-20";
  const total = netWorthAt(accounts, [...brokerChecks, ...pensionChecks], [], today, investments);
  const withoutPension = netWorthAt([{ id: "broker" }], brokerChecks, [], today, investments);
  assert.equal(total.holdingsCents, 62_000, "holdings are the ETF only");
  assert.equal(total.holdingsCents, withoutPension.holdingsCents, "the pension never enters holdings");
  assert.equal(total.perAccount.find(({ accountId }) => accountId === "pension")?.balanceCents, 1_620_000, "latest dated check");
  assert.equal(total.assetsCents, withoutPension.assetsCents + 1_620_000, "the pension adds exactly its balance, once");
  assert.equal(monthlySeries(accounts, [...brokerChecks, ...pensionChecks], [], today, investments).at(-1)?.netCents, total.netCents);
});

test("the asset split adds up to gross assets and leaves overdrawn accounts to liabilities", () => {
  const accounts = [
    { id: "c", type: "CHECKING" }, { id: "b", type: "BROKERAGE" }, { id: "p", type: "PENSION" }, { id: "o", type: "CHECKING" }, { id: "d", type: "DEBT" },
  ];
  const checks = [
    { accountId: "c", asOf: "2026-11-01", balanceCents: 1_000 }, { accountId: "b", asOf: "2026-11-01", balanceCents: 200 },
    { accountId: "p", asOf: "2026-11-01", balanceCents: 3_000 }, { accountId: "o", asOf: "2026-11-01", balanceCents: -500 },
    { accountId: "d", asOf: "2026-11-01", balanceCents: -9_000 },
  ];
  const totals = netWorthAt(accounts, checks, [], "2026-11-20");
  const types = new Map(accounts.map(({ id, type }) => [id, type]));
  const split = assetSplit(totals.perAccount.map((row) => ({ type: types.get(row.accountId)!, balanceCents: row.balanceCents })), 4_000, 50_000);
  assert.deepEqual(split, { liquidityCents: 1_200, savingsCents: 0, investmentsCents: 4_000, pensionCents: 3_000, propertyCents: 50_000 });
  assert.equal(split.liquidityCents + split.savingsCents + split.investmentsCents + split.pensionCents + split.propertyCents, totals.assetsCents + 4_000 + 50_000);
  assert.equal(totals.liabilitiesCents, 9_500);
});

test("a savings account is its own group, not pure cash, and an overdrawn one is not an asset", () => {
  const split = assetSplit([{ type: "SAVINGS", balanceCents: 1_000_000 }, { type: "SAVINGS", balanceCents: -500 }, { type: "CHECKING", balanceCents: 200 }], 0, 0);
  assert.equal(split.savingsCents, 1_000_000);
  assert.equal(split.liquidityCents, 200);
  assert.equal(split.investmentsCents + split.pensionCents, 0);
});
