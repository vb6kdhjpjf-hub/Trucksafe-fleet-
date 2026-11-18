/**
 * Validate trip-specific measured weights before sending a truck profile to a
 * routing provider. The axle value must be the measured load on the heaviest
 * physical axle, including cargo; it must never be inferred from gross weight
 * or copied from a registration maximum. A verified registration axle limit is
 * required so the measured load can be checked against the vehicle's legal cap.
 */
export function validateTruckTripWeights({
  currentWeightKg,
  weightPerAxleKg,
  registeredMaxWeightPerAxleKg,
  emptyWeightKg,
  grossWeightKg
}) {
  if (
    !Number.isFinite(currentWeightKg) ||
    !Number.isFinite(weightPerAxleKg) ||
    !Number.isFinite(registeredMaxWeightPerAxleKg) ||
    !Number.isFinite(emptyWeightKg) ||
    !Number.isFinite(grossWeightKg) ||
    emptyWeightKg < 500 ||
    grossWeightKg < emptyWeightKg ||
    currentWeightKg < emptyWeightKg ||
    currentWeightKg > grossWeightKg ||
    registeredMaxWeightPerAxleKg < 500 ||
    registeredMaxWeightPerAxleKg > 30000 ||
    registeredMaxWeightPerAxleKg > grossWeightKg ||
    weightPerAxleKg < 500 ||
    weightPerAxleKg > currentWeightKg ||
    weightPerAxleKg > grossWeightKg ||
    weightPerAxleKg > registeredMaxWeightPerAxleKg
  ) return null;

  return { currentWeightKg, weightPerAxleKg };
}
