import test from "node:test";
import assert from "node:assert/strict";
import { getIsraelCalendarDate, addIsraelCalendarDays, differenceInCalendarDays } from "../../lib/israel-date.mjs";

test("Israel calendar date changes at midnight in Israel, not UTC midnight", () => {
  assert.equal(getIsraelCalendarDate(new Date("2026-11-14T21:59:59.999Z")), "2026-11-14");
  assert.equal(getIsraelCalendarDate(new Date("2026-11-14T22:00:00.000Z")), "2026-11-15");
});

test("Israel date helper follows the summer UTC+3 offset", () => {
  assert.equal(getIsraelCalendarDate(new Date("2026-07-01T20:59:59.999Z")), "2026-07-01");
  assert.equal(getIsraelCalendarDate(new Date("2026-07-01T21:00:00.000Z")), "2026-07-02");
});

test("calendar day addition handles month, year and leap-day boundaries", () => {
  assert.equal(addIsraelCalendarDays("2026-11-15", 30), "2026-12-15");
  assert.equal(addIsraelCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addIsraelCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addIsraelCalendarDays("2028-03-01", -1), "2028-02-29");
});

test("calendar day differences are calendar-based rather than 24-hour based", () => {
  assert.equal(differenceInCalendarDays("2026-04-01", "2026-03-27"), 5);
  assert.equal(differenceInCalendarDays("2026-11-15", "2026-11-14"), 1);
  assert.equal(differenceInCalendarDays("2026-11-14", "2026-11-15"), -1);
});

test("invalid dates and non-integer offsets are rejected", () => {
  assert.throws(() => addIsraelCalendarDays("2026-02-30", 1), RangeError);
  assert.throws(() => addIsraelCalendarDays("2026-11-15", 1.5), RangeError);
  assert.throws(() => differenceInCalendarDays("bad", "2026-11-15"), RangeError);
});
