import assert from "node:assert/strict";
import test from "node:test";
import { filterGroups } from "./select-filter.ts";

const groups = [
  { label: "", options: [{ label: "New category", pinned: true }, { label: "No category" }] },
  { label: "Expenses", options: [{ label: "Perché" }, { label: "Groceries" }] },
  { label: "Income", options: [{ label: "Salary" }] },
];

test("filter ignores case and accents, drops empty groups, keeps pinned options", () => {
  const found = filterGroups(groups, "  PERCHE ");
  assert.deepEqual(found.map((group) => group.options.map((option) => option.label)), [["New category"], ["Perché"]]);
  assert.equal(filterGroups(groups, "").length, 3);
  assert.deepEqual(filterGroups(groups, "zzz").flatMap((group) => group.options.map((option) => option.label)), ["New category"]);
});
