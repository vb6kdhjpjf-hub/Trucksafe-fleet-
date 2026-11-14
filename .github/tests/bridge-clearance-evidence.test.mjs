import test from "node:test";
import assert from "node:assert/strict";
import { validateBridgeClearanceEvidence } from "../../lib/bridge-clearance-evidence.mjs";

const validRecord = () => ({
  schema_version: "1.0",
  record_id: "survey-001",
  structure_id: "bridge-123",
  road_segment_id: "road-90-seg-2",
  country_code: "IL",
  direction: "forward",
  lane_id: "lane-1",
  passage_length_m: 18,
  measured_clearance_m: 4.62,
  posted_clearance_status: "posted",
  posted_clearance_m: 4.4,
  measurement_date: "2026-11-10",
  measurement_accuracy_cm: 1,
  measurement_method: "calibrated laser survey",
  surveyor: "licensed survey team",
  measurement_reference: "https://example.org/survey/001",
  measurement_coverage: {
    both_sides_measured: true,
    lane_center_measured: true,
    left_edge_measured: true,
    right_edge_measured: true,
    hanging_installations_checked: true,
    passage_center_measured: false
  },
  authority_name: "Competent road authority",
  authority_reference: "https://example.org/authority/bridge-123",
  evidence_status: "independently_verified",
  approved_for_routing: false
});

test("accepts complete per-lane evidence but never turns it into routing approval", () => {
  const result = validateBridgeClearanceEvidence(validRecord(), { today: "2026-11-12" });
  assert.deepEqual(result, {
    valid: true,
    routeEligible: false,
    status: "evidence_complete_pending_separate_approval",
    errors: []
  });
});

test("fails closed when lane, direction or physical measurement coverage is incomplete", () => {
  const record = validRecord();
  record.lane_id = "";
  record.measurement_coverage.right_edge_measured = false;
  record.measurement_coverage.both_sides_measured = false;
  const result = validateBridgeClearanceEvidence(record, { today: "2026-11-12" });
  assert.equal(result.valid, false);
  assert.equal(result.routeEligible, false);
  assert.equal(result.status, "unknown_not_verified");
  assert.ok(result.errors.some(error => error.includes("lane_id")));
  assert.ok(result.errors.some(error => error.includes("right_edge_measured")));
  assert.ok(result.errors.some(error => error.includes("both_sides_measured")));
});

test("requires centre measurement for passages longer than 20 metres", () => {
  const record = validRecord();
  record.passage_length_m = 20.01;
  const result = validateBridgeClearanceEvidence(record, { today: "2026-11-12" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("passages longer than 20 metres require a centre measurement"));
});

test("rejects imprecise, future-dated and unsigned evidence", () => {
  const record = validRecord();
  record.measurement_accuracy_cm = 1.01;
  record.measurement_date = "2026-11-13";
  record.approved_for_routing = true;
  const result = validateBridgeClearanceEvidence(record, { today: "2026-11-12" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("accuracy_cm")));
  assert.ok(result.errors.some(error => error.includes("measurement_date")));
  assert.ok(result.errors.includes("evidence records cannot grant routing approval"));
});

test("keeps posted sign clearance distinct from missing sign data", () => {
  const record = validRecord();
  record.posted_clearance_status = "unknown";
  record.posted_clearance_m = 4.4;
  const result = validateBridgeClearanceEvidence(record, { today: "2026-11-12" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("posted_clearance_m must be null when no posted value is confirmed"));
});

test("rejects malformed objects and non-HTTPS evidence references", () => {
  assert.equal(validateBridgeClearanceEvidence(null).valid, false);
  const record = validRecord();
  record.authority_reference = "http://example.org/authority";
  const result = validateBridgeClearanceEvidence(record, { today: "2026-11-12" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("authority_reference must be an HTTPS URL"));
});
