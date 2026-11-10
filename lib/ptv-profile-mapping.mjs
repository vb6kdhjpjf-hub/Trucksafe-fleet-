const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isPositiveNumber = value => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Pick a region-specific PTV truck profile by permitted gross weight.
 * PTV actual vehicle weight is represented by emptyWeight + loadWeight;
 * it must never be confused with the legal totalPermittedWeight.
 * This helper does not activate routing.
 */
export function mapVehicleToPTVProfile(profiles, vehicle, region = "IMEA") {
  if (!Array.isArray(profiles) || !isRecord(vehicle) || typeof region !== "string" || !region.trim()) {
    return { ok: false, reason: "invalid_input" };
  }

  const required = ["heightCm", "widthCm", "lengthCm", "grossWeightKg", "currentWeightKg", "emptyWeightKg", "axleCount"];
  if (required.some(key => !isPositiveNumber(vehicle[key])) ||
      !Number.isInteger(vehicle.axleCount) ||
      vehicle.currentWeightKg > vehicle.grossWeightKg ||
      vehicle.emptyWeightKg > vehicle.currentWeightKg ||
      (vehicle.trailerCount !== undefined &&
        (!Number.isInteger(vehicle.trailerCount) || vehicle.trailerCount < 0)) ||
      (vehicle.weightPerAxleKg !== undefined && vehicle.weightPerAxleKg !== null &&
        !isPositiveNumber(vehicle.weightPerAxleKg))) {
    return { ok: false, reason: "vehicle_profile_incomplete_or_inconsistent" };
  }

  const candidates = profiles
    .filter(profile =>
      isRecord(profile) &&
      typeof profile.name === "string" &&
      typeof profile.region === "string" &&
      profile.region.toLowerCase() === region.trim().toLowerCase() &&
      /truck|lorry|trailer|semitrailer/i.test(profile.name) &&
      isRecord(profile.vehicle) &&
      isPositiveNumber(profile.vehicle.totalPermittedWeight) &&
      profile.vehicle.totalPermittedWeight >= vehicle.grossWeightKg
    )
    .sort((a, b) => a.vehicle.totalPermittedWeight - b.vehicle.totalPermittedWeight);

  if (!candidates.length) return { ok: false, reason: "no_suitable_regional_profile" };

  const selected = candidates[0];
  return {
    ok: true,
    profileName: selected.name,
    region: selected.region,
    profilePermittedWeightKg: selected.vehicle.totalPermittedWeight,
    vehicleOverrides: {
      height: vehicle.heightCm,
      width: vehicle.widthCm,
      length: vehicle.lengthCm,
      emptyWeight: vehicle.emptyWeightKg,
      loadWeight: vehicle.currentWeightKg - vehicle.emptyWeightKg,
      totalPermittedWeight: vehicle.grossWeightKg,
      numberOfAxles: vehicle.axleCount,
      ...(vehicle.trailerCount !== undefined ? { numberOfTrailers: vehicle.trailerCount } : {}),
      ...(isPositiveNumber(vehicle.weightPerAxleKg) ? { axleWeight: vehicle.weightPerAxleKg } : {})
    },
    requiresManualVehicleVerification: true
  };
}
