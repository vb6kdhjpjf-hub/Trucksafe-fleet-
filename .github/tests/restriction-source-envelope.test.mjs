import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateCandidateRestrictionEnvelope } from "../../lib/restriction-source-envelope.mjs";

const rawPayload = JSON.stringify({ id: "synthetic-bridge-001", clearance_m: 4.2 });
const hash = createHash("sha256").update(rawPayload, "utf8").digest("hex");

function validEnvelope(overrides = {}) {
  return {
    schema_version: "1.0",
    source: {
      source_id: "synthetic-source",
      publisher: "Synthetic test publisher",
      dataset_name: "Synthetic restriction fixture",
      dataset_version: "test-v1",
      licence_reference: "synthetic-only; no external data rights implied"
    },
    retrieved_at: "2026-11-10T12:00:00Z",
    payload: JSON.parse(rawPayload),
    payload_sha256: hash,
    review: { status: "unreviewed", approved_for_routing: false },
    ...overrides
  };
}

test("accepts a structurally valid synthetic candidate envelope with matching payload hash", () => {
  assert.deepEqual(validateCandidateRestrictionEnvelope(validEnvelope(), rawPayload), { valid: true, errors: [] });
});

test("rejects a missing source identity or licence", () => {
  const envelope = validEnvelope();
  delete envelope.source.source_id;
  delete envelope.source.licence_reference;
  const result = validateCandidateRestrictionEnvelope(envelope, rawPayload);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("source.source_id")));
  assert.ok(result.errors.some(error => error.includes("source.licence_reference")));
});

test("rejects malformed or timezone-ambiguous timestamps", () => {
  const envelope = validEnvelope({ retrieved_at: "2026-11-10T12:00:00" });
  assert.equal(validateCandidateRestrictionEnvelope(envelope, rawPayload).valid, false);
});

test("rejects a payload hash mismatch", () => {
  const envelope = validEnvelope({ payload_sha256: "0".repeat(64) });
  assert.ok(validateCandidateRestrictionEnvelope(envelope, rawPayload).errors.includes("payload_sha256 does not match rawPayload"));
});

test("rejects records that attempt to self-approve for routing", () => {
  const envelope = validEnvelope({ review: { status: "independently_verified", approved_for_routing: true } });
  assert.ok(validateCandidateRestrictionEnvelope(envelope, rawPayload).errors.includes("candidate records must never be approved for routing by ingestion"));
});

test("rejects unknown top-level fields and unsupported review states", () => {
  const envelope = validEnvelope({ unexpected: true, review: { status: "approved", approved_for_routing: false } });
  const result = validateCandidateRestrictionEnvelope(envelope, rawPayload);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("only supported top-level fields")));
  assert.ok(result.errors.includes("review.status is invalid"));
});

test("rejects absent raw source bytes and malformed hashes", () => {
  const envelope = validEnvelope({ payload_sha256: "not-a-hash" });
  const result = validateCandidateRestrictionEnvelope(envelope, undefined);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("rawPayload must be the exact original UTF-8 JSON string"));
  assert.ok(result.errors.includes("payload_sha256 must be a 64-character SHA-256 hex digest"));
});
