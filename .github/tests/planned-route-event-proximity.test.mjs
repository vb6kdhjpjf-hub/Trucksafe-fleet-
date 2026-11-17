import test from "node:test";
import assert from "node:assert/strict";
import { getEventPositionOnPlannedRoute } from "../../lib/planned-route-event-proximity.mjs";

const route = {
  kind: "planned_route",
  coordinateOrder: "origin_to_destination",
  providerId: "synthetic-route-fixture",
  routeId: "synthetic-route-001",
  fetchedAt: new Date(Date.now() - 60_000).toISOString(),
  coordinates: [
    { latitude: 32.8000, longitude: 35.5000 },
    { latitude: 32.8100, longitude: 35.5000 },
    { latitude: 32.8200, longitude: 35.5000 }
  ]
};

test("matches an event to an explicitly ordered planned route", () => {
  const result = getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5002 }, route, 0.5
  );
  assert.ok(result);
  assert.ok(result.distanceToRouteKm < 0.03);
  assert.ok(result.distanceAlongRouteKm > 1);
  assert.equal(result.routeProgressKnown, true);
  assert.equal(result.isAhead, true);
});

test("does not call an event ahead when it is behind known route progress", () => {
  const result = getEventPositionOnPlannedRoute(
    { latitude: 32.8050, longitude: 35.5000 }, route, 1.5
  );
  assert.ok(result);
  assert.equal(result.isAhead, false);
  assert.ok(result.distanceFromProgressKm < 0);
});

test("does not infer direction or ahead/behind without route progress", () => {
  const result = getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5000 }, route
  );
  assert.ok(result);
  assert.equal(result.routeProgressKnown, false);
  assert.equal(result.isAhead, null);
  assert.equal(result.distanceFromProgressKm, null);
});

test("rejects events outside the route corridor", () => {
  assert.equal(getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5300 }, route, 0.5
  ), null);
});

test("rejects GPS history-like, malformed, and out-of-bounds route inputs", () => {
  assert.equal(getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5000 }, { kind: "planned_route", coordinateOrder: "origin_to_destination", coordinates: [] }, 0
  ), null);
  assert.equal(getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5000 },
    { kind: "planned_route", coordinateOrder: "origin_to_destination", coordinates: [{ latitude: 32.8, longitude: 35.5 }, { latitude: 35, longitude: 35.5 }] }, 0
  ), null);
  assert.equal(getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5000 }, route, 0, 30
  ), null);
});

test("rejects progress outside the planned route length", () => {
  const result = getEventPositionOnPlannedRoute(
    { latitude: 32.8150, longitude: 35.5000 }, route, 999
  );
  assert.ok(result);
  assert.equal(result.routeProgressKnown, false);
  assert.equal(result.isAhead, null);
});

test("fails closed when an event matches two distant positions at a route crossing", () => {
  const crossingRoute = {
    ...route,
    kind: "planned_route",
    coordinateOrder: "origin_to_destination",
    coordinates: [
      { latitude: 32.8000, longitude: 35.5000 },
      { latitude: 32.8200, longitude: 35.5200 },
      { latitude: 32.8000, longitude: 35.5200 },
      { latitude: 32.8200, longitude: 35.5000 }
    ]
  };
  assert.equal(getEventPositionOnPlannedRoute(
    { latitude: 32.8100, longitude: 35.5100 }, crossingRoute, 0.2
  ), null);
});

test("rejects GPS history and routes without explicit origin-to-destination ordering", () => {
  const gpsHistory = { kind: "gps_history", coordinates: route.coordinates };
  const unorderedRoute = { kind: "planned_route", coordinates: route.coordinates };
  const reverseOrUnknownRoute = {
    kind: "planned_route", coordinateOrder: "unknown", coordinates: route.coordinates
  };
  const event = { latitude: 32.8150, longitude: 35.5000 };
  assert.equal(getEventPositionOnPlannedRoute(event, gpsHistory, 0.5), null);
  assert.equal(getEventPositionOnPlannedRoute(event, unorderedRoute, 0.5), null);
  assert.equal(getEventPositionOnPlannedRoute(event, reverseOrUnknownRoute, 0.5), null);
});

test("rejects stale, future-dated, or unidentified planned-route sources", () => {
  const event = { latitude: 32.8150, longitude: 35.5000 };
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  const fresh = {
    ...route,
    fetchedAt: "2026-11-17T11:59:00.000Z"
  };
  assert.ok(getEventPositionOnPlannedRoute(event, fresh, 0.5, 2, now));
  assert.equal(getEventPositionOnPlannedRoute(event, {
    ...fresh, fetchedAt: "2026-11-17T11:30:00.000Z"
  }, 0.5, 2, now), null);
  assert.equal(getEventPositionOnPlannedRoute(event, {
    ...fresh, fetchedAt: "2026-11-17T12:01:00.000Z"
  }, 0.5, 2, now), null);
  assert.equal(getEventPositionOnPlannedRoute(event, {
    ...fresh, providerId: ""
  }, 0.5, 2, now), null);
  assert.equal(getEventPositionOnPlannedRoute(event, {
    ...fresh, routeId: ""
  }, 0.5, 2, now), null);
});
