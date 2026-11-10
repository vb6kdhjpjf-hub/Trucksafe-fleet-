import test from "node:test";
import assert from "node:assert/strict";
import { isDriverEligibleForVehicleAssignment } from "../../lib/driver-eligibility.mjs";

const today = new Date(2026, 10, 10, 12);

test("allows active driver with valid licence through today or later", () => {
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: "2026-11-10" }, today), true);
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: "2027-02-01" }, today), true);
});

test("blocks expired, missing, malformed and impossible licence dates", () => {
  for (const date of ["2026-11-09", null, "", "2026-02-30", "10/11/2027"]) {
    assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: date }, today), false);
  }
});

test("blocks inactive drivers even when the licence date is valid", () => {
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "off_duty", license_expires_at: "2027-02-01" }, today), false);
});
