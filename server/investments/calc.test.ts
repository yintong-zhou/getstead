import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Decimal } from "@prisma/client/runtime/client";
import { ApiError } from "../cash-flow/errors.ts";
import {
  allocation, cashEffects, decimalInput, holdingsValue, income, indicativeTax, portfolioTrend, position,
  toSafeCents, validateHistory, valueInCents, type Instrument, type Transaction,
} from "./calc.ts";

const asOf = "2026-11-20";
const stock: Instrument = { id: "stock", name: "Example stock", kind: "STOCK" };
const bond: Instrument = { id: "italian", name: "Example bond", kind: "IT_GOV_BOND" };

function trade(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "buy", accountId: "broker", instrumentId: stock.id, type: "BUY", tradeDate: asOf,
    ordinal: 1, quantity: "2", amountCents: 2500n, feesCents: 0n, taxWithheldCents: 0n,
    ...overrides,
  };
}

const rangeError = { status: 422, code: "value_out_of_range" };
const negativeError = { status: 422, code: "negative_position" };

test("automatic closes value open holdings and a same-day manual quote takes precedence", () => {
  const nextDay = "2026-11-21";
  const automatic = { instrumentId: stock.id, asOf, unitPrice: "15", source: "MARKET" as const };
  const manual = { instrumentId: stock.id, asOf, unitPrice: "16" };
  const later = { ...automatic, asOf: nextDay, unitPrice: "17" };
  const [holding] = holdingsValue([stock], [trade()], [automatic, manual, later], asOf);
  assert.equal(holding.unitPrice, "16");
  assert.equal(holding.priceSource, "MANUAL");
  assert.equal(holding.priceAsOf, asOf);
  assert.equal(holding.gainCents, 700);
  assert.deepEqual(portfolioTrend([stock], [trade()], [automatic, manual, later], [asOf, nextDay])
    .map(({ gainCents }) => gainCents), [700, 900]);
});

test("decimal inputs are positive strings within their column precision and scale", () => {
  assert.equal(decimalInput("00012.50000000", 8, "unitPrice"), "12.5");
  assert.equal(decimalInput("999999999999999999.9999999999", 10, "quantity"), "999999999999999999.9999999999");
  assert.equal(decimalInput("9999999999.99999999", 8, "unitPrice"), "9999999999.99999999");
  for (const invalid of [1, null, "Infinity", "NaN", "1e-8", "-1", "0", "0.000000001", "1.000000000", "10000000000"]) {
    assert.throws(() => decimalInput(invalid, 8, "unitPrice"), { ...rangeError, field: "unitPrice" });
  }
  assert.throws(() => decimalInput("1000000000000000000", 10, "quantity"), rangeError);
});

test("holding value multiplies exact unit prices and rounds cents half up", () => {
  assert.equal(valueInCents("2", "12.50"), 2500n);
  assert.equal(valueInCents("3", "0.00333333"), 1n);
  assert.equal(valueInCents("1", "0.005"), 1n);
  assert.equal(valueInCents("1", "0.00499999"), 0n);
  assert.equal(valueInCents("1000000000000", "0.01"), 1_000_000_000_000n);
  assert.throws(() => valueInCents("9007199254740993", "0.01"), rangeError);
  assert.throws(() => valueInCents("1000000000000.1", "0.01"), rangeError);
});

test("safe conversion accepts signed safe integers and rejects overflow or fractional cents", () => {
  assert.equal(toSafeCents(9_007_199_254_740_991n), Number.MAX_SAFE_INTEGER);
  assert.equal(toSafeCents(new Decimal("-9007199254740991")), Number.MIN_SAFE_INTEGER);
  for (const value of [9_007_199_254_740_992n, -9_007_199_254_740_992n, new Decimal("0.5"), new Decimal("NaN")]) {
    assert.throws(() => toSafeCents(value), (error) =>
      error instanceof ApiError && error.status === 422 && error.code === "value_out_of_range");
  }
});

test("a buy includes fees in average cost per unit", () => {
  assert.deepEqual(position([trade({ feesCents: 50n })], asOf), {
    quantity: "2", costCents: 2550n, averageCost: "12.75", realised: [],
  });
});

test("replay keeps quantity precision beyond the default Decimal context", () => {
  const transactions = [
    trade({ quantity: "10000000000.0000000001" }),
    trade({ id: "second", ordinal: 2, quantity: "0.0000000001" }),
  ];
  assert.equal(position(transactions, asOf).quantity, "10000000000.0000000002");
});

test("weighted average sells remove rounded basis and exclude withholding from realised gain", () => {
  const transactions = [
    trade({ amountCents: 100n }),
    trade({ id: "second", ordinal: 2, amountCents: 102n }),
    trade({ id: "sell", ordinal: 3, type: "SELL", quantity: "1", amountCents: 80n, feesCents: 2n, taxWithheldCents: 5n }),
  ];
  assert.deepEqual(position(transactions, asOf), {
    quantity: "3", costCents: 151n, averageCost: "0.503333333333333333333333333333333333333333333333333333333333",
    realised: [{ instrumentId: stock.id, year: 2026, gainCents: 27n }],
  });
});

test("selling the remaining quantity clears all remaining basis", () => {
  const result = position([
    trade({ amountCents: 101n }),
    trade({ id: "partial", ordinal: 2, type: "SELL", quantity: "1", amountCents: 60n }),
    trade({ id: "last", ordinal: 3, type: "SELL", quantity: "1", amountCents: 60n }),
  ], asOf);
  assert.equal(result.quantity, "0");
  assert.equal(result.costCents, 0n);
  assert.equal(result.averageCost, "0");
  assert.deepEqual(result.realised.map(({ gainCents }) => gainCents), [9n, 10n]);
});

test("a sell that exceeds available quantity or is backdated before its buy fails", () => {
  assert.throws(() => position([trade(), trade({ type: "SELL", ordinal: 2, quantity: "2.01" })], asOf), negativeError);
  assert.throws(() => position([trade(), trade({ type: "SELL", tradeDate: "2026-11-19" })], asOf), negativeError);
});

test("same-day replay follows ordinal then id independently of input order", () => {
  const buy = trade({ id: "a", ordinal: 2, amountCents: 100n });
  const sell = trade({ id: "b", ordinal: 2, type: "SELL", quantity: "1", amountCents: 100n });
  const laterBuy = trade({ id: "c", ordinal: 3, amountCents: 200n });
  assert.equal(position([laterBuy, sell, buy], asOf).realised[0].gainCents, 50n);
  assert.equal(position([laterBuy, { ...sell, ordinal: 4 }, buy], asOf).realised[0].gainCents, 25n);
  assert.throws(() => position([laterBuy, { ...sell, ordinal: 1 }, buy], asOf), negativeError);
});

test("voided rows and transactions after the cutoff are skipped", () => {
  const buy = trade();
  const sell = trade({ id: "sell", type: "SELL", ordinal: 2 });
  const voidedAt = new Date("2026-11-20T12:00:00Z");
  assert.equal(position([buy, { ...sell, voidedAt }, { ...sell, tradeDate: "2026-11-21" }], asOf).quantity, "2");
  assert.throws(() => position([{ ...buy, voidedAt }, sell], asOf), negativeError);
});

test("holdings select the latest eligible quote and fall back to exact cost", () => {
  const instruments = [stock, bond, { ...stock, id: "closed" }];
  const transactions = [
    trade(), trade({ instrumentId: bond.id, quantity: "3", amountCents: 100n }),
    trade({ instrumentId: "closed" }), trade({ instrumentId: "closed", type: "SELL", ordinal: 2 }),
  ];
  const quotes = [
    { instrumentId: stock.id, asOf, unitPrice: "15" },
    { instrumentId: stock.id, asOf: "2026-11-19", unitPrice: "14" },
    { instrumentId: stock.id, asOf: "2026-11-21", unitPrice: "16" },
    { instrumentId: bond.id, asOf: "2026-11-21", unitPrice: "16" },
  ];
  const holdings = holdingsValue(instruments, transactions, quotes, asOf);
  assert.deepEqual(holdings[0], {
    instrumentId: stock.id, name: stock.name, kind: stock.kind, quantity: "2", averageCost: "12.5",
    unitPrice: "15", valueCents: 3000, costCents: 2500, gainCents: 500, gainRate: "0.2", noPrice: false,
    priceAsOf: asOf, priceSource: "MANUAL",
  });
  assert.equal(holdings[1].noPrice, true);
  assert.equal(holdings[1].unitPrice, holdings[1].averageCost);
  assert.equal(holdings[1].valueCents, 100);
  assert.equal(holdings[1].gainCents, 0);
  assert.equal(holdings[1].gainRate, null);
  assert.equal(holdings.length, 2);
});

test("unrealised gain rate is signed and requires a positive remaining cost basis", () => {
  const quotes = [{ instrumentId: stock.id, asOf, unitPrice: "10.8333" }];
  assert.equal(holdingsValue([stock], [trade({ amountCents: 3000n })], quotes, asOf)[0].gainRate, "-0.2777");
  const nearlySold = [
    trade({ quantity: "100", amountCents: 1n }),
    trade({ type: "SELL", ordinal: 2, quantity: "99" }),
  ];
  const [holding] = holdingsValue([stock], nearlySold, quotes, asOf);
  assert.equal(holding.costCents, 0);
  assert.equal(holding.gainRate, null);
});

test("fallback also enforces the per-holding cap", () => {
  const transactions = Array.from({ length: 11 }, (_, ordinal) => trade({ ordinal, amountCents: 100_000_000_000n }));
  assert.throws(() => holdingsValue([stock], transactions, [], asOf), rangeError);
});

test("history validation catches a quote-only peak before a later sale", () => {
  assert.throws(() => validateHistory([
    trade({ tradeDate: "2026-11-18" }),
    trade({ id: "sell", type: "SELL" }),
  ], [{ instrumentId: stock.id, asOf: "2026-11-19", unitPrice: "9000000000" }]), rangeError);
});

test("history validation checks trade prefixes even when holdings end the day under the cap", () => {
  assert.throws(() => validateHistory([
    trade(),
    trade({ id: "sell", type: "SELL", ordinal: 2, quantity: "1" }),
  ], [{ instrumentId: stock.id, asOf, unitPrice: "9000000000" }]), rangeError);
});

test("a same-day sale changes the units valued by that day's quote", () => {
  assert.doesNotThrow(() => validateHistory([
    trade({ tradeDate: "2026-11-19" }),
    trade({ id: "sell", type: "SELL", quantity: "1" }),
  ], [{ instrumentId: stock.id, asOf, unitPrice: "9000000000" }]));
});

test("allocation combines positions of a kind by value and handles a zero-value portfolio", () => {
  const holding = {
    instrumentId: stock.id, name: stock.name, kind: stock.kind, quantity: "1", averageCost: "1",
    unitPrice: "1", costCents: 100, gainCents: 0, gainRate: null, noPrice: true, priceAsOf: null, priceSource: null,
  };
  assert.deepEqual(allocation([
    { ...holding, valueCents: 100 },
    { ...holding, instrumentId: "other-stock", valueCents: 200 },
    { ...holding, instrumentId: bond.id, kind: bond.kind, valueCents: 100 },
  ]), [
    { kind: stock.kind, valueCents: 300, share: "0.75" },
    { kind: bond.kind, valueCents: 100, share: "0.25" },
  ]);
  assert.deepEqual(allocation([{ ...holding, valueCents: 0 }]), [{ kind: stock.kind, valueCents: 0, share: "0" }]);
});

test("cash effects debit buys and credit net proceeds and income", () => {
  const sell = trade({ type: "SELL", amountCents: 1000n, feesCents: 10n, taxWithheldCents: 25n });
  assert.deepEqual(cashEffects([
    trade({ feesCents: 50n }),
    sell,
    trade({ type: "DIVIDEND", quantity: null, amountCents: 100n, taxWithheldCents: 26n }),
    trade({ type: "COUPON", quantity: null, amountCents: 200n, taxWithheldCents: 25n }),
    { ...sell, voidedAt: new Date("2026-11-20T12:00:00Z") },
  ]), [-2550, 965, 74, 175].map((amountCents) => ({ accountId: "broker", bookingDate: asOf, amountCents })));
});

test("income includes both range endpoints and excludes trades and voided rows", () => {
  const dividend = trade({ type: "DIVIDEND", quantity: null, amountCents: 100n, taxWithheldCents: 26n });
  assert.deepEqual(income([
    { ...dividend, tradeDate: "2026-11-01" },
    { ...dividend, type: "COUPON", amountCents: 200n, taxWithheldCents: 25n },
    { ...dividend, tradeDate: "2026-10-31" },
    { ...dividend, tradeDate: "2026-11-21" },
    { ...dividend, voidedAt: new Date("2026-11-20T12:00:00Z") },
    trade(),
  ], { from: "2026-11-01", to: asOf }), { grossCents: 300, netCents: 249 });
});

test("ten thousand maximum-size dividends accumulate to exact cents", () => {
  const transactions = Array.from({ length: 10_000 }, (_, ordinal) => trade({
    ordinal, type: "DIVIDEND", quantity: null, amountCents: 100_000_000_000n, taxWithheldCents: 1n,
  }));
  assert.deepEqual(income(transactions, { from: asOf, to: asOf }), {
    grossCents: 1_000_000_000_000_000, netCents: 999_999_999_990_000,
  });
});

test("indicative taxes net gains and losses within a calendar year and tax class", () => {
  const foreignBond: Instrument = { id: "foreign", name: "Foreign bond", kind: "BOND" };
  assert.deepEqual(indicativeTax([
    { instrumentId: stock.id, year: 2026, gainCents: 1000n },
    { instrumentId: foreignBond.id, year: 2026, gainCents: -600n },
    { instrumentId: bond.id, year: 2026, gainCents: 1000n },
    { instrumentId: bond.id, year: 2026, gainCents: -100n },
    { instrumentId: stock.id, year: 2025, gainCents: -300n },
    { instrumentId: foreignBond.id, year: 2027, gainCents: 100n },
  ], [stock, bond, foreignBond]), [
    { year: 2025, taxClass: "OTHER", gainCents: 0, lossCents: 300, taxCents: 0 },
    { year: 2026, taxClass: "ITALIAN_GOV", gainCents: 1000, lossCents: 100, taxCents: 113 },
    { year: 2026, taxClass: "OTHER", gainCents: 1000, lossCents: 600, taxCents: 104 },
    { year: 2027, taxClass: "OTHER", gainCents: 100, lossCents: 0, taxCents: 26 },
  ]);
});

test("portfolio performance ignores buys and sells and only moves with prices", () => {
  const quote = (date: string, unitPrice: string) => ({ instrumentId: stock.id, asOf: date, unitPrice });
  const rows = [
    trade({ id: "b1", tradeDate: "2026-11-01" }),
    trade({ id: "b2", tradeDate: "2026-11-03", amountCents: 3000n }),
    trade({ id: "s1", tradeDate: "2026-11-04", type: "SELL", amountCents: 3000n }),
  ];
  const quotes = [quote("2026-11-01", "12.5"), quote("2026-11-02", "15")];
  const points = portfolioTrend([stock], rows, quotes, ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  assert.deepEqual(points.map(({ valueCents }) => valueCents), [2500, 3000, 6000, 3000]);
  assert.deepEqual(points.map(({ gainCents }) => gainCents), [0, 500, 500, 500]);
  assert.deepEqual(points.map(({ baseCents }) => baseCents), [2500, 2500, 5500, 5500]);
  const share = (index: number) => (points[index].gainCents - points[0].gainCents) / points[index].baseCents;
  assert.equal(share(3), share(2), "a sale leaves the percentage unchanged");
});
