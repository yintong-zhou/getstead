import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ApiError } from "../cash-flow/errors.ts";
import { equityCents, millesimiShareCents, propertiesAt, shareValueCents, valueAt, votingWeight, type Property, type Valuation } from "./calc.ts";

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
