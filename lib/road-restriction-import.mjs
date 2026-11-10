const RESTRICTION_TYPES = new Set(["closed", "height", "weight", "width", "length", "time_window"]);

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeRestrictionCandidate(feature, source) {
  if (!feature || typeof feature !== "object" || !source || typeof source !== "object") return null;
  if (typeof source.name !== "string" || !source.name.trim() ||
      typeof source.url !== "string" || !/^https:\/\//i.test(source.url) ||
      typeof source.updatedAt !== "string" || !Number.isFinite(Date.parse(source.updatedAt))) return null;

  const geometry = feature.geometry;
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return null;
  const longitude = Number(geometry.coordinates[0]);
  const latitude = Number(geometry.coordinates[1]);
  if (!Number.isFinite(latitude) || latitude < 29 || latitude > 34 ||
      !Number.isFinite(longitude) || longitude < 34 || longitude > 36) return null;

  const properties = feature.properties || {};
  const type = String(properties.restriction_type || "").trim().toLowerCase();
  if (!RESTRICTION_TYPES.has(type)) return null;

  const candidate = {
    road_name: String(properties.road_name || "").trim().slice(0, 180),
    restriction_type: type,
    direction: typeof properties.direction === "string" ? properties.direction.trim().slice(0, 120) : null,
    max_height_m: positiveNumber(properties.max_height_m),
    max_weight_t: positiveNumber(properties.max_weight_t),
    max_width_m: positiveNumber(properties.max_width_m),
    max_length_m: positiveNumber(properties.max_length_m),
    valid_from: properties.valid_from || null,
    valid_until: properties.valid_until || null,
    active_from: properties.active_from || null,
    active_until: properties.active_until || null,
    latitude,
    longitude,
    radius_m: positiveNumber(properties.radius_m),
    source_url: source.url,
    verification_status: "unverified",
    verified_at: null,
    verified_by: null,
    source_last_checked_at: null,
    verification_note: null,
    source_name: source.name.trim().slice(0, 160),
    source_updated_at: new Date(source.updatedAt).toISOString(),
    source_record_id: String(feature.id ?? properties.id ?? "").slice(0, 180),
    import_status: "candidate_requires_human_review"
  };

  if (!candidate.road_name || candidate.radius_m === null || candidate.radius_m < 10 || candidate.radius_m > 1000) return null;
  if ((type === "height" && candidate.max_height_m === null) ||
      (type === "weight" && candidate.max_weight_t === null) ||
      (type === "width" && candidate.max_width_m === null) ||
      (type === "length" && candidate.max_length_m === null) ||
      (type === "time_window" && (!candidate.valid_from || !candidate.valid_until))) return null;
  return candidate;
}
