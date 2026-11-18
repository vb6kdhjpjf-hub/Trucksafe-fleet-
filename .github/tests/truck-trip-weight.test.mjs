import test from "node:test";
import assert from "node:assert/strict";
import { validateTruckTripWeights } from "../../lib/truck-trip-weight.mjs";

const base = {
  emptyWeightKg: 9000,
  grossWeightKg: 26000,
  currentWeightKg: 18000,
  weightPerAxleKg: 7200,
  registeredMaxWeightPerAxleKg: 10000
};

test("accepts measured trip axle load within actual and registered axle limits", () => {
  assert.deepEqual(validateTruckTripWeights(base), {
    currentWeightKg: 18000,
    weightPerAxleKg: 7200
  });
});

test("rejects missing, non-finite, or out-of-range axle load", () => {
  for (const change of [
    { weightPerAxleKg: NaN },
    { weightPerAxleKg: Infinity },
    { weightPerAxleKg: 0 },
    { weightPerAxleKg: 499 },
    { weightPerAxleKg: 18001 },
    { weightPerAxleKg: 26001 }
  ]) {
    assert.equal(validateTruckTripWeights({ ...base, ...change }), null);
  }
});

test("requires a valid registered maximum axle load", () => {
  for (const registeredMaxWeightPerAxleKg of [
    null, undefined, NaN, Infinity, 499, 30001, 26001
  ]) {
    assert.equal(validateTruckTripWeights({
      ...base,
      registeredMaxWeightPerAxleKg
    }), null);
  }
});

test("rejects measured axle load above the registered maximum", () => {
  assert.equal(validateTruckTripWeights({
    ...base,
    weightPerAxleKg: 10001
  }), null);
  assert.deepEqual(validateTruckTripWeights({
    ...base,
    weightPerAxleKg: 10000
  }), {
    currentWeightKg: 18000,
    weightPerAxleKg: 10000
  });
});

test("rejects gross vehicle weight outside the registration limits", () => {
  assert.equal(validateTruckTripWeights({ ...base, currentWeightKg: 8000 }), null);
  assert.equal(validateTruckTripWeights({ ...base, currentWeightKg: 26001 }), null);
});
