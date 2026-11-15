const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const requiredStrings = [
  "record_id", "structure_id", "road_segment_id", "lane_id",
  "measurement_method", "surveyor", "measurement_reference",
  "authority_name", "authority_reference"
];
const allowedKeys = new Set([
  "schema_version", "record_id", "structure_id", "road_segment_id",
  "country_code", "direction", "lane_id", "passage_length_m",
  "measured_clearance_m", "posted_clearance_status", "posted_clearance_m",
  "measurement_date", "measurement_accuracy_cm", "measurement_method",
  "surveyor", "measurement_reference", "measurement_coverage",
  "authority_name", "authority_reference", "evidence_status",
  "approved_for_routing"
]);
const coverageKeys = new Set([
  "both_sides_measured", "lane_center_measured", "left_edge_measured",
  "right_edge_measured", "hanging_installations_checked",
  "passage_center_measured"
]);

function isHttpsReference(value) {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validates the physical-survey evidence envelope only.
 * A valid envelope is never routing approval; legal and operational approval
 * remain a separate, explicit process.
 */
export function validateBridgeClearanceEvidence(record, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = [];
  if (!isRecord(record)) {
    return {
      valid: false,
      routeEligible: false,
      status: "unknown_not_verified",
      errors: ["record must be an object"]
    };
  }

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) errors.push(`unsupported field: ${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in record)) errors.push(`missing field: ${key}`);
  }
  if (record.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || record[key].trim().length === 0) {
      errors.push(`${key} must be a non-empty string`);
    }
  }
  if (record.country_code !== "IL") errors.push("country_code must be IL");
  if (!["forward", "backward"].includes(record.direction)) errors.push("direction must be forward or backward");

  if (!Number.isFinite(record.passage_length_m) || record.passage_length_m <= 0 || record.passage_length_m > 1000) {
    errors.push("passage_length_m must be greater than 0 and at most 1000");
  }
  if (!Number.isFinite(record.measured_clearance_m) || record.measured_clearance_m < 0.5 || record.measured_clearance_m > 20) {
    errors.push("measured_clearance_m must be between 0.5 and 20 metres");
  }
  if (!Number.isFinite(record.measurement_accuracy_cm) || record.measurement_accuracy_cm <= 0 || record.measurement_accuracy_cm > 1) {
    errors.push("measurement_accuracy_cm must be greater than 0 and no more than 1 cm");
  }
  if (!isRealDate(record.measurement_date) || !isRealDate(today) || record.measurement_date > today) {
    errors.push("measurement_date must be a real date no later than today");
  }
  if (!isHttpsReference(record.measurement_reference)) errors.push("measurement_reference must be an HTTPS URL");
  if (!isHttpsReference(record.authority_reference)) errors.push("authority_reference must be an HTTPS URL");

  if (!["posted", "not_posted", "unknown"].includes(record.posted_clearance_status)) {
    errors.push("posted_clearance_status is invalid");
  } else if (record.posted_clearance_status === "posted") {
    if (!Number.isFinite(record.posted_clearance_m) || record.posted_clearance_m < 0.5 || record.posted_clearance_m > 20) {
      errors.push("posted_clearance_m must be a separate numeric sign value when status is posted");
    }
  } else if (record.posted_clearance_m !== null) {
    errors.push("posted_clearance_m must be null when no posted value is confirmed");
  }

  if (!isRecord(record.measurement_coverage)) {
    errors.push("measurement_coverage must be an object");
  } else {
    for (const key of Object.keys(record.measurement_coverage)) {
      if (!coverageKeys.has(key)) errors.push(`unsupported measurement_coverage field: ${key}`);
    }
    for (const key of coverageKeys) {
      if (!(key in record.measurement_coverage)) errors.push(`missing measurement_coverage.${key}`);
    }
    for (const key of [
      "both_sides_measured", "lane_center_measured", "left_edge_measured",
      "right_edge_measured", "hanging_installations_checked"
    ]) {
      if (record.measurement_coverage[key] !== true) errors.push(`measurement_coverage.${key} must be true`);
    }
    if (typeof record.measurement_coverage.passage_center_measured !== "boolean") {
      errors.push("measurement_coverage.passage_center_measured must be boolean");
    } else if (record.passage_length_m > 20 && record.measurement_coverage.passage_center_measured !== true) {
      errors.push("passages longer than 20 metres require a centre measurement");
    }
  }

  if (!["unreviewed", "needs_clarification", "independently_verified", "rejected"].includes(record.evidence_status)) {
    errors.push("evidence_status is invalid");
  }
  if (record.approved_for_routing !== false) errors.push("evidence records cannot grant routing approval");

  return {
    valid: errors.length === 0,
    routeEligible: false,
    status: errors.length === 0 ? "evidence_complete_pending_separate_approval" : "unknown_not_verified",
    errors
  };
}
