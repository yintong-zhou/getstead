import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays, addMonths, isOccurrence, nextOccurrenceAfter, occurrencesThrough, parseIsoDate, parseMonth, romeToday,
} from "./dates.ts";

test("today and the calendar month follow Europe/Rome, across both DST offsets", () => {
  assert.equal(romeToday(new Date("2026-10-31T23:30:00Z")), "2026-11-01"); // CET, UTC+1
  assert.equal(romeToday(new Date("2026-10-31T22:30:00Z")), "2026-10-31");
  assert.equal(romeToday(new Date("2026-06-30T22:30:00Z")), "2026-07-01"); // CEST, UTC+2
  assert.equal(romeToday(new Date("2026-06-30T21:30:00Z")), "2026-06-30");
  assert.equal(romeToday(new Date("2026-12-31T23:00:00Z")), "2027-01-01");
});

test("dates and months must be real calendar values", () => {
  assert.equal(parseIsoDate("2026-02-28"), "2026-02-28");
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate("2026-2-3"), null);
  assert.equal(parseIsoDate(20260228), null);
  assert.equal(parseMonth("2026-13"), null);
  assert.equal(parseMonth("2026-11"), "2026-11");
});

test("month and day arithmetic crosses year ends", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-11", -11), "2025-12");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
});

test("monthly occurrences keep the anchor day and clamp it in short months", () => {
  const rule = { frequency: "MONTHLY", startDate: "2026-01-31" } as const;
  assert.deepEqual(occurrencesThrough(rule, "2026-05-01"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.equal(nextOccurrenceAfter(rule, "2026-02-28"), "2026-03-31");
});

test("weekly and yearly occurrences, including a leap-day anchor and an end date", () => {
  assert.deepEqual(occurrencesThrough({ frequency: "WEEKLY", startDate: "2026-11-02" }, "2026-11-20"), ["2026-11-02", "2026-11-09", "2026-11-16"]);

  const yearly = { frequency: "YEARLY", startDate: "2024-02-29" } as const;
  assert.deepEqual(occurrencesThrough(yearly, "2028-12-31"), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);

  const ended = { frequency: "MONTHLY", startDate: "2026-01-15", endDate: "2026-03-15" } as const;
  assert.deepEqual(occurrencesThrough(ended, "2026-12-31"), ["2026-01-15", "2026-02-15", "2026-03-15"]);
  assert.equal(nextOccurrenceAfter(ended, "2026-03-15"), null);
});

test("only generated dates are occurrences", () => {
  const rule = { frequency: "MONTHLY", startDate: "2026-01-31" } as const;
  assert.equal(isOccurrence(rule, "2026-02-28"), true);
  assert.equal(isOccurrence(rule, "2026-02-27"), false);
  assert.equal(isOccurrence(rule, "2025-12-31"), false);
});

test("months outside the supported booking range are rejected", () => {
  assert.equal(parseMonth("2000-01"), "2000-01");
  assert.equal(parseMonth("2100-12"), "2100-12");
  assert.equal(parseMonth("1999-12"), null);
  assert.equal(parseMonth("2101-01"), null);
  assert.equal(parseMonth("9999-12"), null);
  assert.equal(parseMonth("0000-01"), null);
});
