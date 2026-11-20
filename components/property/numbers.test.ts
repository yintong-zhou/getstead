import assert from "node:assert/strict";
import test from "node:test";
import { millesimiShareCents } from "../../server/property/calc.ts";
import { millesimiShare, MAX_PAYABLE_CENTS, MAX_VALUE_CENTS, ownershipText, parseEurosUpTo, parseOwnership } from "./numbers.ts";

test("euro inputs keep exact cents and stop at the given maximum", () => {
  assert.equal(parseEurosUpTo(" 0,05 ", MAX_VALUE_CENTS), 5);
  assert.equal(parseEurosUpTo("250000", MAX_VALUE_CENTS), 25_000_000);
  assert.equal(parseEurosUpTo("10000000,00", MAX_PAYABLE_CENTS), 1_000_000_000);
  assert.equal(parseEurosUpTo("10000000,01", MAX_PAYABLE_CENTS), null, "one cent over the movement limit");
  assert.equal(parseEurosUpTo("10000000000,00", MAX_VALUE_CENTS), 1_000_000_000_000);
  assert.equal(parseEurosUpTo("10000000000,01", MAX_VALUE_CENTS), null);
  for (const text of ["", "0", "0,00", "-1", "1e2", "1,000.00", "1.234", "99999999999"]) assert.equal(parseEurosUpTo(text, MAX_VALUE_CENTS), null, text);
});

test("ownership percentages convert to basis points and back", () => {
  assert.equal(parseOwnership("50"), 5_000);
  assert.equal(parseOwnership("33,33"), 3_333);
  assert.equal(parseOwnership("100"), 10_000);
  assert.equal(parseOwnership("0,01"), 1);
  for (const text of ["0", "0,00", "100,01", "101", "-5", "1,234", "", "abc"]) assert.equal(parseOwnership(text), null, text);
  assert.equal(ownershipText(5_000, "."), "50");
  assert.equal(ownershipText(3_333, ","), "33,33");
  assert.equal(ownershipText(10_000, "."), "100");
  assert.equal(ownershipText(1_050, "."), "10.5");
});

test("the form-side millesimi share equals the server calculation", () => {
  for (const [total, unit, building] of [[1_000_000, 85, 1_000], [1_000, 1, 3], [1_000, 2, 3], [1_000_000, 100, 1_042], [1, 1, 1_000], [100_000_000_000, 99_999, 100_000]]) {
    assert.equal(millesimiShare(total, unit, building), millesimiShareCents(total, unit, building));
  }
});
