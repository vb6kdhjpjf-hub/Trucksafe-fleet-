const isFiniteNonNegative = value =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const TEST_WAYPOINTS = Object.freeze([
  "32.0853,34.7818",
  "31.7683,35.2137"
]);

/**
 * Builds a fixed, non-user-specific connectivity probe.
 * It intentionally sends no vehicle profile and never returns route geometry.
 */
export function buildPTVRoutingProbeRequest(apiKey) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("missing_ptv_api_key");
  }
  const url = new URL("https://api.myptv.com/routing/v1/routes");
  for (const waypoint of TEST_WAYPOINTS) url.searchParams.append("waypoints", waypoint);
  return {
    url: url.toString(),
    headers: { ApiKey: apiKey.trim(), Accept: "application/json" },
    method: "GET"
  };
}

/** Accept only the documented minimal Routing API response fields. */
export function assessPTVRoutingProbeResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !isFiniteNonNegative(payload.distance) ||
      !isFiniteNonNegative(payload.travelTime) ||
      typeof payload.violated !== "boolean") {
    return { valid: false, reason: "ptv_routing_response_invalid" };
  }
  return {
    valid: true,
    routeFound: payload.violated === false,
    providerReportedViolation: payload.violated,
    distanceMeters: payload.distance,
    durationSeconds: payload.travelTime
  };
}
