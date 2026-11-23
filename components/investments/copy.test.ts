import assert from "node:assert/strict";
import test from "node:test";
import { investmentsCopy } from "./copy.ts";

// "Gross" misled people: each transaction type must say what the amount excludes and how cash is derived.
test("every transaction type has its own amount label and cash formula, in both locales", () => {
  for (const locale of ["en", "it"] as const) {
    const { types, amountLabels, amountHints } = investmentsCopy[locale];
    for (const type of Object.keys(types) as (keyof typeof types)[]) {
      assert.ok(amountLabels[type], `${locale}.${type} label`);
      assert.ok(amountHints[type], `${locale}.${type} hint`);
    }
    assert.equal(new Set(Object.values(amountLabels)).size, Object.keys(types).length, `${locale}: labels must differ per type`);
  }
});

// Deleting is permanent and moves money figures: the dialog must say so and show the counts it will remove.
test("delete-position confirmation names the instrument, the counts and the consequences, in both locales", () => {
  const text = { en: investmentsCopy.en.deletePositionConfirm("Synthetic ETF", 3, 2), it: investmentsCopy.it.deletePositionConfirm("Synthetic ETF", 3, 2) };
  for (const [locale, message] of Object.entries(text)) {
    assert.ok(message.includes("Synthetic ETF") && message.includes("(3,") && message.includes("(2)"), `${locale}: name and counts`);
  }
  assert.match(text.en, /Permanently.*can't be undone.*balances and net worth/s);
  assert.match(text.it, /definitivamente.*non si può annullare.*saldi.*patrimonio netto/s);
});
