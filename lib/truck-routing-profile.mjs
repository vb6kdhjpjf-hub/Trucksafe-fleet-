const inRange = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function getSavedTruckRoutingProfile(vehicle) {
  // Dimensions entered by a fleet manager are not proof of registration data.
  // A real route profile requires an explicit, human-reviewed approval state.
  if (
    !vehicle ||
    vehicle.is_demo ||
    vehicle.registration_verification_status !== "verified" ||
    !vehicle.registration_document_path ||
    !vehicle.registration_verified_at ||
    !vehicle.registration_verified_by
  ) return null;

  const heightCm = Number(vehicle.height_cm);
  const widthCm = Number(vehicle.width_cm);
  const lengthCm = Number(vehicle.length_cm);
  const grossWeightKg = Number(vehicle.gross_weight_kg);
  const axleCount = Number(vehicle.axle_count);
  const trailerCount = vehicle.trailer_count == null ? 0 : Number(vehicle.trailer_count);
  // Registration limits are not the same as the actual load on the heaviest axle.
  const registeredMaxWeightPerAxleKg = vehicle.weight_per_axle_kg == null
    ? null : Number(vehicle.weight_per_axle_kg);
  const vehicleType = vehicle.routing_vehicle_type;

  if (
    !inRange(heightCm, 100, 600) ||
    !inRange(widthCm, 100, 350) ||
    !inRange(lengthCm, 200, 3000) ||
    !inRange(grossWeightKg, 1000, 100000) ||
    !inRange(Number(vehicle.empty_weight_kg), 500, grossWeightKg) ||
    !Number.isInteger(axleCount) || axleCount < 2 || axleCount > 12 ||
    !Number.isInteger(trailerCount) || trailerCount < 0 || trailerCount > 3 ||
    !["StraightTruck", "Tractor"].includes(vehicleType) ||
    (registeredMaxWeightPerAxleKg !== null &&
      (!inRange(registeredMaxWeightPerAxleKg, 500, 30000) ||
       registeredMaxWeightPerAxleKg > grossWeightKg))
  ) return null;

  return {
    heightCm,
    widthCm,
    lengthCm,
    grossWeightKg,
    emptyWeightKg: Number(vehicle.empty_weight_kg),
    axleCount,
    trailerCount,
    registeredMaxWeightPerAxleKg,
    vehicleType
  };
}
