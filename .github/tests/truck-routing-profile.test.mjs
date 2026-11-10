import test from "node:test";
import assert from "node:assert/strict";
import { getSavedTruckRoutingProfile } from "../../lib/truck-routing-profile.mjs";

const validVehicle = {
  is_demo: false,
  registration_verification_status: "verified",
  registration_document_path: "fleet-id/vehicle-id/registration.pdf",
  registration_verified_at: "2026-11-10T08:00:00.000Z",
  registration_verified_by: "00000000-0000-4000-8000-000000000001",
  routing_vehicle_type: "StraightTruck",
  height_cm: 420,
  width_cm: 250,
  length_cm: 900,
  gross_weight_kg: 26000,
  empty_weight_kg: 9000,
  axle_count: 4,
  trailer_count: 0,
  weight_per_axle_kg: 10000
};

test("accepts only a complete, human-verified saved vehicle profile", () => {
  const profile = getSavedTruckRoutingProfile({ ...validVehicle, height_cm: "420" });
  assert.equal(profile.heightCm, 420);
  assert.equal(profile.grossWeightKg, 26000);
  assert.equal(profile.emptyWeightKg, 9000);
  assert.equal(profile.vehicleType, "StraightTruck");
});

test("rejects unverified, pending, rejected, or missing registration evidence", () => {
  for (const change of [
    { registration_verification_status: "unverified" },
    { registration_verification_status: "pending" },
    { registration_verification_status: "rejected" },
    { registration_verification_status: undefined },
    { registration_document_path: null },
    { registration_verified_at: null },
    { registration_verified_by: null }
  ]) {
    assert.equal(getSavedTruckRoutingProfile({ ...validVehicle, ...change }), null);
  }
});

test("rejects missing or out-of-range dimensions, weights, and vehicle configuration", () => {
  for (const change of [
    { height_cm: null },
    { height_cm: 99 },
    { width_cm: 351 },
    { length_cm: 199 },
    { gross_weight_kg: 100001 },
    { empty_weight_kg: null },
    { empty_weight_kg: 27000 },
    { axle_count: 1 },
    { trailer_count: 4 },
    { routing_vehicle_type: "Car" },
    { weight_per_axle_kg: 30001 },
    { weight_per_axle_kg: 26001 }
  ]) {
    assert.equal(getSavedTruckRoutingProfile({ ...validVehicle, ...change }), null);
  }
});

test("requires an axle-load value and defaults a missing trailer count to zero", () => {
  const profile = getSavedTruckRoutingProfile({
    ...validVehicle,
    trailer_count: null,
    weight_per_axle_kg: 9000
  });
  assert.equal(profile.trailerCount, 0);
  assert.equal(profile.weightPerAxleKg, 9000);
  assert.equal(getSavedTruckRoutingProfile({ ...validVehicle, weight_per_axle_kg: null }), null);
});

test("never allows demo vehicles to be used for truck routing", () => {
  assert.equal(getSavedTruckRoutingProfile({ ...validVehicle, is_demo: true }), null);
});
