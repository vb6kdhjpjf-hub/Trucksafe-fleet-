import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRestrictionCandidate } from "../../lib/road-restriction-import.mjs";

const source = {
  name: "Authoritative test source",
  url: "https://example.gov.il/road-restrictions",
  updatedAt: "2026-11-07T08:00:00Z"
};
const feature = {
  id: "restriction-123",
  type: "Feature",
  geometry: { type: "Point", coordinates: [34.8, 32.0] },
  properties: { road_name: "Test bridge", restriction_type: "height", max_height_m: 4.1 }
};

test("imports an explicitly described point restriction as unverified candidate", () => {
  const candidate = normalizeRestrictionCandidate(feature, source);
  assert.equal(candidate.verification_status, "unverified");
  assert.equal(candidate.max_height_m, 4.1);
  assert.equal(candidate.latitude, 32);
  assert.equal(candidate.longitude, 34.8);
  assert.equal(candidate.source_record_id, "restriction-123");
  assert.equal(candidate.radius_m, null);
  assert.equal(candidate.import_status, "candidate_requires_human_review");
});

test("never imports a point without explicit restriction type or limit", () => {
  assert.equal(normalizeRestrictionCandidate({ ...feature, properties: { road_name: "Bridge" } }, source), null);
  assert.equal(normalizeRestrictionCandidate({ ...feature, properties: { ...feature.properties, max_height_m: null } }, source), null);
});

test("rejects non-point geometry instead of inventing a representative point", () => {
  const line = { ...feature, geometry: { type: "LineString", coordinates: [[34.8,32],[34.81,32.01]] } };
  assert.equal(normalizeRestrictionCandidate(line, source), null);
});

test("rejects out-of-Israel coordinates and non-HTTPS sources", () => {
  const outside = { ...feature, geometry: { type: "Point", coordinates: [10, 50] } };
  assert.equal(normalizeRestrictionCandidate(outside, source), null);
  assert.equal(normalizeRestrictionCandidate(feature, { ...source, url: "http://example.gov.il" }), null);
});

test("requires source publication/update time and retains provenance", () => {
  assert.equal(normalizeRestrictionCandidate(feature, { ...source, updatedAt: "not-a-date" }), null);
  const candidate = normalizeRestrictionCandidate(feature, source);
  assert.equal(candidate.source_name, source.name);
  assert.equal(candidate.source_updated_at, "2026-11-07T08:00:00.000Z");
});
