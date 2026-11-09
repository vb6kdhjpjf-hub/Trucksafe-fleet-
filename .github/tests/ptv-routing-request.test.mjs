import test from "node:test";
import assert from "node:assert/strict";
import { buildPTVRoutingRequest, getPTVRequiredRouteResults } from "../../lib/ptv-routing-request.mjs";

const origin = { lat: 32.84, lng: 35.50 };
const destination = { lat: 32.80, lng: 35.52 };

test("builds PTV route request with two Israeli waypoints and safety results", () => {
  const request = buildPTVRoutingRequest({
    origin, destination, profile: "EUR_TRAILER_TRUCK", apiKey: "private-key"
  });
  const url = new URL(request.url);
  assert.equal(url.origin, "https://api.myptv.com");
  assert.equal(url.pathname, "/routing/v1/routes");
  assert.deepEqual(url.searchParams.getAll("waypoints"), ["32.84,35.5", "32.8,35.52"]);
  assert.equal(url.searchParams.get("profile"), "EUR_TRAILER_TRUCK");
  assert.equal(url.searchParams.get("options[trafficMode]"), "AVERAGE");
  assert.deepEqual(url.searchParams.get("results").split(","), [
    "POLYLINE", "LEGS_POLYLINE", "MANEUVER_EVENTS", "VIOLATION_EVENTS_POLYLINE"
  ]);
  assert.equal(url.searchParams.has("apiKey"), false);
  assert.equal(request.headers.ApiKey, "private-key");
});

test("does not guess a regional profile", () => {
  assert.throws(() => buildPTVRoutingRequest({ origin, destination, apiKey: "key" }), /explicit supported PTV vehicle profile/);
});

test("rejects coordinates outside Israel or malformed coordinates", () => {
  assert.throws(() => buildPTVRoutingRequest({
    origin: { lat: 40, lng: 35 }, destination, profile: "EUR_TRAILER_TRUCK", apiKey: "key"
  }), /validated Israeli coordinates/);
  assert.throws(() => buildPTVRoutingRequest({
    origin: { lat: "32.8", lng: 35 }, destination, profile: "EUR_TRAILER_TRUCK", apiKey: "key"
  }), /validated Israeli coordinates/);
});

test("rejects empty profile and missing key", () => {
  assert.throws(() => buildPTVRoutingRequest({ origin, destination, profile: " ", apiKey: "key" }));
  assert.throws(() => buildPTVRoutingRequest({ origin, destination, profile: "EUR_TRAILER_TRUCK", apiKey: "" }));
});

test("returns a defensive copy of required result flags", () => {
  const first = getPTVRequiredRouteResults();
  first.pop();
  assert.equal(getPTVRequiredRouteResults().length, 4);
});
