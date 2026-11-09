const isCoordinate = value =>
  value && typeof value === "object" &&
  typeof value.lat === "number" && Number.isFinite(value.lat) && value.lat >= 29 && value.lat <= 34 &&
  typeof value.lng === "number" && Number.isFinite(value.lng) && value.lng >= 34 && value.lng <= 36;

const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;

const REQUIRED_RESULTS = Object.freeze([
  "POLYLINE",
  "LEGS_POLYLINE",
  "MANEUVER_EVENTS",
  "VIOLATION_EVENTS_POLYLINE"
]);

/**
 * Build a PTV Routing API request without making a network call.
 * A profile must be supplied explicitly; no regional/default truck profile is guessed.
 * Vehicle parameter serialization is intentionally not included until the exact
 * Israel-compatible profile and TruckSafe-to-PTV field mapping are verified.
 */
export function buildPTVRoutingRequest({ origin, destination, profile, apiKey }) {
  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    throw new Error("PTV routing requires validated Israeli coordinates");
  }
  if (!isNonEmptyString(profile) || profile.trim().length > 50) {
    throw new Error("An explicit supported PTV vehicle profile is required");
  }
  if (!isNonEmptyString(apiKey)) throw new Error("Missing PTV API key");

  const url = new URL("https://api.myptv.com/routing/v1/routes");
  url.searchParams.append("waypoints", `${origin.lat},${origin.lng}`);
  url.searchParams.append("waypoints", `${destination.lat},${destination.lng}`);
  url.searchParams.set("profile", profile.trim());
  url.searchParams.set("results", REQUIRED_RESULTS.join(","));
  url.searchParams.set("options[trafficMode]", "AVERAGE");

  return {
    url: url.toString(),
    headers: { ApiKey: apiKey.trim(), Accept: "application/json" }
  };
}

export function getPTVRequiredRouteResults() {
  return [...REQUIRED_RESULTS];
}
