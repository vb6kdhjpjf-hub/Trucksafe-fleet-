import { assessPTVRouteSafety } from "./ptv-route-safety.mjs";

const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const PRECISION = 5;
const SCALE = 10 ** PRECISION;
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

function encodeUnsigned(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid polyline delta");
  let output = "";
  while (value >= 0x20) {
    output += BASE64_URL[(0x20 | (value & 0x1f))];
    value = Math.floor(value / 32);
  }
  return output + BASE64_URL[value];
}

function encodeSigned(value) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid polyline coordinate delta");
  return encodeUnsigned(value < 0 ? (~(value * 2)) >>> 0 : value * 2);
}

export function encodeFlexiblePolyline(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 100000) {
    throw new Error("Invalid route coordinate count");
  }
  let previousLat = 0;
  let previousLng = 0;
  let output = encodeUnsigned(1) + encodeUnsigned(PRECISION);
  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error("Invalid GeoJSON coordinate");
    const [lng, lat] = coordinate;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < 29 || lat > 34 ||
        typeof lng !== "number" || !Number.isFinite(lng) || lng < 34 || lng > 36) {
      throw new Error("PTV route geometry is outside the supported Israel bounds");
    }
    const scaledLat = Math.round(lat * SCALE);
    const scaledLng = Math.round(lng * SCALE);
    output += encodeSigned(scaledLat - previousLat);
    output += encodeSigned(scaledLng - previousLng);
    previousLat = scaledLat;
    previousLng = scaledLng;
  }
  return output;
}

function extractSingleLineString(geoJson) {
  let parsed = geoJson;
  if (typeof geoJson === "string") {
    if (geoJson.length > 8_000_000) throw new Error("PTV route geometry is too large");
    parsed = JSON.parse(geoJson);
  }
  if (!isRecord(parsed)) throw new Error("Missing PTV GeoJSON object");
  if (parsed.type === "Feature") {
    if (!isRecord(parsed.geometry)) throw new Error("Missing PTV GeoJSON feature geometry");
    parsed = parsed.geometry;
  } else if (parsed.type === "FeatureCollection") {
    if (!Array.isArray(parsed.features) || parsed.features.length !== 1 ||
        !isRecord(parsed.features[0]?.geometry)) {
      throw new Error("PTV route must contain exactly one GeoJSON feature");
    }
    parsed = parsed.features[0].geometry;
  }
  if (parsed.type !== "LineString") {
    throw new Error("PTV route geometry must be a GeoJSON LineString");
  }
  return parsed.coordinates;
}

/**
 * Converts the documented PTV VECTOR GeoJSON polyline into TruckSafe's
 * existing flexible-polyline section shape. Provider violation flags/events
 * are checked first; malformed or unsupported geometry always fails closed.
 */
export function normalizePTVRouteResponse(payload) {
  const safety = assessPTVRouteSafety(payload);
  if (!safety.valid || safety.safe || safety.reason !== "geometry_not_validated") {
    return { safe: false, reason: safety.reason || "provider_route_not_safe" };
  }

  try {
    const coordinates = extractSingleLineString(payload.polyline);
    const polyline = encodeFlexiblePolyline(coordinates);
    return {
      safe: true,
      route: {
        sections: [{
          polyline,
          summary: { length: payload.distance, duration: payload.travelTime },
          actions: [],
          notices: []
        }],
        notices: []
      },
      distanceMeters: payload.distance,
      durationSeconds: payload.travelTime
    };
  } catch {
    return { safe: false, reason: "invalid_or_unsupported_route_geometry" };
  }
}
