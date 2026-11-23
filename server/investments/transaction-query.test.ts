import assert from "node:assert/strict";
import test from "node:test";
import { parseTransactionQuery, transactionHistoryHref } from "./transaction-query.ts";

test("transaction history drops malformed or repeated filters and pages", () => {
  const query = parseTransactionQuery({ type: "UNKNOWN", accountId: "not-an-id", instrumentId: ["x", "y"], month: "2026-13", page: ["1", "2"] });
  assert.equal(query.page, 1);
  assert.equal(transactionHistoryHref("it", query), "/it/investments/history");
});

test("transaction links preserve the selected filters across pages", () => {
  const query = parseTransactionQuery({ type: "BUY", month: "2026-11", page: "2" });
  assert.equal(transactionHistoryHref("it", query), "/it/investments/history?type=BUY&month=2026-11&page=2");
  assert.equal(transactionHistoryHref("it", { ...query, page: 1 }), "/it/investments/history?type=BUY&month=2026-11");
});
