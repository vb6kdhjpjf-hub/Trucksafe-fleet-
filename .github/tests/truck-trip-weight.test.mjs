import test from "node:test";
import assert from "node:assert/strict";
import { validateTruckTripWeights } from "../../lib/truck-trip-weight.mjs";

const base = {
  emptyWeightKg: 9000,
  grossWeightKg: 26000,
  currentWeightKg: 18000,
  weightPerAxleKg: 7200
};

test("accepts measured trip axle load within actual and permitted gross weight", () => {
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

test("rejects gross vehicle weight outside the registration limits", () => {
  assert.equal(validateTruckTripWeights({ ...base, currentWeightKg: 8000 }), null);
  assert.equal(validateTruckTripWeights({ ...base, currentWeightKg: 26001 }), null);
});
