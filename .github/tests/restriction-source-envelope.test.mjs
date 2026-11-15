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
  assert.ok(validateCandidateRestrictionEnvelope(envelope, rawPayload).errors.includes("payload_sha256 does not match canonicalPayload"));
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
  assert.ok(result.errors.includes("canonicalPayload must be JSON.stringify(envelope.payload)"));
  assert.ok(result.errors.includes("payload_sha256 must be a 64-character SHA-256 hex digest"));
});


test("rejects impossible calendar dates even when the timestamp has a timezone", () => {
  const envelope = validEnvelope({ retrieved_at: "2026-02-30T12:00:00Z" });
  assert.ok(validateCandidateRestrictionEnvelope(envelope, rawPayload).errors.includes("retrieved_at must be an ISO-8601 timestamp with an explicit timezone"));
});

test("enforces source metadata length limits from the schema", () => {
  const envelope = validEnvelope();
  envelope.source.publisher = "p".repeat(201);
  envelope.source.coverage_description = "c".repeat(2001);
  const errors = validateCandidateRestrictionEnvelope(envelope, rawPayload).errors;
  assert.ok(errors.includes("source.publisher must be a string of at most 200 characters"));
  assert.ok(errors.includes("source.coverage_description must be a string of at most 2000 characters"));
});

test("enforces optional reviewer and notes length limits", () => {
  const envelope = validEnvelope({
    review: {
      status: "unreviewed",
      approved_for_routing: false,
      reviewer: "r".repeat(201),
      notes: "n".repeat(4001)
    }
  });
  const errors = validateCandidateRestrictionEnvelope(envelope, rawPayload).errors;
  assert.ok(errors.includes("review.reviewer must be a string of at most 200 characters"));
  assert.ok(errors.includes("review.notes must be a string of at most 4000 characters"));
});


test("canonical payload checksum ignores whitespace but follows parsed JavaScript property order", () => {
  const spaced = JSON.parse('{ "b": 2, "a": 1 }');
  const compact = JSON.parse('{"b":2,"a":1}');
  const canonical = JSON.stringify(spaced);
  assert.equal(canonical, JSON.stringify(compact));

  const digestFor = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
  const envelope = validEnvelope({
    payload: spaced,
    payload_sha256: digestFor(spaced)
  });
  assert.deepEqual(validateCandidateRestrictionEnvelope(envelope, canonical), { valid: true, errors: [] });

  const reordered = JSON.parse('{"a":1,"b":2}');
  assert.notEqual(JSON.stringify(reordered), canonical);
  assert.notEqual(digestFor(reordered), envelope.payload_sha256);

  const duplicateKeys = JSON.parse('{"a":1,"a":2}');
  assert.deepEqual(duplicateKeys, { a: 2 });
  assert.equal(JSON.stringify(duplicateKeys), '{"a":2}');
});
