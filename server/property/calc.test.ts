import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDays, isOccurrence, nextOccurrenceAfter } from "../cash-flow/dates.ts";
import { ApiError } from "../cash-flow/errors.ts";
import {
  addCosts, costsToNumbers, equityCents, millesimiShareCents, propertiesAt, propertyCosts, shareValueCents, valueAt, votingWeight,
  type CostSchedule, type Property, type Valuation,
} from "./calc.ts";

const home: Property = { id: "home", ownershipBps: 10_000, soldOn: null };
const val = (propertyId: string, asOf: string, valueCents: number): Valuation => ({ propertyId, asOf, valueCents });

test("valueAt takes the latest valuation on or before the date, regardless of input order", () => {
  const rows = [val("home", "2026-06-01", 30_000_000), val("home", "2025-01-01", 28_000_000), val("home", "2027-01-01", 99_000_000), val("other", "2026-05-01", 1)];
  assert.equal(valueAt(rows, "home", "2026-11-20"), 30_000_000);
  assert.equal(valueAt(rows, "home", "2026-06-01"), 30_000_000, "same-day valuation counts");
  assert.equal(valueAt(rows, "home", "2025-12-31"), 28_000_000);
  assert.equal(valueAt(rows, "home", "2024-12-31"), null, "nothing before the first valuation");
});

test("shareValueCents rounds half up in integer arithmetic", () => {
  assert.equal(shareValueCents(30_000_000, 10_000), 30_000_000n);
  assert.equal(shareValueCents(30_000_000, 5_000), 15_000_000n);
  assert.equal(shareValueCents(1, 5_000), 1n, "0.5 cents rounds up");
  assert.equal(shareValueCents(1, 4_999), 0n);
  assert.equal(shareValueCents(100, 3_333), 33n, "33.33 rounds down");
  assert.equal(shareValueCents(1_000_000_000_000, 1), 100_000_000n, "1 bp of the largest value");
});

test("propertiesAt sums value shares, flags missing valuations and drops a property from its sale date", () => {
  const properties: Property[] = [home, { id: "half", ownershipBps: 5_000, soldOn: null }, { id: "sold", ownershipBps: 10_000, soldOn: "2026-09-01" }, { id: "new", ownershipBps: 10_000, soldOn: null }];
  const valuations = [val("home", "2026-01-01", 20_000_000), val("half", "2026-01-01", 10_000_000), val("sold", "2026-01-01", 5_000_000)];
  const before = propertiesAt(properties, valuations, "2026-08-31");
  assert.equal(before.totalCents, 20_000_000 + 5_000_000 + 5_000_000);
  assert.deepEqual(before.rows.map((row) => [row.id, row.shareValueCents, row.noValuation]), [["home", 20_000_000, false], ["half", 5_000_000, false], ["sold", 5_000_000, false], ["new", 0, true]]);
  const after = propertiesAt(properties, valuations, "2026-09-01");
  assert.equal(after.totalCents, 25_000_000, "sold on the date: no longer counted that day");
  assert.equal(after.rows.find((row) => row.id === "sold")?.shareValueCents, 0);
});

test("millesimiShareCents splits a building-wide amount and votingWeight is the ratio", () => {
  assert.equal(millesimiShareCents(1_000_000, 85, 1_000), 85_000);
  assert.equal(millesimiShareCents(1_000, 1, 3), 333, "333.33 rounds down");
  assert.equal(millesimiShareCents(1_000, 2, 3), 667, "666.67 rounds up");
  assert.equal(millesimiShareCents(1_000_000, 100, 1_042), 95_969, "non-1000 building total");
  assert.equal(millesimiShareCents(1, 1, 1_000), 0, "a share can round to zero");
  assert.deepEqual(votingWeight(85, 1_000), { unit: 85, total: 1_000, percent: "8.5" });
  assert.equal(votingWeight(1, 3).percent, "33.33");
});

test("equityCents is the value share minus the debt balance (a debt account balance is negative)", () => {
  assert.equal(equityCents(20_000_000, -12_000_000), 8_000_000);
  assert.equal(equityCents(20_000_000, 0), 20_000_000);
  assert.equal(equityCents(10_000_000, -12_000_000), -2_000_000, "negative equity is allowed");
});

test("sums stay exact at the caps and a total beyond the safe range raises the typed error", () => {
  const ten: Property[] = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, ownershipBps: 10_000, soldOn: null }));
  const atCap = ten.map((property) => val(property.id, "2026-01-01", 1_000_000_000_000));
  assert.equal(propertiesAt(ten, atCap, "2026-02-01").totalCents, 10_000_000_000_000);
  const two: Property[] = [{ id: "a", ownershipBps: 10_000, soldOn: null }, { id: "b", ownershipBps: 10_000, soldOn: null }];
  const huge = [val("a", "2026-01-01", 5_000_000_000_000_000), val("b", "2026-01-01", 5_000_000_000_000_000)];
  assert.throws(() => propertiesAt(two, huge, "2026-02-01"), (error: unknown) => error instanceof ApiError && error.code === "value_out_of_range");
});

// ---------------------------------------------------------------- costs

const monthly = (startDate: string, extra: Partial<CostSchedule> = {}): CostSchedule =>
  ({ rule: { frequency: "MONTHLY", startDate, endDate: null }, amountCents: 10_000, archived: false, resolved: new Set(), ...extra });
const costs = (over: Partial<Parameters<typeof propertyCosts>[0]>) =>
  costsToNumbers(propertyCosts({ year: 2026, today: "2026-11-21", paid: [], pending: [], schedules: [], ...over }));

test("paid costs split by kind and use the booking date inside the calendar year", () => {
  const result = costs({
    paid: [
      { kind: "ORDINARY", cents: 10_000, date: "2026-01-01" }, { kind: "ORDINARY", cents: 12_345, date: "2026-12-31" },
      { kind: "ORDINARY", cents: 99, date: "2025-12-31" }, { kind: "ORDINARY", cents: 99, date: "2027-01-01" },
      { kind: "EXTRAORDINARY", cents: 500_000, date: "2026-06-30" }, { kind: "BALANCING", cents: 7_000, date: "2026-03-15" },
    ],
  });
  assert.equal(result.paidOrdinary, 22_345);
  assert.equal(result.paidExtraordinary, 500_000);
  assert.equal(result.paidBalancing, 7_000);
  assert.equal(result.paidTotal, 529_345);
  assert.equal(result.expectedTotal, 529_345);
});

test("an unpaid instalment becomes overdue instead of disappearing; resolved ones count nowhere", () => {
  // Monthly from 1 January: 11 dates up to 1 November are past, 1 December is ahead.
  const open = costs({ schedules: [monthly("2026-01-01")] });
  assert.equal(open.overdueOrdinary, 110_000);
  assert.equal(open.forecastOrdinary, 10_000);
  assert.equal(open.expectedTotal, 120_000, "twelve instalments, none lost");
  const resolved = new Set(["2026-01-01", "2026-02-01", "2026-03-01"]); // confirmed, matched or skipped
  const some = costs({ schedules: [monthly("2026-01-01", { resolved })] });
  assert.equal(some.overdueOrdinary, 80_000);
  assert.equal(some.forecastOrdinary, 10_000);
});

test("forecast is confined to the selected calendar year: past, current, future", () => {
  const rule = [monthly("2020-01-15")];
  const past = costs({ year: 2025, schedules: rule });
  assert.deepEqual([past.overdueOrdinary, past.forecastOrdinary], [120_000, 0], "a past year has nothing ahead");
  const current = costs({ schedules: rule });
  assert.deepEqual([current.overdueOrdinary, current.forecastOrdinary], [110_000, 10_000]); // 15 Jan..15 Nov, 15 Dec
  const future = costs({ year: 2027, schedules: rule });
  assert.deepEqual([future.overdueOrdinary, future.forecastOrdinary], [0, 120_000], "a future year is all forecast");
  assert.equal(costs({ today: "2026-12-15", schedules: rule }).forecastOrdinary, 10_000, "due today counts as forecast");
});

test("endDate, archive and empty periods", () => {
  assert.equal(costs({ schedules: [monthly("2026-01-01", { rule: { frequency: "MONTHLY", startDate: "2026-01-01", endDate: "2026-04-15" } })] }).expectedTotal, 40_000);
  assert.equal(costs({ schedules: [monthly("2026-01-01", { archived: true })] }).expectedTotal, 0, "archived schedules add nothing");
  assert.equal(costs({ schedules: [monthly("2027-03-01")] }).expectedTotal, 0, "starts after the year");
  assert.equal(costs({}).expectedTotal, 0);
});

test("pending charges count by due date, in the year only", () => {
  const result = costs({ pending: [{ cents: 300_000, dueDate: "2026-02-01" }, { cents: 100_000, dueDate: "2027-02-01" }] });
  assert.equal(result.pendingCharges, 300_000);
  assert.equal(result.expectedTotal, 300_000);
});

test("a weekly schedule started in 2000 still forecasts 2100", () => {
  const result = costs({ year: 2100, today: "2026-11-21", schedules: [{ rule: { frequency: "WEEKLY", startDate: "2000-01-01", endDate: null }, amountCents: 100, archived: false, resolved: new Set() }] });
  assert.ok(result.forecastOrdinary >= 52 * 100, "about 52 Saturdays in 2100");
});

test("totals add up in bigint and an overflow is value_out_of_range", () => {
  const big = { kind: "ORDINARY" as const, cents: 1_000_000_000, date: "2026-05-01" };
  assert.equal(costs({ paid: [big, big] }).paidTotal, 2_000_000_000);
  const one = propertyCosts({ year: 2026, today: "2026-11-21", paid: [big], pending: [], schedules: [] });
  let sum = one;
  for (let i = 0; i < 20; i++) sum = addCosts(sum, sum); // doubles 20 times: about 1e15 cents, still safe
  assert.equal(costsToNumbers(sum).paidOrdinary, 1_000_000_000 * 2 ** 20);
  for (let i = 0; i < 10; i++) sum = addCosts(sum, sum); // beyond Number.MAX_SAFE_INTEGER
  assert.throws(() => costsToNumbers(sum), (error) => error instanceof ApiError && error.code === "value_out_of_range");
});

test("one recurrence horizon: a weekly date beyond index 5,000 is listed, validated and found as next", () => {
  const rule = { frequency: "WEEKLY" as const, startDate: "2000-01-01", endDate: null };
  const late = addDays("2000-01-01", 5_100 * 7);
  assert.equal(isOccurrence(rule, late), true, "resolveOccurrence validates with this");
  assert.equal(nextOccurrenceAfter(rule, addDays(late, -1)), late);
  assert.ok(costs({ year: Number(late.slice(0, 4)), today: "2026-11-21", schedules: [{ rule, amountCents: 100, archived: false, resolved: new Set() }] }).forecastOrdinary > 0, "and costs count it");
});
