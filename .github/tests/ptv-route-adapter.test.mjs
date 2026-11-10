import test from "node:test";
import assert from "node:assert/strict";
import { normalizePTVRouteResponse } from "../../lib/ptv-route-adapter.mjs";
import { decodeFlexiblePolyline } from "../../lib/road-restriction-geometry.mjs";

const geoJson = JSON.stringify({
  type: "LineString",
  coordinates: [[35.50, 32.84], [35.51, 32.83], [35.52, 32.82]]
});

const payload = () => ({
  distance: 12500,
  travelTime: 900,
  violated: false,
  polyline: geoJson,
  legs: [{
    distance: 12500,
    travelTime: 900,
    violated: false,
    polyline: geoJson
  }],
  events: []
});

test("normalizes PTV VECTOR GeoJSON route and leg polylines to TruckSafe geometry", () => {
  const result = normalizePTVRouteResponse(payload());
  assert.equal(result.safe, true);
  assert.equal(result.route.sections.length, 1);
  assert.equal(result.route.sections[0].summary.length, 12500);
  assert.equal(result.route.sections[0].summary.duration, 900);
  const coordinates = decodeFlexiblePolyline(result.route.sections[0].polyline);
  assert.equal(coordinates.length, 3);
  assert.ok(Math.abs(coordinates[0][0] - 32.84) < 0.00001);
  assert.ok(Math.abs(coordinates[0][1] - 35.50) < 0.00001);
});

test("normalizes a GeoJSON Feature polyline", () => {
  const result = payload();
  result.polyline = JSON.stringify({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: [[35.5, 32.84], [35.51, 32.83]] }
  });
  result.legs[0].polyline = result.polyline;
  assert.equal(normalizePTVRouteResponse(result).safe, true);
});

test("fails closed for unsupported or malformed route geometry", () => {
  const malformed = payload();
  malformed.polyline = "{bad-json";
  assert.equal(normalizePTVRouteResponse(malformed).safe, false);

  const unsupported = payload();
  unsupported.polyline = JSON.stringify({ type: "MultiLineString", coordinates: [[[35.5, 32.84], [35.51, 32.83]]] });
  assert.equal(normalizePTVRouteResponse(unsupported).safe, false);

  const outside = payload();
  outside.polyline = JSON.stringify({ type: "LineString", coordinates: [[-0.1, 51.5], [0, 51.6]] });
  assert.equal(normalizePTVRouteResponse(outside).safe, false);
});

test("fails closed for missing or malformed leg geometry and summaries", () => {
  const missing = payload();
  missing.legs[0].polyline = undefined;
  assert.equal(normalizePTVRouteResponse(missing).reason, "malformed_ptv_leg");

  const badSummary = payload();
  badSummary.legs[0].distance = -1;
  assert.equal(normalizePTVRouteResponse(badSummary).reason, "malformed_ptv_leg");
});

test("blocks provider route and leg violations before normalization", () => {
  const routeViolation = payload();
  routeViolation.violated = true;
  assert.equal(normalizePTVRouteResponse(routeViolation).reason, "provider_route_violated");

  const legViolation = payload();
  legViolation.legs[0].violated = true;
  assert.equal(normalizePTVRouteResponse(legViolation).reason, "provider_leg_violated");
});

test("blocks violation events and provider warnings requiring review", () => {
  const violation = payload();
  violation.events = [{ violation: { type: "VEHICLE_PROPERTY" } }];
  assert.equal(normalizePTVRouteResponse(violation).reason, "provider_violation_events");

  const warning = payload();
  warning.warnings = [{ warningCode: "ROUTING_PARAMETER_IGNORED", description: "A truck parameter was ignored" }];
  assert.equal(normalizePTVRouteResponse(warning).reason, "provider_warning_requires_review");
});

test("fails closed for missing route event data", () => {
  const missing = payload();
  missing.events = undefined;
  assert.equal(normalizePTVRouteResponse(missing).reason, "missing_events");
});
