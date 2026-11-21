import assert from "node:assert/strict";
import test from "node:test";
import { historyHref, parseHistoryQuery, previewSize, registerParams } from "./movements-query.ts";

const today = "2026-11-21";
const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("hostile or missing values fall back to safe defaults", () => {
  const query = parseHistoryQuery({ type: "x", month: "2026-13", accountId: "1; drop", categoryId: "nope", page: "-3" }, today);
  assert.deepEqual(query, { type: "all", month: "2026-11", accountId: undefined, categoryId: undefined, page: 1 });
});

test("all periods never sends a month to the registry", () => {
  const query = parseHistoryQuery({ month: "all", type: "out", accountId: uuid, categoryId: "none", page: "3" }, today);
  const params = registerParams(query);
  assert.equal(params.has("month"), false);
  assert.equal(params.get("direction"), "out");
  assert.equal(params.get("categoryId"), "none");
  assert.equal(params.get("page"), "3");
});

test("a link built from changed filters resets paging", () => {
  const href = historyHref("en", { month: "2026-10", type: "in", accountId: uuid });
  assert.equal(href, `/en/cash-flow/history?month=2026-10&type=in&accountId=${uuid}`);
  assert.match(historyHref("it", { month: "all", page: 2 }), /month=all&page=2$/);
});

test("preview is 3 rows unless 5 is chosen", () => {
  assert.equal(previewSize(undefined), 3);
  assert.equal(previewSize("7"), 3);
  assert.equal(previewSize("5"), 5);
});
