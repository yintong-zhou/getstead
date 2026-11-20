import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../cash-flow/errors.ts";
import { normalizeDisplayName } from "./inputs.ts";

test("display names trim, normalize NFC, count code points, and clear on empty input", () => {
  assert.equal(normalizeDisplayName("  Jose\u0301  "), "Jos\u00e9");
  assert.equal(normalizeDisplayName(" \u00a0 "), null);
  assert.equal(normalizeDisplayName("\ud83d\ude00".repeat(60)), "\ud83d\ude00".repeat(60));
  for (const input of [undefined, null, 5, {}, "x".repeat(61), "\ud83d\ude00".repeat(61), "a\nb", "\tx", "a\u007fb", "a\u0085b", "\u200b", "a\u202eb", "a\u2066b", "\ufeffx"]) {
    assert.throws(() => normalizeDisplayName(input), (error) => error instanceof ApiError && error.status === 422 && error.field === "displayName");
  }
});

test("display names keep joiners used by emoji and scripts", () => {
  assert.equal(normalizeDisplayName("\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67"), "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67");
});
