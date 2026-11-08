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
  const header = decodeUnsignedVarint(encoded, state);
  const precision = header & 0x0f;
  const thirdDim = (header >> 4) & 0x07;
  const thirdDimPrecision = (header >> 7) & 0x0f;
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
  if (restriction?.latitude == null || restriction?.longitude == null) return null;
  const lat = Number(restriction.latitude);
  const lng = Number(restriction.longitude);
  const radius = Number(restriction?.radius_m ?? 75);
  if (!Number.isFinite(lat) || lat < 29 || lat > 34 ||
      !Number.isFinite(lng) || lng < 34 || lng > 36 ||
      !Number.isFinite(radius) || radius < 10 || radius > 1000) {
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
    if (coordinates.length < 2) return null;
    for (let i = 1; i < coordinates.length; i++) {
      if (distanceToSegmentMeters(point, coordinates[i - 1], coordinates[i]) <= radius) return true;
    }
  }
  return false;
}

function isActiveAt(restriction, now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const value = (type) => parts.find(part => part.type === type)?.value || "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const clock = `${value("hour")}:${value("minute")}:${value("second")}`;
  if (restriction.active_from && date < restriction.active_from) return false;
  if (restriction.active_until && date > restriction.active_until) return false;
  const from = restriction.valid_from;
  const until = restriction.valid_until;
  if (!from || !until) return true;
  return from <= until ? clock >= from && clock <= until : clock >= from || clock <= until;
}

function localIsraelDateAndSecondOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const value = (type) => parts.find(part => part.type === type)?.value || "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  const second = Number(value("second"));
  if (!year || !month || !day || ![hour, minute, second].every(Number.isInteger)) return null;
  return {
    date: `${year}-${month}-${day}`,
    secondOfDay: hour * 3600 + minute * 60 + second
  };
}

function parseClockSeconds(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}

function isActiveDuringMinute(restriction, instant) {
  const local = localIsraelDateAndSecondOfDay(instant);
  if (!local) return null;
  if (restriction.active_from && local.date < restriction.active_from) return false;
  if (restriction.active_until && local.date > restriction.active_until) return false;

  const from = restriction.valid_from;
  const until = restriction.valid_until;
  if (!from || !until) return true;
  const start = parseClockSeconds(from);
  const end = parseClockSeconds(until);
  if (start === null || end === null) return null;

  // Check overlap with the entire local minute, not only its sampled instant.
  // This catches restrictions lasting only a few seconds between minute samples.
  const minuteStart = Math.floor(local.secondOfDay / 60) * 60;
  const minuteEnd = minuteStart + 60;
  const intervals = start <= end
    ? [[start, end + 1]]
    : [[start, 24 * 60 * 60], [0, end + 1]];
  return intervals.some(([windowStart, windowEnd]) =>
    minuteStart < windowEnd && windowStart < minuteEnd
  );
}

function isActiveDuringRoute(restriction, departure, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 48 * 60 * 60) return null;
  const steps = Math.max(1, Math.ceil(durationSeconds / 60));
  for (let minute = 0; minute <= steps; minute++) {
    const arrival = new Date(departure.getTime() + Math.min(minute * 60, durationSeconds) * 1000);
    const active = isActiveDuringMinute(restriction, arrival);
    if (active === null) return null;
    if (active) return true;
  }
  return false;
}

export function evaluateFleetRestrictions({ sections, restrictions, vehicle, currentWeightKg, now = new Date() }) {
  const conflicts = [];
  const unresolved = [];
  const routeDurationValues = (sections || []).map(section => Number(section?.summary?.duration));
  const routeDurationSeconds = routeDurationValues.length > 0 && routeDurationValues.every(value => Number.isFinite(value) && value >= 0)
    ? routeDurationValues.reduce((sum, value) => sum + value, 0)
    : null;
  for (const restriction of restrictions || []) {
    if (!restriction.is_active) continue;
    const near = routePassesNearRestriction(sections, restriction);
    if (near === null) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_or_invalid_location_or_route_geometry" });
      continue;
    }
    if (!near) continue;
    if (restriction.verification_status !== "verified" || !/^https:\/\//i.test(String(restriction.source_url || "")) || !restriction.verified_at || !restriction.verified_by || !restriction.source_last_checked_at || !restriction.verification_note) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "restriction_not_verified" });
      continue;
    }

    const hasSchedule = Boolean(restriction.active_from || restriction.active_until || restriction.valid_from || restriction.valid_until);
    const activeDuringRoute = hasSchedule
      ? isActiveDuringRoute(restriction, now, routeDurationSeconds)
      : isActiveAt(restriction, now);
    if (activeDuringRoute === null) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "schedule_or_route_duration_cannot_be_evaluated_safely" });
      continue;
    }
    if (!activeDuringRoute) continue;

    const type = restriction.restriction_type;
    const limit = (value) => Number(value);
    let conflict = false;
    if (type === "closed") conflict = true;
    else if (type === "height") {
      if (restriction.max_height_m == null) { unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_height_limit" }); continue; }
      conflict = vehicle.heightCm / 100 > limit(restriction.max_height_m);
    } else if (type === "weight") {
      if (restriction.max_weight_t == null) { unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_weight_limit" }); continue; }
      conflict = currentWeightKg / 1000 > limit(restriction.max_weight_t);
    } else if (type === "width") {
      if (restriction.max_width_m == null) { unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_width_limit" }); continue; }
      conflict = vehicle.widthCm / 100 > limit(restriction.max_width_m);
    } else if (type === "length") {
      if (restriction.max_length_m == null) { unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "missing_length_limit" }); continue; }
      conflict = vehicle.lengthCm / 100 > limit(restriction.max_length_m);
    } else if (type === "time_window") {
      if (!restriction.valid_from || !restriction.valid_until) { unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "incomplete_time_window" }); continue; }
      conflict = true;
    } else if (type === "hazmat" || type === "other" || !["height","weight","width","length","closed","time_window"].includes(type)) {
      unresolved.push({ id: restriction.id, roadName: restriction.road_name, reason: "restriction_type_requires_manual_review" });
      continue;
    }
    if (conflict) conflicts.push({ id: restriction.id, roadName: restriction.road_name, restrictionType: type, sourceUrl: restriction.source_url });
  }
  return { conflicts, unresolved, validated: conflicts.length === 0 && unresolved.length === 0 };
}


export function hasBlockingHereNotice(notice) {
  if (!notice || typeof notice !== "object") return false;
  const severity = String(notice.severity || "").trim().toLowerCase();
  const code = String(notice.code || "").trim();
  return severity === "critical" || /^violated[A-Z]/.test(code);
}
