const EARTH_RADIUS_KM = 6371.0088;
const AMBIGUOUS_MATCH_DISTANCE_KM = 0.02;
const AMBIGUOUS_ROUTE_SEPARATION_KM = 0.25;

function validIsraelCoordinate(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  return Number.isFinite(latitude) && latitude >= 29 && latitude <= 34
    && Number.isFinite(longitude) && longitude >= 34 && longitude <= 36;
}

function haversineKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

function nearestPointOnSegmentKm(point, start, end) {
  const radians = value => value * Math.PI / 180;
  const referenceLatitude = radians((start.latitude + end.latitude + point.latitude) / 3);
  const xScale = EARTH_RADIUS_KM * Math.cos(referenceLatitude) * Math.PI / 180;
  const yScale = EARTH_RADIUS_KM * Math.PI / 180;
  const bx = (end.longitude - start.longitude) * xScale;
  const by = (end.latitude - start.latitude) * yScale;
  const px = (point.longitude - start.longitude) * xScale;
  const py = (point.latitude - start.latitude) * yScale;
  const lengthSquared = bx * bx + by * by;
  if (lengthSquared <= 0) return { distanceKm: haversineKm(point, start), fraction: 0 };
  const fraction = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  const projected = {
    latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    longitude: start.longitude + (end.longitude - start.longitude) * fraction
  };
  return { distanceKm: haversineKm(point, projected), fraction };
}

/**
 * Matches a road event to an explicitly ordered planned route (origin -> destination).
 * Ambiguous self-crossings/parallel segments fail closed. This does not accept GPS
 * history, infer a route, or estimate travel time.
 */
export function getEventPositionOnPlannedRoute(
  event, plannedRoute, progressKm = null, maxCorridorKm = 2, nowMs = Date.now()
) {
  const points = plannedRoute?.coordinates;
  const fetchedAtMs = Date.parse(plannedRoute?.fetchedAt);
  const validRouteMetadata = typeof plannedRoute?.providerId === "string"
    && plannedRoute.providerId.trim().length > 0
    && typeof plannedRoute?.routeId === "string"
    && plannedRoute.routeId.trim().length > 0
    && Number.isFinite(fetchedAtMs)
    && Number.isFinite(nowMs)
    && fetchedAtMs <= nowMs + 30_000
    && nowMs - fetchedAtMs <= 15 * 60_000;
  if (plannedRoute?.kind !== "planned_route"
    || plannedRoute?.coordinateOrder !== "origin_to_destination"
    || !validRouteMetadata
    || !validIsraelCoordinate(event) || !Array.isArray(points) || points.length < 2
    || !points.every(validIsraelCoordinate)
    || !Number.isFinite(maxCorridorKm) || maxCorridorKm < 0.05 || maxCorridorKm > 20) return null;

  let cumulativeKm = 0;
  const candidates = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLengthKm = haversineKm(start, end);
    if (!Number.isFinite(segmentLengthKm) || segmentLengthKm <= 0) continue;
    const projection = nearestPointOnSegmentKm(event, start, end);
    candidates.push({
      distanceToRouteKm: projection.distanceKm,
      alongRouteKm: cumulativeKm + segmentLengthKm * projection.fraction
    });
    cumulativeKm += segmentLengthKm;
  }

  candidates.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);
  const nearest = candidates[0];
  if (!nearest || nearest.distanceToRouteKm > maxCorridorKm) return null;

  // At a route crossing or on closely spaced parallel legs, geometric proximity
  // alone cannot identify which occurrence is relevant to the driver's direction.
  const competing = candidates.find(candidate =>
    Math.abs(candidate.alongRouteKm - nearest.alongRouteKm) > AMBIGUOUS_ROUTE_SEPARATION_KM
    && candidate.distanceToRouteKm - nearest.distanceToRouteKm <= AMBIGUOUS_MATCH_DISTANCE_KM
  );
  if (competing) return null;

  const validProgress = Number.isFinite(progressKm) && progressKm >= 0 && progressKm <= cumulativeKm;
  const distanceFromProgressKm = validProgress ? nearest.alongRouteKm - progressKm : null;
  return {
    distanceToRouteKm: Number(nearest.distanceToRouteKm.toFixed(3)),
    distanceAlongRouteKm: Number(nearest.alongRouteKm.toFixed(3)),
    routeProgressKnown: validProgress,
    isAhead: validProgress ? distanceFromProgressKm > 0.05 : null,
    distanceFromProgressKm: validProgress ? Number(distanceFromProgressKm.toFixed(3)) : null
  };
}
