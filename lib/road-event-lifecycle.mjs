const EVENT_TYPES = new Set([
  "crash",
  "road_hazard",
  "weather_hazard",
  "roadworks",
  "lane_closure",
  "road_closure",
  "temporary_truck_restriction",
  "traffic_control"
]);
const STATES = new Set(["reported", "corroborating", "verified", "expired", "rejected", "withdrawn"]);
const VERIFICATION_STATES = new Set(["unverified", "corroborated", "authoritative", "rejected"]);
const SOURCE_CLASSES = new Set(["official_authority", "licensed_provider", "fleet_dispatcher", "driver_report"]);
const VERIFIED_TRANSITIONS = new Set(["official_authority", "licensed_provider"]);

const TRANSITIONS = Object.freeze({
  reported: new Set(["corroborating", "rejected", "withdrawn", "expired"]),
  corroborating: new Set(["verified", "rejected", "withdrawn", "expired"]),
  verified: new Set(["withdrawn", "expired"]),
  expired: new Set(),
  rejected: new Set(),
  withdrawn: new Set()
});

function parseTimestamp(value) {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) return null;
  return Date.parse(value);
}

function validGeometry(geometry) {
  const validCoordinate = point => point && Number.isFinite(point.latitude)
    && point.latitude >= 29 && point.latitude <= 34
    && Number.isFinite(point.longitude) && point.longitude >= 34 && point.longitude <= 36;

  if (!geometry || typeof geometry !== "object") return false;
  if (geometry.kind === "point") return validCoordinate(geometry);
  if (geometry.kind === "segment") {
    return validCoordinate(geometry.start) && validCoordinate(geometry.end)
      && (geometry.start.latitude !== geometry.end.latitude
        || geometry.start.longitude !== geometry.end.longitude);
  }
  return false;
}

export function validateRoadEventForPublication(event, now = Date.now()) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { valid: false, reason: "invalid_event" };
  if (!Number.isFinite(now)) return { valid: false, reason: "invalid_clock" };
  if (event.schema_version !== 1 || typeof event.event_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.event_id)) {
    return { valid: false, reason: "invalid_identity" };
  }
  if (!EVENT_TYPES.has(event.event_type) || !STATES.has(event.state)
    || !VERIFICATION_STATES.has(event.verification_state)
    || !SOURCE_CLASSES.has(event.source_class)) {
    return { valid: false, reason: "unsupported_classification" };
  }
  if (!validGeometry(event.geometry)) return { valid: false, reason: "invalid_geometry" };

  const observedAt = parseTimestamp(event.observed_at);
  const receivedAt = parseTimestamp(event.received_at);
  const expiresAt = parseTimestamp(event.expires_at);
  const lastConfirmedAt = event.last_confirmed_at == null ? null : parseTimestamp(event.last_confirmed_at);
  if (observedAt === null || receivedAt === null || expiresAt === null
    || (event.last_confirmed_at != null && lastConfirmedAt === null)) {
    return { valid: false, reason: "invalid_timestamps" };
  }
  if (observedAt > receivedAt + 5 * 60_000 || receivedAt > now + 30_000
    || expiresAt <= receivedAt || (lastConfirmedAt !== null && lastConfirmedAt > now + 30_000)) {
    return { valid: false, reason: "inconsistent_timestamps" };
  }
  if (expiresAt <= now) return { valid: false, reason: "expired" };
  if (!Number.isInteger(event.confidence) || event.confidence < 0 || event.confidence > 100
    || !["low", "moderate", "high", "critical"].includes(event.severity)
    || typeof event.driver_message !== "string" || event.driver_message.trim().length < 3
    || event.driver_message.length > 240) {
    return { valid: false, reason: "invalid_driver_payload" };
  }
  if (event.state !== "verified") return { valid: false, reason: "not_verified" };
  if (event.verification_state === "rejected" || event.verification_state === "unverified") {
    return { valid: false, reason: "verification_not_sufficient" };
  }
  if (event.verification_state === "authoritative" && !VERIFIED_TRANSITIONS.has(event.source_class)) {
    return { valid: false, reason: "authority_source_mismatch" };
  }
  if (event.verification_state === "corroborated"
    && (!Number.isInteger(event.independent_corroboration_count)
      || event.independent_corroboration_count < 2)) {
    return { valid: false, reason: "insufficient_independent_corroboration" };
  }
  return { valid: true, reason: "verified_current_event" };
}

export function transitionRoadEventState(event, nextState, now = Date.now()) {
  if (!event || typeof event !== "object" || Array.isArray(event) || !STATES.has(event.state)) {
    return { ok: false, reason: "invalid_current_state", event: null };
  }
  if (!Number.isFinite(now) || !STATES.has(nextState)) {
    return { ok: false, reason: "invalid_transition_request", event: null };
  }
  const expiresAt = parseTimestamp(event.expires_at);
  if (expiresAt === null) return { ok: false, reason: "invalid_expiry", event: null };
  if (expiresAt <= now && event.state !== "expired") {
    return { ok: true, event: { ...event, state: "expired" }, reason: "expiry_enforced" };
  }
  if (!TRANSITIONS[event.state].has(nextState)) {
    return { ok: false, reason: "transition_not_allowed", event: null };
  }
  if (nextState === "verified") {
    if (event.verification_state === "authoritative" && !VERIFIED_TRANSITIONS.has(event.source_class)) {
      return { ok: false, reason: "authority_source_mismatch", event: null };
    }
    if (event.verification_state === "corroborated"
      && (!Number.isInteger(event.independent_corroboration_count)
        || event.independent_corroboration_count < 2)) {
      return { ok: false, reason: "insufficient_independent_corroboration", event: null };
    }
    if (!["authoritative", "corroborated"].includes(event.verification_state)) {
      return { ok: false, reason: "verification_not_sufficient", event: null };
    }
  }
  return { ok: true, event: { ...event, state: nextState }, reason: "transition_allowed" };
}
