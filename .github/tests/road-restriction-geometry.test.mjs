import test from "node:test";
import assert from "node:assert/strict";
import { encodePTVCoordinatesAsFlexiblePolyline } from "../../lib/ptv-route-adapter.mjs";
import {
  decodeFlexiblePolyline,
  routePassesNearRestriction,
  isRestrictionVerificationFresh,
  evaluateFleetRestrictions
} from "../../lib/road-restriction-geometry.mjs";

const coordinates = [[32.84, 35.50], [32.84, 35.51], [32.84, 35.52]];
const polyline = encodePTVCoordinatesAsFlexiblePolyline(coordinates);
const sections = [{ polyline, summary: { length: 1800, duration: 180 } }];
const now = new Date("2026-11-09T12:00:00.000Z");

const verifiedRestriction = overrides => ({
  id: "restriction-1",
  road_name: "Test road",
  latitude: 32.84,
  longitude: 35.505,
  radius_m: 75,
  is_active: true,
  verification_status: "verified",
  source_url: "https://example.org/official-notice",
  verified_at: "2026-11-07T12:00:00.000Z",
  verified_by: "reviewer-1",
  source_last_checked_at: "2026-11-08T12:00:00.000Z",
  verification_note: "Verified test fixture",
  restriction_type: "height",
  max_height_m: 4,
  ...overrides
});

const vehicle = { heightCm: 420, widthCm: 250, lengthCm: 900 };

test("decodes the PTV adapter polyline and preserves Israel coordinates", () => {
  const decoded = decodeFlexiblePolyline(polyline);
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[0][0] - 32.84) < 0.00001);
  assert.ok(Math.abs(decoded[2][1] - 35.52) < 0.00001);
});

test("detects a route near a restriction and ignores a distant restriction", () => {
  assert.equal(routePassesNearRestriction(sections, verifiedRestriction({})), true);
  assert.equal(routePassesNearRestriction(sections, verifiedRestriction({
    latitude: 32.85, longitude: 35.505
  })), false);
});

test("fails closed when restriction location or route geometry is invalid", () => {
  assert.equal(routePassesNearRestriction(sections, verifiedRestriction({ latitude: null })), null);
  assert.equal(routePassesNearRestriction([{ polyline: "invalid" }], verifiedRestriction({})), null);
});

test("detects a route passing near a linear restriction segment", () => {
  const segment = verifiedRestriction({
    latitude: null, longitude: null,
    start_latitude: 32.839, start_longitude: 35.505,
    end_latitude: 32.841, end_longitude: 35.505
  });
  assert.equal(routePassesNearRestriction(sections, segment), true);
});

test("rejects incomplete or out-of-Israel linear restriction geometry", () => {
  assert.equal(routePassesNearRestriction(sections, verifiedRestriction({
    latitude: null, longitude: null,
    start_latitude: 32.839, start_longitude: 35.505,
    end_latitude: null, end_longitude: null
  })), null);
  assert.equal(routePassesNearRestriction(sections, verifiedRestriction({
    latitude: null, longitude: null,
    start_latitude: 40, start_longitude: 35,
    end_latitude: 32.841, end_longitude: 35.505
  })), null);
});

test("uses exact segment distance for parallel restrictions near the route", () => {
  const nearSegment = verifiedRestriction({
    latitude: null, longitude: null,
    start_latitude: 32.84018, start_longitude: 35.501,
    end_latitude: 32.84018, end_longitude: 35.519
  });
  const farSegment = verifiedRestriction({
    latitude: null, longitude: null,
    start_latitude: 32.842, start_longitude: 35.501,
    end_latitude: 32.842, end_longitude: 35.519
  });
  assert.equal(routePassesNearRestriction(sections, nearSegment), true);
  assert.equal(routePassesNearRestriction(sections, farSegment), false);
});

test("accepts recent verification and rejects stale or future verification timestamps", () => {
  assert.equal(isRestrictionVerificationFresh(verifiedRestriction({}), now), true);
  assert.equal(isRestrictionVerificationFresh(verifiedRestriction({
    source_last_checked_at: "2026-10-01T12:00:00.000Z"
  }), now), false);
  assert.equal(isRestrictionVerificationFresh(verifiedRestriction({
    source_last_checked_at: "2026-11-09T12:10:00.000Z"
  }), now), false);
});

test("blocks a nearby verified height restriction that the truck exceeds", () => {
  const result = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({})],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(result.validated, false);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].restrictionType, "height");
});

test("does not reject a route for a distant, verified restriction", () => {
  const distant = verifiedRestriction({ latitude: 32.85, longitude: 35.505 });
  const result = evaluateFleetRestrictions({
    sections,
    restrictions: [distant],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(result.validated, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unresolved, []);
});

test("allows an empty restriction catalogue only when the database query succeeded", () => {
  const result = evaluateFleetRestrictions({
    sections,
    restrictions: [],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(result.validated, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unresolved, []);
});

test("fails closed when the restriction catalogue is unavailable or was not loaded", () => {
  for (const restrictions of [undefined, null, []]) {
    const result = evaluateFleetRestrictions({
      sections,
      restrictions,
      restrictionCatalogLoaded: false,
      vehicle,
      currentWeightKg: 10000,
      now
    });
    assert.equal(result.validated, false);
    assert.equal(result.unresolved[0].reason, "restriction_catalog_unavailable");
  }
});

test("fails closed when the truck profile or current weight is incomplete", () => {
  const missingDimension = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({})],
    restrictionCatalogLoaded: true,
    vehicle: { ...vehicle, heightCm: null },
    currentWeightKg: 10000,
    now
  });
  assert.equal(missingDimension.validated, false);
  assert.equal(missingDimension.unresolved[0].reason, "vehicle_profile_incomplete");

  const missingWeight = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({})],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: NaN,
    now
  });
  assert.equal(missingWeight.validated, false);
  assert.equal(missingWeight.unresolved[0].reason, "vehicle_profile_incomplete");
});

test("fails closed when an active catalogue record is unverified or has an invalid limit", () => {
  const unverified = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({ verification_status: "pending" })],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(unverified.validated, false);
  assert.equal(unverified.unresolved[0].reason, "restriction_not_verified");

  const invalidLimit = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({ max_height_m: "unknown" })],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(invalidLimit.validated, false);
  assert.equal(invalidLimit.unresolved[0].reason, "missing_or_invalid_restriction_limit");
});

test("ignores an expired restriction after validating its review record", () => {
  const result = evaluateFleetRestrictions({
    sections,
    restrictions: [verifiedRestriction({ expires_at: "2026-11-08T12:00:00.000Z" })],
    restrictionCatalogLoaded: true,
    vehicle,
    currentWeightKg: 10000,
    now
  });
  assert.equal(result.validated, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unresolved, []);
});
