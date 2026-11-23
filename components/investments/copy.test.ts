import assert from "node:assert/strict";
import test from "node:test";
import { investmentsCopy } from "./copy.ts";

test("purchases show only a total amount label and other transactions retain their cash formula", () => {
  for (const locale of ["en", "it"] as const) {
    const { types, amountLabels, amountHints } = investmentsCopy[locale];
    for (const type of Object.keys(types) as (keyof typeof types)[]) {
      assert.ok(amountLabels[type], `${locale}.${type} label`);
      if (type === "BUY") assert.equal(amountHints[type], undefined);
      else assert.ok(amountHints[type], `${locale}.${type} hint`);
    }
    assert.equal(new Set(Object.values(amountLabels)).size, Object.keys(types).length, `${locale}: labels must differ per type`);
  }
  assert.equal(investmentsCopy.it.amountLabels.BUY, "Importo totale");
  assert.equal(investmentsCopy.en.amountLabels.BUY, "Total amount");
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
