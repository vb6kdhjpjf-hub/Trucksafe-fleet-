const CATEGORIES = new Set([
  "fuel", "food", "truck_parking", "rest_area", "driver_facilities",
  "truck_workshop", "mobile_mechanic", "tire_service", "roadside_assistance",
  "truck_wash", "weighbridge", "air_service", "logistics_hub",
  "loading_area", "depot", "lodging", "convenience", "pharmacy"
]);
const ACCESS_STATES = new Set([
  "confirmed_truck_access", "restricted_truck_access", "unknown", "not_applicable"
]);
const SOURCE_CLASSES = new Set([
  "official_authority", "licensed_provider", "operator_verified", "user_submission"
]);
const TRUSTED_ACCESS_SOURCE_CLASSES = new Set([
  "official_authority", "licensed_provider", "operator_verified"
]);
const LICENSE_STATES = new Set(["approved", "pending", "rejected"]);

function timestamp(value) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function baseResult(overrides = {}) {
  return {
    valid: false,
    displayable: false,
    sourceLicenseApproved: false,
    truckAccessEvidenceCurrent: false,
    reason: "invalid_input",
    ...overrides
  };
}

/**
 * Contract-level assessment only. The caller must authenticate source/operator
 * provenance and enforce authorization; asserted fields are not proof of identity.
 * This result is not a route decision and must never replace road-restriction checks.
 */
export function assessTruckPoi(poi, now = Date.now()) {
  if (!poi || typeof poi !== "object" || Array.isArray(poi) || !Number.isFinite(now)) {
    return baseResult();
  }

  const source = poi.source;
  const sourceUrl = httpsUrl(source?.source_url);
  const geometry = poi.geometry;
  if (poi.schema_version !== 1
    || typeof poi.poi_id !== "string" || poi.poi_id.length < 1 || poi.poi_id.length > 128
    || typeof poi.name !== "string" || poi.name.trim().length < 2 || poi.name.length > 160
    || !CATEGORIES.has(poi.category)
    || !Number.isFinite(geometry?.latitude) || geometry.latitude < 29 || geometry.latitude > 34
    || !Number.isFinite(geometry?.longitude) || geometry.longitude < 34 || geometry.longitude > 36
    || !ACCESS_STATES.has(poi.truck_access_status)
    || typeof source?.source_id !== "string" || source.source_id.length < 1 || source.source_id.length > 128
    || !SOURCE_CLASSES.has(source.source_class)
    || !sourceUrl
    || !LICENSE_STATES.has(source.license_review_status)) {
    return baseResult({ reason: "invalid_poi" });
  }

  const sourceLicenseApproved = source.license_review_status === "approved";
  const displayable = sourceLicenseApproved;
  if (poi.truck_access_status !== "confirmed_truck_access") {
    return baseResult({
      valid: true,
      displayable,
      sourceLicenseApproved,
      reason: sourceLicenseApproved ? poi.truck_access_status : "source_license_not_approved"
    });
  }

  const evidence = poi.truck_access_evidence;
  const evidenceUrl = httpsUrl(evidence?.source_url);
  const verifiedAt = timestamp(evidence?.verified_at);
  const expiresAt = timestamp(evidence?.expires_at);
  const truckAccessEvidenceCurrent = Boolean(
    evidence
    && TRUSTED_ACCESS_SOURCE_CLASSES.has(evidence.source_class)
    && evidenceUrl
    && verifiedAt !== null
    && expiresAt !== null
    && verifiedAt <= now + 30_000
    && expiresAt > now
    && expiresAt > verifiedAt
  );

  return baseResult({
    valid: true,
    displayable,
    sourceLicenseApproved,
    truckAccessEvidenceCurrent,
    reason: !sourceLicenseApproved
      ? "source_license_not_approved"
      : truckAccessEvidenceCurrent
        ? "truck_access_evidence_current"
        : "access_evidence_missing_or_stale"
  });
}

export const TRUCK_POI_CATEGORIES = Object.freeze([...CATEGORIES]);
