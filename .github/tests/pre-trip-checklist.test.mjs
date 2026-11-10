import test from "node:test";
import assert from "node:assert/strict";
import { buildPreTripChecklist } from "../../lib/pre-trip-checklist.mjs";

const items = ["צמיגים", "בלמים", "אורות", "מראות", "נזילות", "מטען", "מסמכים"];
const passed = Object.fromEntries(items.map((item, index) => [index, true]));

test("requires an explicit result for all seven inspection items", () => {
  assert.equal(buildPreTripChecklist(items, {}).valid, false);
  assert.equal(buildPreTripChecklist(items, { ...passed, 6: undefined }).valid, false);
});

test("builds a clean checklist when all items pass", () => {
  const result = buildPreTripChecklist(items, passed);
  assert.equal(result.valid, true);
  assert.equal(result.hasDefects, false);
  assert.deepEqual(result.checklist, Object.fromEntries(items.map(item => [item, true])));
});

test("requires a useful defect note when any inspection item fails", () => {
  const answers = { ...passed, 1: false };
  assert.equal(buildPreTripChecklist(items, answers).valid, false);
  assert.equal(buildPreTripChecklist(items, answers, "abc").valid, false);
  const result = buildPreTripChecklist(items, answers, "בלם חניה אינו מחזיק");
  assert.equal(result.valid, true);
  assert.equal(result.hasDefects, true);
  assert.equal(result.checklist["בלמים"], false);
  assert.equal(result.checklist._defect_details, "בלם חניה אינו מחזיק");
});

test("does not allow an oversized defect note", () => {
  assert.equal(buildPreTripChecklist(items, { ...passed, 0: false }, "x".repeat(1001)).valid, false);
});
