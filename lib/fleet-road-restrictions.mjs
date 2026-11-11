const RESTRICTION_COLUMNS = [
  "id", "road_name", "restriction_type", "max_height_m", "max_weight_t",
  "max_width_m", "max_length_m", "valid_from", "valid_until", "active_from",
  "active_until", "is_active", "country_code", "latitude", "longitude",
  "start_latitude", "start_longitude", "end_latitude", "end_longitude",
  "location_accuracy_m", "radius_m", "source_type", "source_name",
  "source_url", "source_reference", "source_updated_at", "verification_status",
  "verified_at", "verified_by", "source_last_checked_at", "verification_note",
  "expires_at"
].join(",");

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_RECORDS = 5000;

/**
 * Read the complete fleet restriction catalogue. PostgREST may cap a normal
 * select at its configured maximum row count; silent truncation must never be
 * treated as a complete catalogue during route validation.
 */
export async function loadFleetRoadRestrictions(
  client,
  fleetId,
  { pageSize = DEFAULT_PAGE_SIZE, maxRecords = DEFAULT_MAX_RECORDS } = {}
) {
  if (!client || typeof client.from !== "function" ||
      typeof fleetId !== "string" || !fleetId ||
      !Number.isInteger(pageSize) || pageSize < 1 ||
      !Number.isInteger(maxRecords) || maxRecords < pageSize) {
    return { ok: false, reason: "invalid_restriction_query" };
  }

  const records = [];
  let expectedCount = null;
  let offset = 0;

  do {
    let query;
    try {
      query = client.from("road_restrictions")
        .select(RESTRICTION_COLUMNS, { count: "exact" })
        .eq("fleet_id", fleetId)
        .eq("country_code", "IL")
        .order("id", { ascending: true })
        .range(offset, Math.min(offset + pageSize - 1, maxRecords - 1));
      const result = await query;
      if (result?.error || !Array.isArray(result?.data) ||
          !Number.isInteger(result?.count) || result.count < 0) {
        return { ok: false, reason: "restriction_catalog_query_failed" };
      }
      if (expectedCount === null) expectedCount = result.count;
      else if (result.count !== expectedCount) {
        return { ok: false, reason: "restriction_catalog_changed_during_read" };
      }
      if (expectedCount > maxRecords) {
        return { ok: false, reason: "restriction_catalog_exceeds_safe_limit" };
      }

      const expectedPageLength = Math.min(pageSize, expectedCount - offset);
      if (result.data.length !== expectedPageLength) {
        return { ok: false, reason: "restriction_catalog_incomplete" };
      }
      records.push(...result.data);
      offset += result.data.length;
    } catch {
      return { ok: false, reason: "restriction_catalog_query_failed" };
    }
  } while (offset < expectedCount);

  if (records.length !== expectedCount) {
    return { ok: false, reason: "restriction_catalog_incomplete" };
  }
  return { ok: true, data: records, count: expectedCount };
}
