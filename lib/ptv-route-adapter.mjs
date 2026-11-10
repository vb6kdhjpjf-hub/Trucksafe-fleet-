import { assessPTVRouteSafety } from "./ptv-route-safety.mjs";

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const isIsraelCoordinate = ([lat, lng]) =>
  isFiniteNumber(lat) && lat >= 29 && lat <= 34 &&
  isFiniteNumber(lng) && lng >= 34 && lng <= 36;
const FLEXIBLE_POLYLINE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeUnsignedVarint(value) {
  let remaining = value;
  let output = "";
  while (remaining > 0x1f) {
    output += FLEXIBLE_POLYLINE_ALPHABET[(remaining & 0x1f) | 0x20];
    remaining = Math.floor(remaining / 32);
  }
  return output + FLEXIBLE_POLYLINE_ALPHABET[remaining];
}

function encodeSignedVarint(value) {
  const encoded = value < 0 ? ~(value << 1) : (value << 1);
  return encodeUnsignedVarint(encoded >>> 0);
}

/** Convert validated [latitude, longitude] coordinates to TruckSafe's flexible polyline format. */
export function encodePTVCoordinatesAsFlexiblePolyline(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 100000) {
    throw new Error("invalid_route_coordinate_count");
  }

  const precision = 5;
  const factor = 10 ** precision;
  let previousLat = 0;
  let previousLng = 0;
  let encoded = encodeUnsignedVarint(1) + encodeUnsignedVarint(precision);

  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length !== 2 || !isIsraelCoordinate(coordinate)) {
      throw new Error("route_coordinate_outside_israel_or_invalid");
    }
    const lat = Math.round(coordinate[0] * factor);
    const lng = Math.round(coordinate[1] * factor);
    encoded += encodeSignedVarint(lat - previousLat);
    encoded += encodeSignedVarint(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return encoded;
}

function parsePTVGeoJsonPolyline(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000_000) {
    throw new Error("missing_or_oversized_ptv_polyline");
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("invalid_ptv_geojson");
  }

  const geometry = parsed?.type === "Feature" ? parsed.geometry : parsed;
  if (!isRecord(geometry) || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    throw new Error("unsupported_ptv_geojson_geometry");
  }
  if (geometry.coordinates.length < 2 || geometry.coordinates.length > 100000) {
    throw new Error("invalid_ptv_geojson_coordinate_count");
  }

  const coordinates = geometry.coordinates.map(pair => {
    if (!Array.isArray(pair) || pair.length < 2) throw new Error("invalid_ptv_geojson_coordinate");
    const [longitude, latitude] = pair;
    return [latitude, longitude];
  });
  return encodePTVCoordinatesAsFlexiblePolyline(coordinates);
}

const BLOCKING_WARNING_CODES = new Set([
  "ROUTING_PARAMETER_IGNORED",
  "ROUTING_PARAMETER_INCONSISTENCY",
  "ROUTING_MISSING_VEHICLE_PARAMETER",
  "ROUTING_COUNTRY_IGNORED",
  "ROUTING_SUBDIVISION_FALLBACK",
  "ROUTING_WAYPOINT_MATCH_DISTANCE",
  "ROUTING_WAYPOINTS_DONT_MATCH_PROFILE_REGION",
  "ROUTING_INACTIVE_ROADATTRIBUTE_SCENARIOS",
  "ROUTING_ROADATTRIBUTES_MAYBE_IGNORED",
  "ROUTING_PARAMETER_VALUE_DEPRECATED"
]);

function validatePTVWarnings(warnings) {
  if (warnings === undefined) return { ok: true, notices: [] };
  if (!Array.isArray(warnings)) return { ok: false, reason: "malformed_provider_warnings" };

  const notices = [];
  for (const warning of warnings) {
    if (!isRecord(warning) || typeof warning.warningCode !== "string" ||
        typeof warning.description !== "string") {
      return { ok: false, reason: "malformed_provider_warning" };
    }
    notices.push({
      code: warning.warningCode.slice(0, 100),
      severity: "warning",
      title: warning.description.slice(0, 240)
    });
    if (warning.warningCode !== "ROUTING_MANEUVERS_IN_DIFFERENT_LANGUAGE" ||
        BLOCKING_WARNING_CODES.has(warning.warningCode)) {
      return { ok: false, reason: "provider_warning_requires_review", notices };
    }
  }
  return { ok: true, notices };
}

/**
 * Normalize a PTV Routing API response into the route shape consumed by
 * TruckSafe's existing geometry and independent fleet-restriction validators.
 * This is a pure function: it never calls PTV or reads credentials.
 */
export function normalizePTVRouteResponse(payload) {
  const assessment = assessPTVRouteSafety(payload);
  if (!assessment.valid || !assessment.providerFlagsClear) {
    return { safe: false, reason: assessment.reason || "provider_route_not_safe" };
  }

  const warningCheck = validatePTVWarnings(payload.warnings);
  if (!warningCheck.ok) {
    return { safe: false, reason: warningCheck.reason, notices: warningCheck.notices || [] };
  }

  if (typeof payload.polyline !== "string") {
    return { safe: false, reason: "missing_route_polyline" };
  }

  let routePolyline;
  try {
    routePolyline = parsePTVGeoJsonPolyline(payload.polyline);
  } catch (error) {
    return { safe: false, reason: error.message };
  }

  const sections = [];
  for (const leg of payload.legs) {
    if (!isRecord(leg) || !isFiniteNumber(leg.distance) || leg.distance < 0 ||
        !isFiniteNumber(leg.travelTime) || leg.travelTime < 0 ||
        typeof leg.polyline !== "string") {
      return { safe: false, reason: "malformed_ptv_leg" };
    }
    let polyline;
    try {
      polyline = parsePTVGeoJsonPolyline(leg.polyline);
    } catch (error) {
      return { safe: false, reason: error.message };
    }
    sections.push({
      polyline,
      summary: { length: leg.distance, duration: leg.travelTime }
    });
  }

  const actions = [];
  for (const event of payload.events) {
    if (!isRecord(event) ||
        event.countryCode !== "IL" ||
        !isIsraelCoordinate([event.latitude, event.longitude])) {
      return { safe: false, reason: "malformed_event" };
    }
    if (event.maneuver === undefined) continue;
    if (!isRecord(event.maneuver) || typeof event.maneuver.description !== "string" ||
        !event.maneuver.description.trim()) {
      return { safe: false, reason: "malformed_ptv_maneuver" };
    }
    actions.push({
      instruction: event.maneuver.description.slice(0, 300),
      length: null,
      duration: null
    });
  }

  // Provider flags and geometry format are only preliminary checks. The route
  // must still pass TruckSafe's independent, current restriction-catalogue
  // validation before any caller may approve it for a driver.
  return {
    safe: false,
    providerFlagsClear: true,
    geometryFormatValidated: true,
    reason: "awaiting_independent_restriction_validation",
    route: { sections, notices: warningCheck.notices },
    actions,
    notices: warningCheck.notices,
    distanceMeters: payload.distance,
    durationSeconds: payload.travelTime,
    routePolyline
  };
}
