import assert from "node:assert/strict";
import test from "node:test";
import { currentSuggestion, movementBody } from "./movement-body.ts";

const base = { accountId: "a", bookingDate: "2026-11-02", description: "Coop market", amountCents: -500, rememberPhrase: "" };

test("automatic mode omits categoryId so server rule matching decides", () => {
  const body = movementBody({ ...base, manualCategory: null });
  assert.equal(Object.hasOwn(body, "categoryId"), false);
});

test("a manual choice is always sent, with no category as null", () => {
  assert.equal(movementBody({ ...base, manualCategory: "cat-1" }).categoryId, "cat-1");
  const none = movementBody({ ...base, manualCategory: "" });
  assert.equal(Object.hasOwn(none, "categoryId"), true);
  assert.equal(none.categoryId, null);
});

test("a remembered phrase is trimmed and only sent when present", () => {
  assert.equal(movementBody({ ...base, manualCategory: "c", rememberPhrase: "  coop " }).rememberPhrase, "coop");
  assert.equal(Object.hasOwn(movementBody({ ...base, manualCategory: "c" }), "rememberPhrase"), false);
});

test("a suggestion never outlives the description it answered", () => {
  const answer = { description: "Coop", categoryId: "groceries" };
  assert.equal(currentSuggestion(answer, "Coop"), "groceries");
  assert.equal(currentSuggestion(answer, "Coop pharmacy"), null, "edited since: stale");
  assert.equal(currentSuggestion(answer, ""), null);
  assert.equal(currentSuggestion(null, "Coop"), null);
  assert.equal(currentSuggestion({ description: "Rent", categoryId: null }, "Rent"), null);
});
