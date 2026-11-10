const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isPositiveNumber = value => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Pick a region-specific PTV truck profile by permitted gross weight.
 * Physical dimensions and axle data are returned as explicit overrides:
 * PTV recommends overriding predefined profile values when they do not
 * describe the actual vehicle. This helper does not activate routing.
 */
export function mapVehicleToPTVProfile(profiles, vehicle, region = "IMEA") {
  if (!Array.isArray(profiles) || !isRecord(vehicle) || typeof region !== "string" || !region.trim()) {
    return { ok: false, reason: "invalid_input" };
  }

  const required = ["heightCm", "widthCm", "lengthCm", "grossWeightKg", "axleCount"];
  if (required.some(key => !isPositiveNumber(vehicle[key])) ||
      !Number.isInteger(vehicle.axleCount) ||
      (vehicle.trailerCount !== undefined &&
        (!Number.isInteger(vehicle.trailerCount) || vehicle.trailerCount < 0))) {
    return { ok: false, reason: "vehicle_profile_incomplete" };
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
      totalPermittedWeight: vehicle.grossWeightKg,
      totalTechnicallyPermittedWeight: vehicle.grossWeightKg,
      numberOfAxles: vehicle.axleCount,
      ...(isPositiveNumber(vehicle.weightPerAxleKg) ? { axleWeight: vehicle.weightPerAxleKg } : {})
    },
    requiresManualVehicleVerification: true
  };
}
