/**
 * Validate trip-specific measured weights before sending a truck profile to a
 * routing provider. The axle value must be the measured load on the heaviest
 * physical axle, including cargo; it must never be inferred from gross weight
 * or copied from a registration maximum.
 */
export function validateTruckTripWeights({
  currentWeightKg,
  weightPerAxleKg,
  emptyWeightKg,
  grossWeightKg
}) {
  if (
    !Number.isFinite(currentWeightKg) ||
    !Number.isFinite(weightPerAxleKg) ||
    !Number.isFinite(emptyWeightKg) ||
    !Number.isFinite(grossWeightKg) ||
    emptyWeightKg < 500 ||
    grossWeightKg < emptyWeightKg ||
    currentWeightKg < emptyWeightKg ||
    currentWeightKg > grossWeightKg ||
    weightPerAxleKg < 500 ||
    weightPerAxleKg > currentWeightKg ||
    weightPerAxleKg > grossWeightKg
  ) return null;

  return { currentWeightKg, weightPerAxleKg };
}
