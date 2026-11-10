import test from "node:test";
import assert from "node:assert/strict";
import { decodeFlexiblePolyline } from "../../lib/road-restriction-geometry.mjs";
import { normalizePTVRouteResponse } from "../../lib/ptv-route-adapter.mjs";

const line = JSON.stringify({
  type: "LineString",
  coordinates: [[35.5, 32.84], [35.51, 32.83], [35.52, 32.82]]
});
const base = () => ({
  distance: 1500,
  travelTime: 180,
  violated: false,
  polyline: line,
  legs: [{ distance: 1500, travelTime: 180, violated: false, polyline: line }],
  events: [
    {
      latitude: 32.84, longitude: 35.5, distanceFromStart: 0,
      travelTimeFromStart: 0, countryCode: "IL", utcOffset: 120,
      maneuver: { type: "START", description: "התחל בנסיעה" }
    },
    {
      latitude: 32.82, longitude: 35.52, distanceFromStart: 1500,
      travelTimeFromStart: 180, countryCode: "IL", utcOffset: 120
    }
  ]
});

test("normalizes valid PTV GeoJSON route and leg geometry into TruckSafe flexible polylines", () => {
  const result = normalizePTVRouteResponse(base());
  assert.equal(result.safe, false);
  assert.equal(result.reason, "awaiting_independent_restriction_validation");
  assert.equal(result.providerFlagsClear, true);
  assert.equal(result.geometryFormatValidated, true);
  assert.equal(result.route.sections.length, 1);
  assert.equal(result.actions[0].instruction, "התחל בנסיעה");
  const points = decodeFlexiblePolyline(result.route.sections[0].polyline);
  assert.equal(points.length, 3);
  assert.ok(Math.abs(points[0][0] - 32.84) < 0.00001);
  assert.ok(Math.abs(points[2][1] - 35.52) < 0.00001);
});

test("blocks route-level and leg-level provider violations", () => {
  const routeViolation = base();
  routeViolation.violated = true;
  assert.equal(normalizePTVRouteResponse(routeViolation).safe, false);

  const legViolation = base();
  legViolation.legs[0].violated = true;
  assert.equal(normalizePTVRouteResponse(legViolation).safe, false);
});

test("blocks actual PTV nested violation event schema", () => {
  const payload = base();
  payload.events[1].violation = { type: "VEHICLE_PROPERTY", accessType: "ENTER" };
  assert.equal(normalizePTVRouteResponse(payload).reason, "provider_violation_events");
});

test("blocks the documented PTV violationType event field", () => {
  const payload = base();
  payload.events[1].violationType = "VEHICLE_PROPERTY";
  payload.events[1].accessType = "ENTER";
  assert.equal(normalizePTVRouteResponse(payload).reason, "provider_violation_events");
});

test("blocks absent or malformed route and leg geometry", () => {
  const missingRoute = base();
  delete missingRoute.polyline;
  assert.equal(normalizePTVRouteResponse(missingRoute).safe, false);

  const malformedLeg = base();
  malformedLeg.legs[0].polyline = "{bad-json";
  assert.equal(normalizePTVRouteResponse(malformedLeg).safe, false);

  const missingLeg = base();
  delete missingLeg.legs[0].polyline;
  assert.equal(normalizePTVRouteResponse(missingLeg).safe, false);
});

test("blocks geometry outside the supported Israel coordinate envelope", () => {
  const payload = base();
  payload.legs[0].polyline = JSON.stringify({
    type: "LineString",
    coordinates: [[35.5, 32.84], [35.51, 40.0]]
  });
  assert.equal(normalizePTVRouteResponse(payload).safe, false);
});

test("blocks warnings that can mean vehicle or map parameters were ignored", () => {
  const payload = base();
  payload.warnings = [{
    warningCode: "ROUTING_PARAMETER_INCONSISTENCY",
    description: "Vehicle parameters are inconsistent"
  }];
  assert.equal(normalizePTVRouteResponse(payload).reason, "provider_warning_requires_review");
});

test("allows only a non-safety maneuver-language warning", () => {
  const payload = base();
  payload.warnings = [{
    warningCode: "ROUTING_MANEUVERS_IN_DIFFERENT_LANGUAGE",
    description: "Fallback language used"
  }];
  assert.equal(normalizePTVRouteResponse(payload).safe, false);
  assert.equal(normalizePTVRouteResponse(payload).reason, "awaiting_independent_restriction_validation");
});

test("blocks malformed or non-Israeli provider events", () => {
  const nonIsraeli = base();
  nonIsraeli.events[0].countryCode = "US";
  assert.equal(normalizePTVRouteResponse(nonIsraeli).reason, "malformed_event");

  const missingCoordinates = base();
  delete missingCoordinates.events[0].latitude;
  assert.equal(normalizePTVRouteResponse(missingCoordinates).reason, "malformed_event");

  const outOfBounds = base();
  outOfBounds.events[0].longitude = 40;
  assert.equal(normalizePTVRouteResponse(outOfBounds).reason, "malformed_event");
});
