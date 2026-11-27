import assert from "node:assert/strict";
import test from "node:test";
import { addMonthsToDate } from "./cash-flow/dates.ts";
import { rangeStart, sampleDates } from "./trend.ts";

test("month offsets clamp to the end of shorter months", () => {
  assert.equal(addMonthsToDate("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonthsToDate("2024-03-31", -1), "2024-02-29");
  assert.equal(addMonthsToDate("2026-01-15", -12), "2025-01-15");
});

test("ranges start where expected and Max falls back to a year without data", () => {
  assert.equal(rangeStart("YTD", "2026-11-22", null), "2025-12-31");
  assert.equal(rangeStart("MAX", "2026-11-22", "2019-04-02"), "2019-04-02");
  assert.equal(rangeStart("MAX", "2026-11-22", null), "2025-11-22");
  assert.equal(rangeStart("MAX", "2026-11-22", "2026-11-22"), "2025-11-22");
});

test("samples are ascending, end today, start at the range start and stay bounded", () => {
  const month = sampleDates("2026-10-22", "2026-11-22");
  assert.equal(month.length, 32);
  assert.deepEqual([month[0], month.at(-1)], ["2026-10-22", "2026-11-22"]);
  const year = sampleDates("2025-11-22", "2026-11-22");
  assert.ok(year.length <= 54 && year.at(-1) === "2026-11-22" && year[0] === "2025-11-22");
  const decade = sampleDates("2010-01-01", "2026-11-22");
  assert.ok(decade.length <= 122);
  assert.ok(decade.every((date, index) => index === 0 || decade[index - 1] < date));
  assert.deepEqual(sampleDates("2026-11-22", "2026-11-22"), ["2026-11-22"]);
});

test("the one-week range starts seven days ago, including across year boundaries", () => {
  assert.equal(rangeStart("1W", "2026-01-03", null), "2025-12-27");
  assert.equal(sampleDates(rangeStart("1W", "2026-01-03", null), "2026-01-03").length, 8);
});
