const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const EARTH_RADIUS_M = 6371008.8;

function decodeUnsignedVarint(encoded, state) {
  let result = 0;
  let shift = 0;
  while (state.index < encoded.length) {
    const char = encoded[state.index++];
    const value = BASE64_URL.indexOf(char);
    if (value < 0) throw new Error("Invalid flexible polyline character");
    result |= (value & 0x1f) << shift;
    if ((value & 0x20) === 0) return result >>> 0;
    shift += 5;
    if (shift > 30) throw new Error("Flexible polyline varint is too large");
  }
  throw new Error("Truncated flexible polyline");
}

function decodeSigned(value) {
  return value & 1 ? ~(value >>> 1) : value >>> 1;
}

export function decodeFlexiblePolyline(encoded) {
  if (typeof encoded !== "string" || encoded.length < 4) throw new Error("Missing route polyline");
  const state = { index: 0 };
  const version = decodeUnsignedVarint(encoded, state);
  if (version !== 1) throw new Error("Unsupported flexible polyline version");
  const precision = decodeUnsignedVarint(encoded, state);
  const thirdDim = decodeUnsignedVarint(encoded, state);
  const thirdDimPrecision = thirdDim === 0 ? 0 : decodeUnsignedVarint(encoded, state);
  if (precision > 15 || thirdDimPrecision > 15) throw new Error("Invalid flexible polyline precision");

  const factor = 10 ** precision;
  const thirdFactor = 10 ** thirdDimPrecision;
  let lat = 0;
  let lng = 0;
  let z = 0;
  const coordinates = [];

  while (state.index < encoded.length) {
    lat += decodeSigned(decodeUnsignedVarint(encoded, state));
    lng += decodeSigned(decodeUnsignedVarint(encoded, state));
    const coordinate = [lat / factor, lng / factor];
    if (thirdDim !== 0) {
      z += decodeSigned(decodeUnsignedVarint(encoded, state));
      coordinate.push(z / thirdFactor);
    }
    if (coordinate[0] < -90 || coordinate[0] > 90 || coordinate[1] < -180 || coordinate[1] > 180) {
      throw new Error("Flexible polyline coordinate out of range");
    }
    coordinates.push(coordinate);
  }
  return coordinates;
}

function distanceToSegmentMeters(point, start, end) {
  const lat0 = point[0] * Math.PI / 180;
  const scaleX = Math.cos(lat0) * EARTH_RADIUS_M;
  const scaleY = EARTH_RADIUS_M;
  const project = ([lat, lng]) => [lng * Math.PI / 180 * scaleX, lat * Math.PI / 180 * scaleY];
  const p = project(point);
  const a = project(start);
  const b = project(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t*dx), p[1] - (a[1] + t*dy));
}

export function routePassesNearRestriction(sections, restriction) {
  const lat = Number(restriction?.latitude);
  const lng = Number(restriction?.longitude);
  const radius = Number(restriction?.radius_m ?? 75);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius < 10 || radius > 1000) {
    return null;
  }
  const point = [lat, lng];
  for (const section of sections || []) {
    let coordinates;
    try {
      coordinates = decodeFlexiblePolyline(section?.polyline);
    } catch {
      return null;
    }
    if (coordinates.length === 1 && distanceToSegmentMeters(point, coordinates[0], coordinates[0]) <= radius) return true;
    for (let i = 1; i < coordinates.length; i++) {
      if (distanceToSegmentMeters(point, coordinates[i - 1], coordinates[i]) <= radius) return true;
    }
  }
  return false;
}

function isActiveAt(restriction, now) {
  const date = now.toISOString().slice(0, 10);
  if (restriction.active_from && date < restriction.active_from) return false;
  if (restriction.active_until && date > restriction.active_until) return false;
  const from = restriction.valid_from;
  const until = restriction.valid_until;
  if (!from || !until) return true;
  const clock = now.toISOString().slice(11, 19);
  return from <= until ? clock >= from && clock <= until : clock >= from || clock <= until;
}

export function evaluateFleetRestrictions({ sections, restrictions, vehicle, currentWeightKg, now = new Date() }) {
  const conflicts = [];
  const unresolved = [];
  for (const restriction of restrictions || []) {
    if (!restriction.is_active || !isActiveAt(restriction, now)) continue;
    const near = routePassesNearRestriction(sections, restriction);
    if (near === null) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_or_invalid_location_or_route_geometry" });
      continue;
    }
    if (!near) continue;
    if (restriction.verification_status !== "verified" || !restriction.source_url) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "restriction_not_verified" });
      continue;
    }

    const type = restriction.restriction_type;
    const limit = (value) => Number(value);
    let conflict = false;
    if (type === "closed") conflict = true;
    else if (type === "height" && restriction.max_height_m != null) conflict = vehicle.heightCm / 100 > limit(restriction.max_height_m);
    else if (type === "weight" && restriction.max_weight_t != null) conflict = currentWeightKg / 1000 > limit(restriction.max_weight_t);
    else if (type === "width" && restriction.max_width_m != null) conflict = vehicle.widthCm / 100 > limit(restriction.max_width_m);
    else if (type === "length" && restriction.max_length_m != null) conflict = vehicle.lengthCm / 100 > limit(restriction.max_length_m);
    else if (type === "time_window") conflict = true;
    else if (type === "hazmat" || type === "other" || !["height","weight","width","length","closed","time_window"].includes(type)) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "restriction_type_requires_manual_review" });
      continue;
    }
    if (conflict) conflicts.push({ id: restriction.id, roadName: restriction.road_name, restrictionType: type, sourceUrl: restriction.source_url });
  }
  return { conflicts, unresolved, validated: conflicts.length === 0 && unresolved.length === 0 };
}
