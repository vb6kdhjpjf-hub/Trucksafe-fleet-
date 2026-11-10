import test from "node:test";
import assert from "node:assert/strict";
import { mapVehicleToPTVProfile } from "../../lib/ptv-profile-mapping.mjs";

const profiles = [
  { name: "IMEA_TRUCK_40T", region: "IMEA", vehicle: { totalPermittedWeight: 40000 } },
  { name: "IMEA_TRUCK_7_49T", region: "IMEA", vehicle: { totalPermittedWeight: 7490 } },
  { name: "EUR_TRUCK_40T", region: "EUROPE", vehicle: { totalPermittedWeight: 40000 } }
];
const vehicle = {
  heightCm: 400, widthCm: 254, lengthCm: 1200,
  grossWeightKg: 18000, currentWeightKg: 15000, emptyWeightKg: 9000,
  axleCount: 4, trailerCount: 0, weightPerAxleKg: 9000
};

test("selects the smallest sufficient profile in the requested region", () => {
  const result = mapVehicleToPTVProfile(profiles, vehicle, "IMEA");
  assert.equal(result.ok, true);
  assert.equal(result.profileName, "IMEA_TRUCK_40T");
  assert.equal(result.profilePermittedWeightKg, 40000);
});

test("uses the lighter profile when its permitted weight is sufficient", () => {
  const result = mapVehicleToPTVProfile(profiles, { ...vehicle, grossWeightKg: 7000, currentWeightKg: 6500, emptyWeightKg: 4000 }, "IMEA");
  assert.equal(result.profileName, "IMEA_TRUCK_7_49T");
});

test("never falls back to a profile from another region", () => {
  const result = mapVehicleToPTVProfile([profiles[2]], vehicle, "IMEA");
  assert.deepEqual(result, { ok: false, reason: "no_suitable_regional_profile" });
});

test("fails closed when no profile has a permitted-weight value", () => {
  const result = mapVehicleToPTVProfile([
    { name: "IMEA_TRUCK_40T", region: "IMEA", vehicle: {} }
  ], vehicle, "IMEA");
  assert.equal(result.reason, "no_suitable_regional_profile");
});

test("fails closed for incomplete dimensions, actual weight, or axle data", () => {
  assert.equal(mapVehicleToPTVProfile(profiles, { ...vehicle, heightCm: null }).reason, "vehicle_profile_incomplete_or_inconsistent");
  assert.equal(mapVehicleToPTVProfile(profiles, { ...vehicle, axleCount: 2.5 }).reason, "vehicle_profile_incomplete_or_inconsistent");
  assert.equal(mapVehicleToPTVProfile(profiles, { ...vehicle, emptyWeightKg: undefined }).reason, "vehicle_profile_incomplete_or_inconsistent");
});

test("fails closed when actual weight exceeds permitted weight or tare exceeds actual weight", () => {
  assert.equal(mapVehicleToPTVProfile(profiles, { ...vehicle, currentWeightKg: 19000 }).reason, "vehicle_profile_incomplete_or_inconsistent");
  assert.equal(mapVehicleToPTVProfile(profiles, { ...vehicle, emptyWeightKg: 16000 }).reason, "vehicle_profile_incomplete_or_inconsistent");
});

test("fails closed when the vehicle exceeds every regional profile", () => {
  const result = mapVehicleToPTVProfile(profiles, { ...vehicle, grossWeightKg: 42000, currentWeightKg: 41000 }, "IMEA");
  assert.equal(result.reason, "no_suitable_regional_profile");
});

test("returns separate actual and permitted weight overrides", () => {
  const result = mapVehicleToPTVProfile(profiles, vehicle, "IMEA");
  assert.deepEqual(result.vehicleOverrides, {
    height: 400, width: 254, length: 1200,
    emptyWeight: 9000, loadWeight: 6000,
    totalPermittedWeight: 18000, totalTechnicallyPermittedWeight: 18000,
    numberOfAxles: 4, numberOfTrailers: 0, axleWeight: 9000
  });
  assert.equal(result.requiresManualVehicleVerification, true);
});
