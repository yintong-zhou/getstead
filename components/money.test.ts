import assert from "node:assert/strict";
import test from "node:test";
import { editableEuros, parseEuros, parseLimit } from "./money.ts";
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
