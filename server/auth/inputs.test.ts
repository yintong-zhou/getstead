import assert from "node:assert/strict";
import test from "node:test";
import { validNewPassword } from "./inputs.ts";

test("new passwords require 15 code points and at most 512 UTF-8 bytes", () => {
  for (const value of [null, undefined, 15, "", "a".repeat(14), "\ud83d\ude00".repeat(14), "a".repeat(513), "\ud83d\ude00".repeat(129)]) {
    assert.equal(validNewPassword(value), false);
  }
  for (const value of ["a".repeat(15), "\ud83d\ude00".repeat(15), "a".repeat(512), "\ud83d\ude00".repeat(128)]) {
    assert.equal(validNewPassword(value), true);
  }
});
