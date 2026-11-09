const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNonNegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * PTV's documented route-level and leg-level violated flags are authoritative
 * blockers. Violation events are retained as opaque provider records until
 * their full event schema and polyline format are confirmed from a live,
 * explicitly approved test response.
 *
 * This function deliberately does not translate PTV geometry into HERE's
 * flexible-polyline format.
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
    if (!isRecord(leg) || typeof leg.violated !== "boolean" ||
        !isFiniteNonNegative(leg.distance) || !isFiniteNonNegative(leg.travelTime)) {
      return { valid: false, safe: false, reason: "malformed_leg" };
    }
    if (leg.violated) {
      return { valid: true, safe: false, reason: "provider_leg_violated" };
    }
  }

  if (!Array.isArray(payload.events)) {
    return { valid: false, safe: false, reason: "missing_events" };
  }

  // Until the provider's exact event discriminator is verified, any event
  // with a violation-specific payload is treated as blocking. Unknown event
  // shapes are not silently discarded.
  const violationEvents = payload.events.filter(event =>
    isRecord(event) && (
      isRecord(event.violation) ||
      isRecord(event.violationEvent) ||
      isRecord(event.violationDetails) ||
      event.type === "VIOLATION" ||
      event.type === "ROUTE_VIOLATION"
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
    safe: true,
    reason: "provider_flags_clear",
    distanceMeters: payload.distance,
    durationSeconds: payload.travelTime,
    eventCount: payload.events.length
  };
}
