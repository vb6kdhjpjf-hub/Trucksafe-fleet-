const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNonNegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Preliminary PTV response safety assessment.
 * PTV documents route-level and leg-level violated flags and violation events.
 * Geometry is validated separately by ptv-route-adapter.mjs after this provider
 * flag/event gate passes. This helper alone can never authorize a route.
 */
export function assessPTVRouteSafety(payload) {
  if (!isRecord(payload)) return { valid: false, safe: false, reason: "malformed_response" };

  if (!isFiniteNonNegative(payload.distance) ||
      !isFiniteNonNegative(payload.travelTime) ||
      typeof payload.violated !== "boolean") {
    return { valid: false, safe: false, reason: "missing_or_invalid_route_summary" };
  }

  if (payload.violated) {
    return { valid: true, safe: false, reason: "provider_route_violated" };
  }

  if (!Array.isArray(payload.legs) || payload.legs.length === 0) {
    return { valid: false, safe: false, reason: "missing_legs" };
  }

  for (const leg of payload.legs) {
    if (!isRecord(leg) || typeof leg.violated !== "boolean") {
      return { valid: false, safe: false, reason: "malformed_leg" };
    }
    if (leg.violated) {
      return { valid: true, safe: false, reason: "provider_leg_violated" };
    }
  }

  if (!Array.isArray(payload.events)) {
    return { valid: false, safe: false, reason: "missing_events" };
  }

  const violationEvents = payload.events.filter(event =>
    isRecord(event) && (
      isRecord(event.violation) ||
      isRecord(event.violationEvent) ||
      isRecord(event.violationDetails) ||
      (typeof event.violationType === "string" && event.violationType.length > 0) ||
      String(event.type || "").toUpperCase().includes("VIOLATION")
    )
  );

  if (violationEvents.length > 0) {
    return {
      valid: true,
      safe: false,
      reason: "provider_violation_events",
      violationCount: violationEvents.length
    };
  }

  if (payload.events.some(event => !isRecord(event))) {
    return { valid: false, safe: false, reason: "malformed_event" };
  }

  return {
    valid: true,
    safe: false,
    providerFlagsClear: true,
    reason: "geometry_not_validated",
    distanceMeters: payload.distance,
    durationSeconds: payload.travelTime,
    eventCount: payload.events.length
  };
}
