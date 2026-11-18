import assert from "node:assert/strict";
import test from "node:test";
import { assessTruckPoi, TRUCK_POI_CATEGORIES } from "../../lib/truck-poi-contract.mjs";

const now = Date.parse("2026-11-17T18:00:00.000Z");
const base = {
  schema_version: 1,
  poi_id: "poi-123",
  name: "Truck stop",
  category: "truck_parking",
  geometry: { latitude: 32.1, longitude: 34.8 },
  truck_access_status: "confirmed_truck_access",
  source: {
    source_id: "synthetic-operator-source",
    source_class: "operator_verified",
    source_url: "https://example.com/poi",
    license_review_status: "approved"
  },
  truck_access_evidence: {
    source_class: "operator_verified",
    source_url: "https://example.com/access",
    verified_at: "2026-11-17T17:00:00.000Z",
    expires_at: "2026-11-18T17:00:00.000Z"
  },
  observed_at: "2026-11-17T17:00:00.000Z",
  last_checked_at: "2026-11-17T17:30:00.000Z"
};

test("the POI taxonomy covers truck stops and driver essentials", () => {
  for (const category of ["fuel", "food", "truck_parking", "rest_area", "truck_workshop", "tire_service", "truck_wash", "weighbridge", "lodging", "pharmacy"]) {
    assert.ok(TRUCK_POI_CATEGORIES.includes(category));
  }
});

test("schema-shaped POI with fresh trusted evidence passes contract assessment", () => {
  assert.deepEqual(assessTruckPoi(base, now), {
    valid: true,
    displayable: true,
    sourceLicenseApproved: true,
    truckAccessEvidenceCurrent: true,
    reason: "truck_access_evidence_current"
  });
});

test("unknown, restricted, and not-applicable access remain visible but have no current access evidence", () => {
  for (const status of ["unknown", "restricted_truck_access", "not_applicable"]) {
    const result = assessTruckPoi({ ...base, truck_access_status: status }, now);
    assert.equal(result.valid, true);
    assert.equal(result.displayable, true);
    assert.equal(result.sourceLicenseApproved, true);
    assert.equal(result.truckAccessEvidenceCurrent, false);
    assert.equal(result.reason, status);
  }
});

test("unapproved POI source licence blocks display even when access evidence is fresh", () => {
  for (const license_review_status of ["pending", "rejected"]) {
    const result = assessTruckPoi({
      ...base,
      source: { ...base.source, license_review_status }
    }, now);
    assert.equal(result.valid, true);
    assert.equal(result.displayable, false);
    assert.equal(result.sourceLicenseApproved, false);
    assert.equal(result.truckAccessEvidenceCurrent, true);
    assert.equal(result.reason, "source_license_not_approved");
  }
});

test("missing, expired, non-HTTPS, or untrusted access evidence fails closed", () => {
  const invalidEvidence = [
    null,
    { ...base.truck_access_evidence, expires_at: "2026-11-17T17:59:59.000Z" },
    { ...base.truck_access_evidence, source_url: "http://example.com/access" },
    { ...base.truck_access_evidence, source_class: "user_submission" }
  ];
  for (const evidence of invalidEvidence) {
    const result = assessTruckPoi({ ...base, truck_access_evidence: evidence }, now);
    assert.equal(result.valid, true);
    assert.equal(result.displayable, true);
    assert.equal(result.truckAccessEvidenceCurrent, false);
    assert.equal(result.reason, "access_evidence_missing_or_stale");
  }
});

test("malformed POIs, missing source provenance, and out-of-region coordinates are rejected", () => {
  assert.equal(assessTruckPoi(null, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, geometry: { latitude: 35, longitude: 34.8 } }, now).displayable, false);
  assert.equal(assessTruckPoi({ ...base, category: "police_checkpoint" }, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, name: " " }, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, source: undefined }, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, source: { ...base.source, source_url: "http://example.com" } }, now).valid, false);
});

test("future verification timestamps beyond clock tolerance fail closed", () => {
  const poi = {
    ...base,
    truck_access_evidence: {
      ...base.truck_access_evidence,
      verified_at: "2026-11-17T18:01:00.000Z"
    }
  };
  assert.equal(assessTruckPoi(poi, now).truckAccessEvidenceCurrent, false);
});
