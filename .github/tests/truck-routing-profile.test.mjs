import test from "node:test";
import assert from "node:assert/strict";
import { getSavedTruckRoutingProfile } from "../../lib/truck-routing-profile.mjs";

const validVehicle = {
  is_demo: false,
  routing_vehicle_type: "StraightTruck",
  height_cm: 420,
  width_cm: 250,
  length_cm: 900,
  gross_weight_kg: 26000,
  axle_count: 4,
  trailer_count: 0,
  weight_per_axle_kg: 10000
};

test("accepts a complete saved vehicle profile and normalizes numeric values", () => {
  const profile = getSavedTruckRoutingProfile({ ...validVehicle, height_cm: "420" });
  assert.equal(profile.heightCm, 420);
  assert.equal(profile.grossWeightKg, 26000);
  assert.equal(profile.vehicleType, "StraightTruck");
});

test("rejects missing or out-of-range dimensions and weights", () => {
  for (const change of [
    { height_cm: null },
    { height_cm: 99 },
    { width_cm: 351 },
    { length_cm: 199 },
    { gross_weight_kg: 100001 },
    { axle_count: 1 },
    { trailer_count: 4 },
    { routing_vehicle_type: "Car" },
    { weight_per_axle_kg: 30001 }
  ]) {
    assert.equal(getSavedTruckRoutingProfile({ ...validVehicle, ...change }), null);
  }
});

test("requires a measured axle load and defaults a missing trailer count to zero", () => {
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
