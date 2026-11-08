const finite = value => typeof value === "number" && Number.isFinite(value);

export function buildHereTruckVehicleParams(profile, currentWeightKg) {
  if (!profile ||
      !finite(profile.heightCm) || profile.heightCm < 100 || profile.heightCm > 600 ||
      !finite(profile.widthCm) || profile.widthCm < 100 || profile.widthCm > 350 ||
      !finite(profile.lengthCm) || profile.lengthCm < 200 || profile.lengthCm > 3000 ||
      !finite(profile.grossWeightKg) || profile.grossWeightKg < 1000 || profile.grossWeightKg > 100000 ||
      !finite(currentWeightKg) || currentWeightKg < 1000 || currentWeightKg > profile.grossWeightKg ||
      !Number.isInteger(profile.axleCount) || profile.axleCount < 2 || profile.axleCount > 12 ||
      !Number.isInteger(profile.trailerCount) || profile.trailerCount < 0 || profile.trailerCount > 3 ||
      !["StraightTruck", "Tractor"].includes(profile.vehicleType) ||
      (!finite(profile.weightPerAxleKg) || profile.weightPerAxleKg < 500 || profile.weightPerAxleKg > 30000)) {
    throw new Error("Invalid saved truck profile for HERE routing");
  }

  const params = {
    "vehicle[height]": `${Math.round(profile.heightCm)}cm`,
    "vehicle[width]": `${Math.round(profile.widthCm)}cm`,
    "vehicle[length]": `${Math.round(profile.lengthCm)}cm`,
    "vehicle[grossWeight]": `${Math.round(profile.grossWeightKg)}kg`,
    "vehicle[currentWeight]": `${Math.round(currentWeightKg)}kg`,
    "vehicle[type]": profile.vehicleType,
    "vehicle[axleCount]": String(profile.axleCount),
    "vehicle[trailerCount]": String(profile.trailerCount)
  };
  params["vehicle[weightPerAxle]"] = `${Math.round(profile.weightPerAxleKg)}kg`;
  return params;
}
