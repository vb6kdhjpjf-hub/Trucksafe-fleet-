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

function projectLocal([lat, lng], referenceLatitude) {
  const latitudeScale = Math.PI / 180 * EARTH_RADIUS_M;
  const longitudeScale = latitudeScale * Math.cos(referenceLatitude * Math.PI / 180);
  return [lng * longitudeScale, lat * latitudeScale];
}

function pointToSegmentDistanceXY(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared
  ));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function distanceToSegmentMeters(point, start, end) {
  return pointToSegmentDistanceXY(
    projectLocal(point, point[0]),
    projectLocal(start, point[0]),
    projectLocal(end, point[0])
  );
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, point) {
  const epsilon = 1e-7;
  return point[0] >= Math.min(a[0], b[0]) - epsilon &&
    point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon &&
    point[1] <= Math.max(a[1], b[1]) + epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (Math.abs(o1) < 1e-7 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-7 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-7 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-7 && onSegment(c, d, b)) return true;
  return false;
}

function distanceBetweenSegmentsMeters(aStart, aEnd, bStart, bEnd) {
  const referenceLatitude = (aStart[0] + aEnd[0] + bStart[0] + bEnd[0]) / 4;
  const a = projectLocal(aStart, referenceLatitude);
  const b = projectLocal(aEnd, referenceLatitude);
  const c = projectLocal(bStart, referenceLatitude);
  const d = projectLocal(bEnd, referenceLatitude);
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointToSegmentDistanceXY(a, c, d),
    pointToSegmentDistanceXY(b, c, d),
    pointToSegmentDistanceXY(c, a, b),
    pointToSegmentDistanceXY(d, a, b)
  );
}

export function routePassesNearRestriction(sections, restriction) {
  const radius = Number(restriction?.radius_m ?? 75);
  if (!Number.isFinite(radius) || radius < 10 || radius > 1000) return null;
  const hasSegment = restriction?.start_latitude != null && restriction?.start_longitude != null && restriction?.end_latitude != null && restriction?.end_longitude != null;
  const hasPoint = restriction?.latitude != null && restriction?.longitude != null;
  if (!hasSegment && !hasPoint) return null;
  const point = hasPoint ? [Number(restriction.latitude), Number(restriction.longitude)] : null;
  const start = hasSegment ? [Number(restriction.start_latitude), Number(restriction.start_longitude)] : null;
  const end = hasSegment ? [Number(restriction.end_latitude), Number(restriction.end_longitude)] : null;
  const valid = ([lat, lng]) => Number.isFinite(lat) && lat >= 29 && lat <= 34 && Number.isFinite(lng) && lng >= 34 && lng <= 36;
  if (hasPoint && !valid(point)) return null;
  if (hasSegment && (!valid(start) || !valid(end))) return null;
  const routeSegments = [];
  for (const section of sections || []) {
    let coordinates;
    try { coordinates = decodeFlexiblePolyline(section?.polyline); } catch { return null; }
    if (coordinates.length < 2) return null;
    for (let i = 1; i < coordinates.length; i++) routeSegments.push([coordinates[i - 1], coordinates[i]]);
  }
  if (!routeSegments.length) return null;
  if (hasPoint) {
    for (const [a, b] of routeSegments) if (distanceToSegmentMeters(point, a, b) <= radius) return true;
    if (!hasSegment) return false;
  }
  if (hasSegment) {
    const avgLat = (start[0] + end[0]) / 2;
    const northMeters = (end[0] - start[0]) * 111320;
    const eastMeters = (end[1] - start[1]) * 111320 * Math.cos(avgLat * Math.PI / 180);
    const segmentLength = Math.hypot(northMeters, eastMeters);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0 || segmentLength > 125000) return null;
    for (const [a, b] of routeSegments) {
      if (distanceBetweenSegmentsMeters(start, end, a, b) <= radius) return true;
    }
    return false;
  }
  return false;
}
const MAX_VERIFICATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export function isRestrictionVerificationFresh(restriction, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  const checkedAt = Date.parse(restriction?.source_last_checked_at || "");
  const verifiedAt = Date.parse(restriction?.verified_at || "");
  if (!Number.isFinite(nowMs) || !Number.isFinite(checkedAt) || !Number.isFinite(verifiedAt)) return false;
  if (checkedAt > nowMs + CLOCK_SKEW_TOLERANCE_MS || verifiedAt > nowMs + CLOCK_SKEW_TOLERANCE_MS) return false;
  if (checkedAt < nowMs - MAX_VERIFICATION_AGE_MS) return false;
  if (checkedAt < verifiedAt - CLOCK_SKEW_TOLERANCE_MS) return false;
  return true;
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
  const hasFrom = from !== null && from !== undefined && from !== "";
  const hasUntil = until !== null && until !== undefined && until !== "";
  if (!hasFrom && !hasUntil) return true;
  if (!hasFrom || !hasUntil) return null;
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
  const hasFrom = from !== null && from !== undefined && from !== "";
  const hasUntil = until !== null && until !== undefined && until !== "";
  if (!hasFrom && !hasUntil) return true;
  if (!hasFrom || !hasUntil) return null;
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

export function evaluateFleetRestrictions({ sections, restrictions, restrictionCatalogLoaded = false, vehicle, currentWeightKg, now = new Date() }) {
  const conflicts = [];
  const unresolved = [];
  const addUnresolved = (reason, restriction = null) => unresolved.push({
    id: restriction?.id ?? null,
    roadName: restriction?.road_name ?? null,
    reason
  });

  // A route cannot be approved without complete geometry, a real restriction
  // catalogue, and a complete vehicle profile. Missing data is never "no conflict".
  if (!Array.isArray(sections) || sections.length === 0) {
    addUnresolved("route_geometry_unavailable");
    return { conflicts, unresolved, validated: false };
  }
  for (const section of sections) {
    try {
      if (!Number.isFinite(section?.summary?.duration) || section.summary.duration < 0 ||
          decodeFlexiblePolyline(section?.polyline).length < 2) {
        addUnresolved("route_geometry_or_duration_invalid");
        return { conflicts, unresolved, validated: false };
      }
    } catch {
      addUnresolved("route_geometry_or_duration_invalid");
      return { conflicts, unresolved, validated: false };
    }
  }
  if (!restrictionCatalogLoaded || !Array.isArray(restrictions)) {
    addUnresolved("restriction_catalog_unavailable");
    return { conflicts, unresolved, validated: false };
  }
  if (restrictions.length === 0) {
    addUnresolved("restriction_catalog_empty");
    return { conflicts, unresolved, validated: false };
  }
  const dimensions = ["heightCm", "widthCm", "lengthCm"];
  if (!vehicle || dimensions.some(key => !Number.isFinite(vehicle[key]) || vehicle[key] <= 0) ||
      !Number.isFinite(currentWeightKg) || currentWeightKg <= 0) {
    addUnresolved("vehicle_profile_incomplete");
    return { conflicts, unresolved, validated: false };
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    addUnresolved("invalid_route_departure_time");
    return { conflicts, unresolved, validated: false };
  }

  const routeDurationValues = sections.map(section => section.summary.duration);
  const routeDurationSeconds = routeDurationValues.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(routeDurationSeconds) || routeDurationSeconds > 48 * 60 * 60) {
    addUnresolved("invalid_route_duration");
    return { conflicts, unresolved, validated: false };
  }

  for (const restriction of restrictions) {
    if (!restriction || typeof restriction !== "object" || typeof restriction.is_active !== "boolean") {
      addUnresolved("malformed_restriction_record", restriction);
      continue;
    }
    if (!restriction.is_active) continue;
    if (restriction.expires_at) {
      const expiry = Date.parse(restriction.expires_at);
      if (!Number.isFinite(expiry)) {
        addUnresolved("invalid_restriction_expiry", restriction);
        continue;
      }
      if (expiry <= now.getTime()) continue;
    }

    // Validate every active catalogue record, not just records near the proposed
    // route: an unverified or malformed record could otherwise hide a real hazard.
    if (!restriction.id || restriction.verification_status !== "verified" ||
        !/^https:\/\//i.test(String(restriction.source_url || "")) ||
        !restriction.verified_at || !restriction.verified_by ||
        !restriction.source_last_checked_at || !restriction.verification_note) {
      addUnresolved("restriction_not_verified", restriction);
      continue;
    }
    if (!isRestrictionVerificationFresh(restriction, now)) {
      addUnresolved("restriction_verification_stale_or_invalid", restriction);
      continue;
    }

    const type = restriction.restriction_type;
    const limitFields = {
      height: "max_height_m",
      weight: "max_weight_t",
      width: "max_width_m",
      length: "max_length_m"
    };
    if (!["closed", "time_window", "height", "weight", "width", "length"].includes(type)) {
      addUnresolved("restriction_type_requires_manual_review", restriction);
      continue;
    }
    if (limitFields[type]) {
      const limit = Number(restriction[limitFields[type]]);
      if (restriction[limitFields[type]] == null || !Number.isFinite(limit) || limit <= 0) {
        addUnresolved("missing_or_invalid_restriction_limit", restriction);
        continue;
      }
    }
    if (type === "time_window" &&
        (!restriction.valid_from || !restriction.valid_until ||
         parseClockSeconds(restriction.valid_from) === null ||
         parseClockSeconds(restriction.valid_until) === null)) {
      addUnresolved("incomplete_time_window", restriction);
      continue;
    }
    if ((restriction.active_from && !/^\d{4}-\d{2}-\d{2}$/.test(restriction.active_from)) ||
        (restriction.active_until && !/^\d{4}-\d{2}-\d{2}$/.test(restriction.active_until)) ||
        (restriction.active_from && restriction.active_until && restriction.active_from > restriction.active_until)) {
      addUnresolved("invalid_active_date_range", restriction);
      continue;
    }

    const near = routePassesNearRestriction(sections, restriction);
    if (near === null) {
      addUnresolved("missing_or_invalid_location_or_route_geometry", restriction);
      continue;
    }
    if (!near) continue;

    const hasSchedule = Boolean(restriction.active_from || restriction.active_until || restriction.valid_from || restriction.valid_until);
    const activeDuringRoute = hasSchedule
      ? isActiveDuringRoute(restriction, now, routeDurationSeconds)
      : isActiveAt(restriction, now);
    if (activeDuringRoute === null) {
      addUnresolved("schedule_or_route_duration_cannot_be_evaluated_safely", restriction);
      continue;
    }
    if (!activeDuringRoute) continue;

    const limit = (value) => Number(value);
    let conflict = false;
    if (type === "closed" || type === "time_window") conflict = true;
    else if (type === "height") conflict = vehicle.heightCm / 100 > limit(restriction.max_height_m);
    else if (type === "weight") conflict = currentWeightKg / 1000 > limit(restriction.max_weight_t);
    else if (type === "width") conflict = vehicle.widthCm / 100 > limit(restriction.max_width_m);
    else if (type === "length") conflict = vehicle.lengthCm / 100 > limit(restriction.max_length_m);

    if (conflict) conflicts.push({
      id: restriction.id,
      roadName: restriction.road_name,
      restrictionType: type,
      sourceUrl: restriction.source_url
    });
  }
  return { conflicts, unresolved, validated: conflicts.length === 0 && unresolved.length === 0 };
}


export function hasBlockingHereNotice(notice) {
  if (!notice || typeof notice !== "object") return false;
  const severity = String(notice.severity || "").trim().toLowerCase();
  const code = String(notice.code || "").trim();
  return severity === "critical" || /^violated[A-Z]/.test(code);
}


export function selectSafeTruckRoute({ routes, restrictions, vehicle, currentWeightKg, now = new Date() }) {
  const rejected = [];
  const candidates = Array.isArray(routes) ? routes : [];

  for (let index = 0; index < candidates.length; index++) {
    const route = candidates[index];
    if (!Array.isArray(route?.sections) || route.sections.length === 0) {
      rejected.push({ index, reason: "missing_route_sections" });
      continue;
    }

    try {
      for (const section of route.sections) {
        if (typeof section?.polyline !== "string" || !section.polyline) {
          throw new Error("Missing route geometry");
        }
        if (decodeFlexiblePolyline(section.polyline).length < 2) {
          throw new Error("Incomplete route geometry");
        }
        if (!Number.isFinite(section.summary?.length) || section.summary.length < 0 ||
            !Number.isFinite(section.summary?.duration) || section.summary.duration < 0) {
          throw new Error("Invalid route summary");
        }
      }
    } catch (error) {
      rejected.push({
        index,
        reason: error?.message === "Invalid route summary" ? "invalid_route_summary" : "invalid_route_geometry"
      });
      continue;
    }

    const notices = [
      ...(Array.isArray(route.notices) ? route.notices : []),
      ...route.sections.flatMap(section => Array.isArray(section?.notices) ? section.notices : [])
    ];
    if (notices.some(hasBlockingHereNotice)) {
      rejected.push({ index, reason: "provider_restriction_notice", notices });
      continue;
    }

    const restrictionCheck = evaluateFleetRestrictions({
      sections: route.sections,
      restrictions,
      vehicle,
      currentWeightKg,
      now
    });
    if (restrictionCheck.unresolved.length > 0) {
      rejected.push({ index, reason: "unresolved_fleet_restrictions", restrictionCheck });
      continue;
    }
    if (restrictionCheck.conflicts.length > 0) {
      rejected.push({ index, reason: "fleet_restriction_conflict", restrictionCheck });
      continue;
    }

    return { route, routeIndex: index, restrictionCheck, notices, rejected };
  }

  return { route: null, routeIndex: null, restrictionCheck: null, notices: [], rejected };
}
