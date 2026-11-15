import test from "node:test";
import assert from "node:assert/strict";
import { assessVehicleDocumentCompliance, getIsraelCalendarDate } from "../../lib/vehicle-document-compliance.mjs";

const valid = {
  test_due_at: "2026-12-01",
  insurance_due_at: "2026-11-30",
  registration_due_at: "2027-01-15"
};

test("accepts all three current vehicle documents including expiry today", () => {
  assert.deepEqual(assessVehicleDocumentCompliance({
    ...valid,
    test_due_at: "2026-11-15"
  }, "2026-11-15"), {
    ready: true, reason: null, missing: [], invalid: [], expired: []
  });
});

test("blocks route planning when any mandatory vehicle document is missing", () => {
  for (const field of ["test_due_at", "insurance_due_at", "registration_due_at"]) {
    const vehicle = { ...valid, [field]: null };
    const result = assessVehicleDocumentCompliance(vehicle, "2026-11-15");
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, [field === "test_due_at" ? "vehicle_test" : field === "insurance_due_at" ? "vehicle_insurance" : "vehicle_registration"]);
  }
});

test("blocks expired documents and reports each expired document", () => {
  const result = assessVehicleDocumentCompliance({
    ...valid,
    test_due_at: "2026-11-14",
    registration_due_at: "2026-10-01"
  }, "2026-11-15");
  assert.equal(result.ready, false);
  assert.deepEqual(result.expired, ["vehicle_test", "vehicle_registration"]);
});

test("rejects malformed dates rather than treating them as current", () => {
  const result = assessVehicleDocumentCompliance({ ...valid, insurance_due_at: "2026-02-30" }, "2026-11-15");
  assert.equal(result.ready, false);
  assert.deepEqual(result.invalid, ["vehicle_insurance"]);
});

test("uses the Israel calendar date for local midnight boundaries", () => {
  assert.equal(getIsraelCalendarDate(new Date("2026-11-14T22:30:00.000Z")), "2026-11-15");
});
