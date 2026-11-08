import test from "node:test";
import assert from "node:assert/strict";
import { buildHereTruckVehicleParams } from "../../lib/here-truck-parameters.mjs";

const profile = {
  heightCm: 420, widthCm: 250, lengthCm: 900, grossWeightKg: 26000,
  axleCount: 3, trailerCount: 0, weightPerAxleKg: 9000, vehicleType: "StraightTruck"
};

test("sends HERE dimensions with explicit centimetre units", () => {
  const params = buildHereTruckVehicleParams(profile, 18000);
  assert.equal(params["vehicle[height]"], "420cm");
  assert.equal(params["vehicle[width]"], "250cm");
  assert.equal(params["vehicle[length]"], "900cm");
});

test("sends HERE gross and current weights with explicit kilogram units", () => {
  const params = buildHereTruckVehicleParams(profile, 18000);
  assert.equal(params["vehicle[grossWeight]"], "26000kg");
  assert.equal(params["vehicle[currentWeight]"], "18000kg");
  assert.equal(params["vehicle[weightPerAxle]"], "9000kg");
});

test("preserves axle count, trailer count and supported vehicle type", () => {
  const params = buildHereTruckVehicleParams(profile, 18000);
  assert.equal(params["vehicle[axleCount]"], "3");
  assert.equal(params["vehicle[trailerCount]"], "0");
  assert.equal(params["vehicle[type]"], "StraightTruck");
});

test("omits unknown optional axle weight rather than inventing it", () => {
  const params = buildHereTruckVehicleParams({ ...profile, weightPerAxleKg: null }, 18000);
  assert.equal("vehicle[weightPerAxle]" in params, false);
});

test("rejects a current weight above the saved gross weight", () => {
  assert.throws(() => buildHereTruckVehicleParams(profile, 30000), /Invalid saved truck profile/);
});

test("rejects unsupported vehicle type and out-of-range dimensions", () => {
  assert.throws(() => buildHereTruckVehicleParams({ ...profile, vehicleType: "car" }, 18000), /Invalid saved truck profile/);
  assert.throws(() => buildHereTruckVehicleParams({ ...profile, heightCm: 900 }, 18000), /Invalid saved truck profile/);
});
