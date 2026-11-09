import test from "node:test";
import assert from "node:assert/strict";
import { assessPTVRouteSafety } from "../../lib/ptv-route-safety.mjs";

const safeResponse = () => ({
  distance: 12500,
  travelTime: 900,
  violated: false,
  legs: [{ distance: 12500, travelTime: 900, violated: false }],
  events: [{ latitude: 32.84, longitude: 35.5, distanceFromStart: 100, travelTimeFromStart: 10 }]
});

test("keeps route blocked even when provider flags are clear until geometry is validated", () => {
  assert.deepEqual(assessPTVRouteSafety(safeResponse()), {
    valid: true, safe: false, providerFlagsClear: true, reason: "geometry_not_validated",
    distanceMeters: 12500, durationSeconds: 900, eventCount: 1
  });
});

test("blocks a route-level violated flag", () => {
  const result = assessPTVRouteSafety({ ...safeResponse(), violated: true });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "provider_route_violated");
});

test("blocks any violated leg even when route-level flag is false", () => {
  const result = assessPTVRouteSafety({
    ...safeResponse(),
    legs: [{ distance: 12500, travelTime: 900, violated: true }]
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "provider_leg_violated");
});

test("blocks violation-specific events", () => {
  const result = assessPTVRouteSafety({
    ...safeResponse(),
    events: [{ type: "VIOLATION", violation: { violationType: "PROHIBITED" } }]
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "provider_violation_events");
});

test("blocks the documented PTV violationType field", () => {
  const result = assessPTVRouteSafety({ ...safeResponse(), events: [{ violationType: "VEHICLE_PROPERTY" }] });
  assert.equal(result.reason, "provider_violation_events");
});

test("fails closed for missing legs, events, summary, or malformed event data", () => {
  assert.equal(assessPTVRouteSafety(null).reason, "malformed_response");
  assert.equal(assessPTVRouteSafety({ ...safeResponse(), legs: [] }).reason, "missing_legs");
  assert.equal(assessPTVRouteSafety({ ...safeResponse(), events: null }).reason, "missing_events");
  assert.equal(assessPTVRouteSafety({ ...safeResponse(), distance: "12500" }).reason, "missing_or_invalid_route_summary");
  assert.equal(assessPTVRouteSafety({ ...safeResponse(), events: [null] }).reason, "malformed_event");
});

test("does not interpret an incomplete leg as safe", () => {
  assert.equal(assessPTVRouteSafety({
    ...safeResponse(), legs: [{ distance: 12500, travelTime: 900 }]
  }).reason, "malformed_leg");
});
