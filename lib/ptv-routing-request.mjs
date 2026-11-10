const isCoordinate = value =>
  value && typeof value === "object" &&
  typeof value.lat === "number" && Number.isFinite(value.lat) && value.lat >= 29 && value.lat <= 34 &&
  typeof value.lng === "number" && Number.isFinite(value.lng) && value.lng >= 34 && value.lng <= 36;

const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;

const REQUIRED_RESULTS = Object.freeze([
  "POLYLINE",
  "LEGS_POLYLINE",
  "MANEUVER_EVENTS",
  "VIOLATION_EVENTS",
  "VIOLATION_EVENTS_POLYLINE"
]);

const VEHICLE_PARAMETER_RULES = Object.freeze({
  height: value => Number.isFinite(value) && value >= 100 && value <= 600,
  width: value => Number.isFinite(value) && value >= 100 && value <= 350,
  length: value => Number.isFinite(value) && value >= 200 && value <= 3000,
  emptyWeight: value => Number.isFinite(value) && value >= 0 && value <= 100000,
  loadWeight: value => Number.isFinite(value) && value >= 0 && value <= 100000,
  totalPermittedWeight: value => Number.isFinite(value) && value >= 1000 && value <= 100000,
  totalTechnicallyPermittedWeight: value => Number.isFinite(value) && value >= 1000 && value <= 100000,
  numberOfAxles: value => Number.isInteger(value) && value >= 2 && value <= 12,
  numberOfTrailers: value => Number.isInteger(value) && value >= 0 && value <= 3,
  axleWeight: value => Number.isFinite(value) && value >= 500 && value <= 30000
});

/**
 * Build a PTV Routing API request without making a network call.
 * The supplied vehicle object must come from the validated TruckSafe profile
 * mapper. Every provided value is validated and serialized using PTV's
 * documented vehicle[attribute] query notation.
 */
export function buildPTVRoutingRequest({ origin, destination, profile, apiKey, vehicle }) {
  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    throw new Error("PTV routing requires validated Israeli coordinates");
  }
  if (!isNonEmptyString(profile) || profile.trim().length > 50) {
    throw new Error("An explicit supported PTV vehicle profile is required");
  }
  if (!isNonEmptyString(apiKey)) throw new Error("Missing PTV API key");
  if (!vehicle || typeof vehicle !== "object" || Array.isArray(vehicle)) {
    throw new Error("A validated PTV vehicle parameter object is required");
  }

  const vehicleEntries = Object.entries(vehicle);
  if (!vehicleEntries.length) throw new Error("PTV vehicle parameters are required");
  for (const [key, value] of vehicleEntries) {
    const validate = VEHICLE_PARAMETER_RULES[key];
    if (!validate || !validate(value)) throw new Error("Invalid PTV vehicle parameter: " + key);
  }

  const actualWeight = vehicle.emptyWeight + vehicle.loadWeight;
  if (actualWeight > vehicle.totalPermittedWeight ||
      vehicle.totalPermittedWeight > (vehicle.totalTechnicallyPermittedWeight ?? vehicle.totalPermittedWeight)) {
    throw new Error("PTV vehicle weight parameters are inconsistent");
  }

  const url = new URL("https://api.myptv.com/routing/v1/routes");
  url.searchParams.append("waypoints", `${origin.lat},${origin.lng}`);
  url.searchParams.append("waypoints", `${destination.lat},${destination.lng}`);
  url.searchParams.set("profile", profile.trim());
  url.searchParams.set("results", REQUIRED_RESULTS.join(","));
  url.searchParams.set("options[trafficMode]", "AVERAGE");
  url.searchParams.set("options[polylineMapType]", "VECTOR");

  for (const [key, value] of vehicleEntries) {
    url.searchParams.set(`vehicle[${key}]`, String(value));
  }

  return {
    url: url.toString(),
    headers: { ApiKey: apiKey.trim(), Accept: "application/json" }
  };
}

export function getPTVRequiredRouteResults() {
  return [...REQUIRED_RESULTS];
}
