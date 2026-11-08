const inRange = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function getSavedTruckRoutingProfile(vehicle) {
  if (!vehicle || vehicle.is_demo) return null;

  const heightCm = Number(vehicle.height_cm);
  const widthCm = Number(vehicle.width_cm);
  const lengthCm = Number(vehicle.length_cm);
  const grossWeightKg = Number(vehicle.gross_weight_kg);
  const axleCount = Number(vehicle.axle_count);
  const trailerCount = vehicle.trailer_count == null ? 0 : Number(vehicle.trailer_count);
  const weightPerAxleKg = vehicle.weight_per_axle_kg == null ? null : Number(vehicle.weight_per_axle_kg);
  const vehicleType = vehicle.routing_vehicle_type;

  if (
    !inRange(heightCm, 100, 600) ||
    !inRange(widthCm, 100, 350) ||
    !inRange(lengthCm, 200, 3000) ||
    !inRange(grossWeightKg, 1000, 100000) ||
    !Number.isInteger(axleCount) || axleCount < 2 || axleCount > 12 ||
    !Number.isInteger(trailerCount) || trailerCount < 0 || trailerCount > 3 ||
    !["StraightTruck", "Tractor"].includes(vehicleType) ||
    (weightPerAxleKg !== null && !inRange(weightPerAxleKg, 500, 30000))
  ) return null;

  return {
    heightCm,
    widthCm,
    lengthCm,
    grossWeightKg,
    axleCount,
    trailerCount,
    weightPerAxleKg,
    vehicleType
  };
}
