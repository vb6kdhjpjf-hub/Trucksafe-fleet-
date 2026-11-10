import test from "node:test";
import assert from "node:assert/strict";
import { buildPTVRoutingRequest, getPTVRequiredRouteResults } from "../../lib/ptv-routing-request.mjs";

const origin = { lat: 32.84, lng: 35.50 };
const destination = { lat: 32.80, lng: 35.52 };
const vehicle = {
  height: 400, width: 254, length: 1200,
  emptyWeight: 9000, loadWeight: 6000,
  totalPermittedWeight: 18000, totalTechnicallyPermittedWeight: 18000,
  numberOfAxles: 4, numberOfTrailers: 0, axleWeight: 9000
};

test("builds PTV route request with two Israeli waypoints, safety results and vehicle overrides", () => {
  const request = buildPTVRoutingRequest({
    origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "private-key", vehicle
  });
  const url = new URL(request.url);
  assert.equal(url.origin, "https://api.myptv.com");
  assert.equal(url.pathname, "/routing/v1/routes");
  assert.deepEqual(url.searchParams.getAll("waypoints"), ["32.84,35.5", "32.8,35.52"]);
  assert.equal(url.searchParams.get("profile"), "IMEA_TRUCK_40T");
  assert.equal(url.searchParams.get("options[trafficMode]"), "AVERAGE");
  assert.equal(url.searchParams.get("options[polylineMapType]"), "VECTOR");
  assert.deepEqual(url.searchParams.get("results").split(","), [
    "POLYLINE", "LEGS_POLYLINE", "MANEUVER_EVENTS", "VIOLATION_EVENTS", "VIOLATION_EVENTS_POLYLINE"
  ]);
  for (const [key, value] of Object.entries(vehicle)) {
    assert.equal(url.searchParams.get(`vehicle[${key}]`), String(value));
  }
  assert.equal(url.searchParams.has("apiKey"), false);
  assert.equal(request.headers.ApiKey, "private-key");
});

test("does not guess a regional profile or omit the validated vehicle", () => {
  assert.throws(() => buildPTVRoutingRequest({ origin, destination, apiKey: "key", vehicle }), /explicit supported PTV vehicle profile/);
  assert.throws(() => buildPTVRoutingRequest({ origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "key" }), /validated PTV vehicle parameter object/);
});

test("rejects coordinates outside Israel or malformed coordinates", () => {
  assert.throws(() => buildPTVRoutingRequest({
    origin: { lat: 40, lng: 35 }, destination, profile: "IMEA_TRUCK_40T", apiKey: "key", vehicle
  }), /validated Israeli coordinates/);
  assert.throws(() => buildPTVRoutingRequest({
    origin: { lat: "32.8", lng: 35 }, destination, profile: "IMEA_TRUCK_40T", apiKey: "key", vehicle
  }), /validated Israeli coordinates/);
});

test("rejects unknown or invalid vehicle parameters", () => {
  assert.throws(() => buildPTVRoutingRequest({
    origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "key", vehicle: { ...vehicle, height: 700 }
  }), /Invalid PTV vehicle parameter/);
  assert.throws(() => buildPTVRoutingRequest({
    origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "key", vehicle: { ...vehicle, unreviewedField: 1 }
  }), /Invalid PTV vehicle parameter/);
});

test("rejects inconsistent actual and permitted vehicle weights", () => {
  assert.throws(() => buildPTVRoutingRequest({
    origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "key",
    vehicle: { ...vehicle, loadWeight: 12000 }
  }), /weight parameters are inconsistent/);
});

test("rejects missing key", () => {
  assert.throws(() => buildPTVRoutingRequest({
    origin, destination, profile: "IMEA_TRUCK_40T", apiKey: "", vehicle
  }), /Missing PTV API key/);
});

test("returns a defensive copy of required result flags", () => {
  const first = getPTVRequiredRouteResults();
  first.pop();
  assert.equal(getPTVRequiredRouteResults().length, 5);
});
