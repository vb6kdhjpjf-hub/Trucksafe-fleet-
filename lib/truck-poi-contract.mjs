const CATEGORIES = new Set([
  "fuel", "food", "truck_parking", "rest_area", "driver_facilities",
  "truck_workshop", "mobile_mechanic", "tire_service", "roadside_assistance",
  "truck_wash", "weighbridge", "air_service", "logistics_hub",
  "loading_area", "depot", "lodging", "convenience", "pharmacy"
]);
const ACCESS_STATES = new Set([
  "confirmed_truck_access", "restricted_truck_access", "unknown", "not_applicable"
]);
const TRUSTED_SOURCE_CLASSES = new Set([
  "official_authority", "licensed_provider", "operator_verified"
]);

function timestamp(value) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function assessTruckPoi(poi, now = Date.now()) {
  if (!poi || typeof poi !== "object" || Array.isArray(poi) || !Number.isFinite(now)) {
    return { valid: false, displayable: false, truckRouteEligible: false, reason: "invalid_input" };
  }
  if (typeof poi.poi_id !== "string" || poi.poi_id.length < 1 || poi.poi_id.length > 128
    || typeof poi.name !== "string" || poi.name.trim().length < 2 || poi.name.length > 160
    || !CATEGORIES.has(poi.category)
    || !Number.isFinite(poi.latitude) || poi.latitude < 29 || poi.latitude > 34
    || !Number.isFinite(poi.longitude) || poi.longitude < 34 || poi.longitude > 36
    || !ACCESS_STATES.has(poi.truck_access_status)) {
    return { valid: false, displayable: false, truckRouteEligible: false, reason: "invalid_poi" };
  }

  if (poi.truck_access_status !== "confirmed_truck_access") {
    return {
      valid: true,
      displayable: true,
      truckRouteEligible: false,
      reason: poi.truck_access_status
    };
  }

  const evidence = poi.truck_access_evidence;
  const verifiedAt = timestamp(evidence?.verified_at);
  const expiresAt = timestamp(evidence?.expires_at);
  let sourceUrl;
  try {
    sourceUrl = new URL(evidence?.source_url);
  } catch {
    sourceUrl = null;
  }
  if (!evidence || !TRUSTED_SOURCE_CLASSES.has(evidence.source_class)
    || !sourceUrl || sourceUrl.protocol !== "https:"
    || verifiedAt === null || expiresAt === null
    || verifiedAt > now + 30_000 || expiresAt <= now || expiresAt <= verifiedAt) {
    return {
      valid: true,
      displayable: true,
      truckRouteEligible: false,
      reason: "access_evidence_missing_or_stale"
    };
  }

  return {
    valid: true,
    displayable: true,
    truckRouteEligible: true,
    reason: "truck_access_confirmed"
  };
}

export const TRUCK_POI_CATEGORIES = Object.freeze([...CATEGORIES]);
