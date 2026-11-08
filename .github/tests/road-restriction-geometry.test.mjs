import test from "node:test";
import assert from "node:assert/strict";
import { decodeFlexiblePolyline, routePassesNearRestriction, evaluateFleetRestrictions, selectSafeTruckRoute } from "../../lib/road-restriction-geometry.mjs";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeUnsigned(value) {
  let out = "";
  while (value > 0x1f) { out += alphabet[(value & 0x1f) | 0x20]; value >>>= 5; }
  return out + alphabet[value];
}
function encodeSigned(value) { return encodeUnsigned(value < 0 ? ~(value << 1) : value << 1); }
function encodePolyline(points, precision = 5) {
  let out = encodeUnsigned(1) + encodeUnsigned(precision);
  let lat = 0, lng = 0;
  for (const [a,b] of points) {
    const nextLat = Math.round(a * 10 ** precision);
    const nextLng = Math.round(b * 10 ** precision);
    out += encodeSigned(nextLat-lat) + encodeSigned(nextLng-lng);
    lat = nextLat; lng = nextLng;
  }
  return out;
}
const route = (points) => [{ polyline: encodePolyline(points), summary: { length: 100, duration: 0 } }];
const vehicle = { heightCm: 420, widthCm: 250, lengthCm: 900 };
const verified = {
  id: "r1", road_name: "Bridge A", is_active: true, verification_status: "verified", verified_at: "2026-11-01T00:00:00Z", source_last_checked_at: "2026-11-01T00:00:00Z", verification_note: "Checked official notice and verified all restriction fields.", verified_by: "00000000-0000-4000-8000-000000000001",
  source_url: "https://example.gov.il/restriction", restriction_type: "height",
  max_height_m: 4.0, latitude: 32.0, longitude: 34.8, radius_m: 100
};

test("decodes a flexible polyline into WGS84 coordinates", () => {
  const points = [[32.0,34.8],[32.001,34.801]];
  assert.deepEqual(decodeFlexiblePolyline(encodePolyline(points)), points.map(p=>p.map(v=>Math.round(v*1e5)/1e5)));
});

test("decodes HERE's published 2D flexible polyline example", () => {
  const decoded = decodeFlexiblePolyline("BFoz5xJ67i1B1B7PzIhaxL7Y");
  assert.deepEqual(decoded, [
    [50.10228, 8.69821],
    [50.10201, 8.69567],
    [50.10063, 8.6915],
    [50.09878, 8.68752]
  ]);
});

test("decodes HERE's published 3D flexible polyline example", () => {
  const decoded = decodeFlexiblePolyline("BlBoz5xJ67i1BU1B7PUzIhaUxL7YU");
  assert.deepEqual(decoded, [
    [50.10228, 8.69821, 10],
    [50.10201, 8.69567, 20],
    [50.10063, 8.6915, 30],
    [50.09878, 8.68752, 40]
  ]);
});

test("detects route proximity to a restriction geofence", () => {
  assert.equal(routePassesNearRestriction(route([[31.999,34.8],[32.001,34.8]]), verified), true);
  assert.equal(routePassesNearRestriction(route([[32.1,34.8],[32.101,34.8]]), verified), false);
});

test("flags a verified height restriction that conflicts with the truck", () => {
  const result = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions: [verified], vehicle, currentWeightKg: 18000, now: new Date("2026-11-08T10:00:00Z") });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.validated, false);
});

test("does not trust an unverified restriction even when it has a source URL", () => {
  const result = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions: [{...verified, verification_status:"unverified"}], vehicle, currentWeightKg: 18000, now: new Date("2026-11-08T10:00:00Z") });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.validated, false);
});

test("flags active closed roads and ignores inactive dates", () => {
  const closed = {...verified, restriction_type:"closed", max_height_m:null};
  const active = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions:[closed], vehicle, currentWeightKg:18000, now:new Date("2026-11-08T10:00:00Z") });
  const expired = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions:[{...closed,active_until:"2026-11-07"}], vehicle, currentWeightKg:18000, now:new Date("2026-11-08T10:00:00Z") });
  assert.equal(active.conflicts.length,1);
  assert.equal(expired.conflicts.length,0);
});

test("treats a one-point route geometry as unresolved instead of safe", () => {
  const incompleteRoute = [{ polyline: encodePolyline([[32.1,34.8]]), summary: { duration: 60 } }];
  const result = evaluateFleetRestrictions({
    sections: incompleteRoute,
    restrictions: [verified],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.validated, false);
});

test("treats missing coordinates as unresolved instead of assuming safe", () => {
  const result = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions:[{...verified,latitude:null,longitude:null}], vehicle, currentWeightKg:18000, now:new Date("2026-11-08T10:00:00Z") });
  assert.equal(result.unresolved.length,1);
  assert.equal(result.validated,false);
});

test("does not treat an incomplete verified limit as clear", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, max_height_m: null }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.validated, false);
});

test("rejects verification without trusted timestamp and reviewer identity", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, verified_by: null }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.conflicts.length, 0);
});


test("enforces a daytime restriction using Israel local time", () => {
  const timeRestriction = {
    ...verified,
    restriction_type: "time_window",
    valid_from: "02:00:00",
    valid_until: "04:00:00"
  };
  const during = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [timeRestriction],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T00:30:00Z")
  });
  const outside = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [timeRestriction],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T03:30:00Z")
  });
  assert.equal(during.conflicts.length, 1);
  assert.equal(outside.conflicts.length, 0);
});

test("supports time windows that cross midnight in Israel local time", () => {
  const timeRestriction = {
    ...verified,
    restriction_type: "time_window",
    valid_from: "22:00:00",
    valid_until: "06:00:00"
  };
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [timeRestriction],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T00:30:00Z")
  });
  assert.equal(result.conflicts.length, 1);
});


test("treats a partial time schedule with only a start time as unresolved", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, valid_from: "12:00:00", valid_until: null }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.validated, false);
});

test("treats a partial time schedule with only an end time as unresolved", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, valid_from: null, valid_until: "12:00:00" }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.validated, false);
});

test("flags a time-window restriction with missing hours as unresolved", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, restriction_type: "time_window", valid_from: null, valid_until: null }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.validated, false);
});


test("evaluates a restriction that becomes active during the estimated route", () => {
  const scheduled = {
    ...verified,
    restriction_type: "time_window",
    valid_from: "03:00:00",
    valid_until: "04:00:00"
  };
  const result = evaluateFleetRestrictions({
    sections: [{ ...route([[31.999,34.8],[32.001,34.8]])[0], summary: { duration: 7200 } }],
    restrictions: [scheduled],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T00:30:00Z")
  });
  assert.equal(result.conflicts.length, 1);
});

test("detects a sub-minute restriction between route minute samples", () => {
  const scheduled = {
    ...verified,
    restriction_type: "time_window",
    valid_from: "02:30:10",
    valid_until: "02:30:20"
  };
  const result = evaluateFleetRestrictions({
    sections: [{ ...route([[31.999,34.8],[32.001,34.8]])[0], summary: { duration: 60 } }],
    restrictions: [scheduled],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T00:29:50Z")
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.validated, false);
});

test("does not block a time-window restriction after the route has passed its active period", () => {
  const scheduled = {
    ...verified,
    restriction_type: "time_window",
    valid_from: "01:00:00",
    valid_until: "02:00:00"
  };
  const result = evaluateFleetRestrictions({
    sections: [{ ...route([[31.999,34.8],[32.001,34.8]])[0], summary: { duration: 1800 } }],
    restrictions: [scheduled],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T03:00:00Z")
  });
  assert.equal(result.conflicts.length, 0);
});

test("fails closed when route duration cannot be evaluated safely", () => {
  const result = evaluateFleetRestrictions({
    sections: [{ ...route([[31.999,34.8],[32.001,34.8]])[0], summary: { duration: 200000 } }],
    restrictions: [{ ...verified, valid_from: "00:00:00", valid_until: "23:59:59" }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.validated, false);
});


test("blocks any HERE critical notice even when the code is unknown", async () => {
  const { hasBlockingHereNotice } = await import("../../lib/road-restriction-geometry.mjs");
  assert.equal(hasBlockingHereNotice({ code: "futureUnknownCode", severity: "critical" }), true);
});

test("blocks administrative-wide vehicle violations even when HERE marks them informational", async () => {
  const { hasBlockingHereNotice } = await import("../../lib/road-restriction-geometry.mjs");
  assert.equal(hasBlockingHereNotice({ code: "violatedAdminWideVehicleRestriction", severity: "info" }), true);
});

test("does not block ordinary informational route notices", async () => {
  const { hasBlockingHereNotice } = await import("../../lib/road-restriction-geometry.mjs");
  assert.equal(hasBlockingHereNotice({ code: "mainLanguageNotFound", severity: "info" }), false);
});


test("selects a safe alternative when the fastest candidate crosses a verified restriction", () => {
  const blocked = { sections: route([[31.999,34.8],[32.001,34.8]]), notices: [] };
  const safe = { sections: route([[32.1,34.8],[32.101,34.8]]), notices: [] };
  const result = selectSafeTruckRoute({
    routes: [blocked, safe],
    restrictions: [verified],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.route, safe);
  assert.equal(result.routeIndex, 1);
  assert.equal(result.restrictionCheck.validated, true);
  assert.equal(result.rejected[0].reason, "fleet_restriction_conflict");
});

test("never selects a route with a critical HERE notice when another alternative is safe", () => {
  const providerBlocked = {
    sections: route([[32.1,34.8],[32.101,34.8]]),
    notices: [{ code: "violatedBlockedRoad", severity: "critical" }]
  };
  const safe = { sections: route([[32.1,34.8],[32.101,34.8]]), notices: [] };
  const result = selectSafeTruckRoute({
    routes: [providerBlocked, safe],
    restrictions: [],
    vehicle,
    currentWeightKg: 18000
  });
  assert.equal(result.route, safe);
  assert.equal(result.rejected[0].reason, "provider_restriction_notice");
});

test("rejects every alternative if relevant fleet restriction data is unresolved", () => {
  const candidates = [
    { sections: route([[31.999,34.8],[32.001,34.8]]) },
    { sections: route([[31.998,34.8],[32.002,34.8]]) }
  ];
  const result = selectSafeTruckRoute({
    routes: candidates,
    restrictions: [{ ...verified, latitude: null, longitude: null }],
    vehicle,
    currentWeightKg: 18000
  });
  assert.equal(result.route, null);
  assert.equal(result.rejected.length, 2);
  assert.ok(result.rejected.every(item => item.reason === "unresolved_fleet_restrictions"));
});

test("does not select malformed geometry even if no restrictions were supplied", () => {
  const result = selectSafeTruckRoute({
    routes: [{ sections: [{ polyline: "invalid" }] }],
    restrictions: [],
    vehicle,
    currentWeightKg: 18000
  });
  assert.equal(result.route, null);
  assert.equal(result.rejected[0].reason, "invalid_route_geometry");
});


test("treats reversed active dates as unresolved instead of silently ignoring the restriction", () => {
  const result = evaluateFleetRestrictions({
    sections: route([[31.999,34.8],[32.001,34.8]]),
    restrictions: [{ ...verified, active_from: "2026-11-09", active_until: "2026-11-07" }],
    vehicle,
    currentWeightKg: 18000,
    now: new Date("2026-11-08T10:00:00Z")
  });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].reason, "invalid_active_date_range");
  assert.equal(result.validated, false);
});

test("rejects route candidates with missing or invalid distance and duration summaries", () => {
  const polyline = route([[32.1,34.8],[32.101,34.8]])[0].polyline;
  for (const summary of [undefined, { length: -1, duration: 60 }, { length: 100, duration: Number.NaN }]) {
    const result = selectSafeTruckRoute({
      routes: [{ sections: [{ polyline, ...(summary ? { summary } : {}) }] }],
      restrictions: [],
      vehicle,
      currentWeightKg: 18000
    });
    assert.equal(result.route, null);
    assert.equal(result.rejected[0].reason, "invalid_route_summary");
  }
});
