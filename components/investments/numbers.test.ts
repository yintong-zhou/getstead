import assert from "node:assert/strict";
import test from "node:test";
import { formatDecimal, ordinalPatch, parseInvestmentEuros, parsePositiveDecimal } from "./numbers.ts";

test("investment euro inputs preserve cents up to the API maximum", () => {
  assert.equal(parseInvestmentEuros(" 0,05 "), 5);
  assert.equal(parseInvestmentEuros("12345.6"), 1_234_560);
  assert.equal(parseInvestmentEuros("1000000000,00"), 100_000_000_000);
  assert.equal(parseInvestmentEuros("1000000000,01"), null);
  assert.equal(parseInvestmentEuros("0"), 0);
  for (const text of ["", "-1", "1e2", "1,000.00", "1.234", "999999999999999999999999"]) {
    assert.equal(parseInvestmentEuros(text), null, text);
  }
});

test("prices and quantities reach the API as exact positive decimal strings", () => {
  assert.equal(parsePositiveDecimal(" 00012,12345678 ", 8), "12.12345678");
  assert.equal(parsePositiveDecimal("0,0000000001", 10), "0.0000000001");
  assert.equal(parsePositiveDecimal("0,0000000001", 8), null);
  for (const text of ["0", "0.000", "-0.5", "1e-7", "1,2.3", "", "1000000000000000000"]) {
    assert.equal(parsePositiveDecimal(text, 10), null, text);
  }
});


test("display rounds exact decimals half-up without touching the stored value", () => {
  const third = "100." + "3".repeat(60);
  assert.equal(formatDecimal(third, "en", true), "€100.33333333");
  assert.equal(formatDecimal(third, "it", true), "€ 100,33333333");
  assert.equal(formatDecimal("12.5", "en", true), "€12.50");
  assert.equal(formatDecimal("0.000000005", "en", true), "€0.00000001");
  assert.equal(formatDecimal("0.999999995", "en", true), "€1.00");
  assert.equal(formatDecimal("1234.5", "it"), "1.234,5");
  assert.equal(formatDecimal("7", "en"), "7");
});

test("the edit form sends an ordinal only when the owner changed it", () => {
  assert.deepEqual(ordinalPatch("1", 1), {});
  assert.deepEqual(ordinalPatch("3", 1), { ordinal: 3 });
  assert.deepEqual(ordinalPatch("1", undefined), {});
});
