import { createHash } from "node:crypto";

const hasOnlyKeys = (value, allowed) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));

const isIsoDateTime = value =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

/**
 * Validates an unapproved source envelope for quarantined staging.
 * This is structural/integrity validation only; it does not verify road facts.
 * payload must be the exact UTF-8 JSON string whose SHA-256 is in the envelope.
 */
export function validateCandidateRestrictionEnvelope(envelope, rawPayload) {
  const errors = [];
  if (!hasOnlyKeys(envelope, ["schema_version", "source", "retrieved_at", "payload", "payload_sha256", "review"])) {
    return { valid: false, errors: ["envelope must be an object with only supported top-level fields"] };
  }
  if (envelope.schema_version !== "1.0") errors.push("unsupported schema_version");

  const source = envelope.source;
  if (!hasOnlyKeys(source, ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference", "coverage_description", "contact_reference"])) {
    errors.push("source must contain only supported source metadata");
  } else {
    for (const key of ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"]) {
      if (typeof source[key] !== "string" || source[key].trim().length === 0) errors.push(`source.${key} is required`);
    }
    if (source.source_id?.length > 200) errors.push("source.source_id exceeds 200 characters");
  }

  if (!isIsoDateTime(envelope.retrieved_at)) errors.push("retrieved_at must be an ISO-8601 timestamp with an explicit timezone");
  if (!envelope.payload || typeof envelope.payload !== "object") errors.push("payload must be a JSON object or array");
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
  }

  return { valid: errors.length === 0, errors };
}
