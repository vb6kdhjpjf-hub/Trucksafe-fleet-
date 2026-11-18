import test from "node:test";
import assert from "node:assert/strict";
import { isDriverEligibleForVehicleAssignment } from "../../lib/driver-eligibility.mjs";

// 22:30 UTC is already the next calendar day in Israel during November.
const afterIsraelMidnight = new Date("2026-11-10T22:30:00.000Z");

test("allows active driver with valid licence through the Israel-local current date or later", () => {
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: "2026-11-11" }, afterIsraelMidnight), true);
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: "2027-02-01" }, afterIsraelMidnight), true);
});

test("blocks expired, missing, malformed and impossible licence dates", () => {
  for (const date of ["2026-11-10", null, "", "2026-02-30", "10/11/2027"]) {
    assert.equal(isDriverEligibleForVehicleAssignment({ status: "active", license_expires_at: date }, afterIsraelMidnight), false);
  }
});

test("blocks inactive drivers even when the licence date is valid", () => {
  assert.equal(isDriverEligibleForVehicleAssignment({ status: "off_duty", license_expires_at: "2027-02-01" }, afterIsraelMidnight), false);
});
