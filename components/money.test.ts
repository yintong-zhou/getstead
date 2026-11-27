import assert from "node:assert/strict";
import test from "node:test";
import { editableEuros, parseEuros, parseLimit } from "./money.ts";

test("amount expressions calculate exact cents and keep each field's rules", () => {
  assert.equal(parseEuros(" 120,50 - 20 + 5 "), 10_550);
  assert.equal(parseEuros("0,10 + 0.20"), 30);
  assert.equal(parseLimit("1 - 1"), 0);
  assert.equal(parseEuros("1 - 2 + 3"), 200);
  assert.equal(parseEuros("10000000 + 1 - 1"), MAX_CENTS);
  assert.equal(parseEuros("10000000 + 0,01"), null);
  assert.equal(parseEuros("1 - 1"), null);
  assert.equal(parseLimit("1 - 2"), null);
  for (const invalid of ["1+", "+1", "1+-2", "1--2", "1e2+1", "1.234+1", "1 2+3", "1+2*3", "1+".repeat(64) + "1"]) {
    assert.equal(parseEuros(invalid), null, invalid);
  }
});
import { MAX_CENTS } from "../server/cash-flow/money.ts";

test("typed euros become exact cents", () => {
  assert.equal(parseEuros("12,50"), 1_250);
  assert.equal(parseEuros("12.5"), 1_250);
  assert.equal(parseEuros(" 7 "), 700);
  assert.equal(parseEuros("0,05"), 5);
  assert.equal(parseEuros("0"), null);
  for (const bad of ["", "-5", "1,234.50", "1.234,50", "1e3", "12,505", "abc"]) assert.equal(parseEuros(bad), null, bad);
});

test("the form accepts exactly what the server accepts, up to the maximum", () => {
  assert.equal(parseEuros("10000000"), MAX_CENTS, "the maximum itself is allowed");
  assert.equal(parseEuros("10000000,00"), MAX_CENTS);
  assert.equal(parseEuros("10000000,01"), null, "one cent above is refused before it reaches the API");
  assert.equal(parseEuros("99999999"), null);
  assert.equal(parseEuros("123456789"), null, "more than eight integer digits");
});

test("a limit may be zero, an amount may not", () => {
  assert.equal(parseLimit("0"), 0);
  assert.equal(parseLimit("0,00"), 0);
  assert.equal(parseLimit("100"), 10_000);
  assert.equal(parseEuros("0,00"), null);
});

test("editable euros use the locale separator", () => {
  assert.equal(editableEuros(-1_250, "en"), "12.50");
  assert.equal(editableEuros(5, "it"), "0,05");
});

test("hidden amounts use a fixed asterisk mask without exposing the original value", async () => {
  const money = await import("./money.ts");
  assert.equal(typeof money.privateAmount, "function");
  assert.equal(money.privateAmount("€1,234.56", true), "******");
  assert.equal(money.privateAmount("-€3.00", true), "******");
  assert.equal(money.privateAmount("€1,234.56", false), "€1,234.56");
});
