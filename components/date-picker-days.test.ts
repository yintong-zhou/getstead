import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDays } from "./date-picker-days.ts";

test("the calendar starts on Monday and preserves leap days and date limits", () => {
  const days = calendarDays("2024-02", "2024-02-02", "2024-02-29");
  assert.equal(days.length, 42);
  assert.deepEqual(days[0], { date: "2024-01-29", outside: true, disabled: true });
  assert.deepEqual(days[3], { date: "2024-02-01", outside: false, disabled: true });
  assert.deepEqual(days[31], { date: "2024-02-29", outside: false, disabled: false });
  assert.deepEqual(days[32], { date: "2024-03-01", outside: true, disabled: true });
});
