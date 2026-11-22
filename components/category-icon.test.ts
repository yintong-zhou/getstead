import assert from "node:assert/strict";
import test from "node:test";
import { categoryIcon } from "./category-icon.ts";

test("starter categories get their own icon in both languages", () => {
  const expected: [string, "EXPENSE" | "INCOME", string][] = [
    ["Groceries", "EXPENSE", "groceries"], ["Spesa", "EXPENSE", "groceries"],
    ["Dining out", "EXPENSE", "dining"], ["Ristoranti", "EXPENSE", "dining"],
    ["Transport", "EXPENSE", "transport"], ["Trasporti", "EXPENSE", "transport"],
    ["Bills", "EXPENSE", "bills"], ["Bollette", "EXPENSE", "bills"],
    ["Shopping", "EXPENSE", "shopping"], ["Acquisti", "EXPENSE", "shopping"],
    ["Health", "EXPENSE", "health"], ["Salute", "EXPENSE", "health"],
    ["Leisure", "EXPENSE", "leisure"], ["Tempo libero", "EXPENSE", "leisure"],
    ["Salary", "INCOME", "income"], ["Stipendio", "INCOME", "income"],
    ["Other income", "INCOME", "deposit"], ["Altre entrate", "INCOME", "deposit"],
  ];
  for (const [name, kind, icon] of expected) assert.equal(categoryIcon(name, kind), icon, name);
});

test("matching ignores case and accents, short words need whole-word matches, unknown names fall back", () => {
  assert.equal(categoryIcon("CAFFÈ", "EXPENSE"), "coffee");
  assert.equal(categoryIcon("Barbiere", "EXPENSE"), "tag");
  assert.equal(categoryIcon("Business", "EXPENSE"), "tag");
  assert.equal(categoryIcon("Gas", "EXPENSE"), "bills");
  assert.equal(categoryIcon("Zzz", "EXPENSE"), "tag");
  assert.equal(categoryIcon("Zzz", "INCOME"), "deposit");
});
