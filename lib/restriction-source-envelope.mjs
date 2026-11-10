import { createHash } from "node:crypto";

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value, allowed) =>
  isRecord(value) && Object.keys(value).every(key => allowed.includes(key));

const isIsoDateTime = value => {
  if (typeof value !== "string") return false;
  const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2})T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const calendarDate = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === match[1];
};

/**
 * Validates an unapproved source envelope for quarantined staging.
 * This is structural/integrity validation only; it does not verify road facts.
 * payload must be the exact UTF-8 JSON string whose SHA-256 is in the envelope.
 */
export function validateCandidateRestrictionEnvelope(envelope, rawPayload) {
  const errors = [];
  if (!isRecord(envelope)) {
    return { valid: false, errors: ["envelope must be a JSON object"] };
  }
  if (!hasOnlyKeys(envelope, ["schema_version", "source", "retrieved_at", "payload", "payload_sha256", "review"])) {
    errors.push("envelope must contain only supported top-level fields");
  }
  if (envelope.schema_version !== "1.0") errors.push("unsupported schema_version");

  const source = envelope.source;
  if (!hasOnlyKeys(source, ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference", "coverage_description", "contact_reference"])) {
    errors.push("source must contain only supported source metadata");
  } else {
    const sourceLimits = {
      source_id: 200, publisher: 200, dataset_name: 200,
      dataset_version: 100, licence_reference: 1000,
      coverage_description: 2000, contact_reference: 1000
    };
    for (const key of ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"]) {
      if (typeof source[key] !== "string" || source[key].trim().length === 0) errors.push(`source.${key} is required`);
    }
    for (const [key, limit] of Object.entries(sourceLimits)) {
      if (source[key] !== undefined && (typeof source[key] !== "string" || source[key].length > limit)) {
        errors.push(`source.${key} must be a string of at most ${limit} characters`);
      }
    }
  }

  if (!isIsoDateTime(envelope.retrieved_at)) errors.push("retrieved_at must be an ISO-8601 timestamp with an explicit timezone");
  if (!isRecord(envelope.payload) && !Array.isArray(envelope.payload)) errors.push("payload must be a JSON object or array");
  if (typeof rawPayload !== "string") errors.push("rawPayload must be the exact original UTF-8 JSON string");
  if (!/^[a-fA-F0-9]{64}$/.test(envelope.payload_sha256 ?? "")) {
    errors.push("payload_sha256 must be a 64-character SHA-256 hex digest");
  } else if (typeof rawPayload === "string") {
    const actual = createHash("sha256").update(rawPayload, "utf8").digest("hex");
    if (actual.toLowerCase() !== envelope.payload_sha256.toLowerCase()) errors.push("payload_sha256 does not match rawPayload");
  }

  const review = envelope.review;
  if (!hasOnlyKeys(review, ["status", "approved_for_routing", "reviewer", "reviewed_at", "notes"])) {
    errors.push("review must contain only supported review fields");
  } else {
    if (!["unreviewed", "rejected", "needs_clarification", "pilot_candidate", "independently_verified"].includes(review.status)) {
      errors.push("review.status is invalid");
    }
    if (review.approved_for_routing !== false) errors.push("candidate records must never be approved for routing by ingestion");
    if (review.reviewed_at !== undefined && !isIsoDateTime(review.reviewed_at)) errors.push("review.reviewed_at must include an explicit timezone");
    if (review.reviewer !== undefined && (typeof review.reviewer !== "string" || review.reviewer.length > 200)) errors.push("review.reviewer must be a string of at most 200 characters");
    if (review.notes !== undefined && (typeof review.notes !== "string" || review.notes.length > 4000)) errors.push("review.notes must be a string of at most 4000 characters");
  }

  return { valid: errors.length === 0, errors };
}
