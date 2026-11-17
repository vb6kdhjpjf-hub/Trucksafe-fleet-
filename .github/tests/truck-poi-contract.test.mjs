import assert from "node:assert/strict";
import test from "node:test";
import { assessTruckPoi, TRUCK_POI_CATEGORIES } from "../../lib/truck-poi-contract.mjs";

const now = Date.parse("2026-11-17T18:00:00.000Z");
const base = {
  poi_id: "poi-123",
  name: "Truck stop",
  category: "truck_parking",
  latitude: 32.1,
  longitude: 34.8,
  truck_access_status: "confirmed_truck_access",
  truck_access_evidence: {
    source_class: "operator_verified",
    source_url: "https://example.com/access",
    verified_at: "2026-11-17T17:00:00.000Z",
    expires_at: "2026-11-18T17:00:00.000Z"
  }
};

test("the POI taxonomy covers truck stops and driver essentials", () => {
  for (const category of ["fuel", "food", "truck_parking", "rest_area", "truck_workshop", "tire_service", "truck_wash", "weighbridge", "lodging", "pharmacy"]) {
    assert.ok(TRUCK_POI_CATEGORIES.includes(category));
  }
});

test("fresh trusted evidence is required for truck-route eligibility", () => {
  assert.deepEqual(assessTruckPoi(base, now), {
    valid: true, displayable: true, truckAccessEvidenceCurrent: true, reason: "truck_access_confirmed"
  });
});

test("unknown, restricted, and not-applicable access remain visible but are not route eligible", () => {
  for (const status of ["unknown", "restricted_truck_access", "not_applicable"]) {
    const result = assessTruckPoi({ ...base, truck_access_status: status }, now);
    assert.equal(result.valid, true);
    assert.equal(result.displayable, true);
    assert.equal(result.truckAccessEvidenceCurrent, false);
    assert.equal(result.reason, status);
  }
});

test("missing, expired, non-HTTPS, or untrusted access evidence fails closed", () => {
  const invalidEvidence = [
    null,
    { ...base.truck_access_evidence, expires_at: "2026-11-17T17:59:59.000Z" },
    { ...base.truck_access_evidence, source_url: "http://example.com/access" },
    { ...base.truck_access_evidence, source_class: "driver_report" }
  ];
  for (const evidence of invalidEvidence) {
    const result = assessTruckPoi({ ...base, truck_access_evidence: evidence }, now);
    assert.equal(result.valid, true);
    assert.equal(result.displayable, true);
    assert.equal(result.truckAccessEvidenceCurrent, false);
    assert.equal(result.reason, "access_evidence_missing_or_stale");
  }
});

test("malformed POIs and out-of-region coordinates are rejected", () => {
  assert.equal(assessTruckPoi(null, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, latitude: 35 }, now).displayable, false);
  assert.equal(assessTruckPoi({ ...base, category: "police_checkpoint" }, now).valid, false);
  assert.equal(assessTruckPoi({ ...base, name: " " }, now).valid, false);
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
