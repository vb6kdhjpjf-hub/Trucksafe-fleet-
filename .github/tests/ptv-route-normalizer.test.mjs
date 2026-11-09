import test from "node:test";
import assert from "node:assert/strict";
import { normalizePTVRouteResponse, encodeFlexiblePolyline } from "../../lib/ptv-route-normalizer.mjs";
import { decodeFlexiblePolyline } from "../../lib/road-restriction-geometry.mjs";

const geoJson = {
  type: "LineString",
  coordinates: [
    [35.50, 32.84],
    [35.51, 32.83],
    [35.52, 32.82]
  ]
};

const response = () => ({
  distance: 12500,
  travelTime: 900,
  violated: false,
  polyline: JSON.stringify(geoJson),
  legs: [{ distance: 12500, travelTime: 900, violated: false, polyline: JSON.stringify(geoJson) }],
  events: []
});

test("normalizes PTV VECTOR GeoJSON into TruckSafe flexible-polyline sections", () => {
  const result = normalizePTVRouteResponse(response());
  assert.equal(result.safe, true);
  assert.equal(result.route.sections.length, 1);
  assert.equal(result.route.sections[0].summary.length, 12500);
  assert.equal(result.route.sections[0].summary.duration, 900);
  const decoded = decodeFlexiblePolyline(result.route.sections[0].polyline);
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[0][0] - 32.84) < 0.00001);
  assert.ok(Math.abs(decoded[0][1] - 35.50) < 0.00001);
});

test("accepts a single-feature GeoJSON FeatureCollection", () => {
  const payload = response();
  payload.polyline = JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: geoJson }]
  });
  assert.equal(normalizePTVRouteResponse(payload).safe, true);
});

test("fails closed for unsupported geometry types and multiple features", () => {
  const multiLine = response();
  multiLine.polyline = JSON.stringify({ type: "MultiLineString", coordinates: [geoJson.coordinates] });
  assert.equal(normalizePTVRouteResponse(multiLine).reason, "invalid_or_unsupported_route_geometry");

  const multiple = response();
  multiple.polyline = JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: geoJson },
      { type: "Feature", geometry: geoJson }
    ]
  });
  assert.equal(normalizePTVRouteResponse(multiple).safe, false);
});

test("fails closed for coordinates outside Israel, malformed JSON, and too few points", () => {
  const outside = response();
  outside.polyline = JSON.stringify({ type: "LineString", coordinates: [[-0.1, 51.5], [0, 51.6]] });
  assert.equal(normalizePTVRouteResponse(outside).safe, false);

  const malformed = response();
  malformed.polyline = "{not-json";
  assert.equal(normalizePTVRouteResponse(malformed).safe, false);

  const short = response();
  short.polyline = JSON.stringify({ type: "LineString", coordinates: [[35.5, 32.8]] });
  assert.equal(normalizePTVRouteResponse(short).safe, false);
});

test("never normalizes provider-violated routes or legs", () => {
  const routeViolation = response();
  routeViolation.violated = true;
  assert.equal(normalizePTVRouteResponse(routeViolation).reason, "provider_route_violated");

  const legViolation = response();
  legViolation.legs[0].violated = true;
  assert.equal(normalizePTVRouteResponse(legViolation).reason, "provider_leg_violated");
});

test("never normalizes responses with missing leg or event data", () => {
  const noLegs = response();
  noLegs.legs = [];
  assert.equal(normalizePTVRouteResponse(noLegs).reason, "missing_legs");

  const noEvents = response();
  noEvents.events = undefined;
  assert.equal(normalizePTVRouteResponse(noEvents).reason, "missing_events");
});

test("flexible polyline encoder rejects invalid coordinates", () => {
  assert.throws(() => encodeFlexiblePolyline([[35.5, 32.8]]), /coordinate count/);
  assert.throws(() => encodeFlexiblePolyline([[35.5, 32.8], [36.5, 32.9]]), /outside/);
});
