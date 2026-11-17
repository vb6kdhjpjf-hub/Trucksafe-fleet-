import test from "node:test";
import assert from "node:assert/strict";
import { isValidIsraelGpsPoint, pruneInactiveTripHistory } from "../../lib/map-location-safety.mjs";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const validPoint = {
  latitude: 32.8,
  longitude: 35.5,
  recorded_at: "2026-11-17T11:59:00.000Z"
};

test("accepts a timestamped GPS point inside Israel bounds", () => {
  assert.equal(isValidIsraelGpsPoint(validPoint, now), true);
});

test("rejects coordinates outside the Israel operating bounds", () => {
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, latitude: 40 }, now), false);
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, longitude: 33.9 }, now), false);
});

test("rejects missing, malformed, and future GPS timestamps beyond clock skew", () => {
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, recorded_at: null }, now), false);
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, recorded_at: "not-a-date" }, now), false);
  assert.equal(isValidIsraelGpsPoint({
    ...validPoint, recorded_at: "2026-11-17T12:00:30.001Z"
  }, now), false);
  assert.equal(isValidIsraelGpsPoint({
    ...validPoint, recorded_at: "2026-11-17T12:00:30.000Z"
  }, now), true);
});

test("prunes cached GPS history for trips that are no longer active", () => {
  const cache = new Map([
    ["active-trip", [{ latitude: 32.8, longitude: 35.5 }]],
    ["completed-trip", [{ latitude: 32.7, longitude: 35.4 }]]
  ]);
  const removed = pruneInactiveTripHistory(cache, new Set(["active-trip"]));
  assert.equal(removed, 1);
  assert.equal(cache.has("active-trip"), true);
  assert.equal(cache.has("completed-trip"), false);
});

test("does not mutate a cache when inputs are not valid collections", () => {
  const cache = new Map([["trip", []]]);
  assert.equal(pruneInactiveTripHistory(cache, []), 0);
  assert.equal(cache.size, 1);
});
