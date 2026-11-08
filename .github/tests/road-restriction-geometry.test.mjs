import test from "node:test";
import assert from "node:assert/strict";
import { decodeFlexiblePolyline, routePassesNearRestriction, evaluateFleetRestrictions } from "../../lib/road-restriction-geometry.mjs";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeUnsigned(value) {
  let out = "";
  while (value > 0x1f) { out += alphabet[(value & 0x1f) | 0x20]; value >>>= 5; }
  return out + alphabet[value];
}
function encodeSigned(value) { return encodeUnsigned(value < 0 ? ~(value << 1) : value << 1); }
function encodePolyline(points, precision = 5) {
  let out = encodeUnsigned(1) + encodeUnsigned(precision) + encodeUnsigned(0);
  let lat = 0, lng = 0;
  for (const [a,b] of points) {
    const nextLat = Math.round(a * 10 ** precision);
    const nextLng = Math.round(b * 10 ** precision);
    out += encodeSigned(nextLat-lat) + encodeSigned(nextLng-lng);
    lat = nextLat; lng = nextLng;
  }
  return out;
}
const route = (points) => [{ polyline: encodePolyline(points) }];
const vehicle = { heightCm: 420, widthCm: 250, lengthCm: 900 };
const verified = {
  id: "r1", road_name: "Bridge A", is_active: true, verification_status: "verified", verified_at: "2026-11-01T00:00:00Z", verified_by: "00000000-0000-4000-8000-000000000001",
  source_url: "https://example.gov.il/restriction", restriction_type: "height",
  max_height_m: 4.0, latitude: 32.0, longitude: 34.8, radius_m: 100
};

test("decodes a flexible polyline into WGS84 coordinates", () => {
  const points = [[32.0,34.8],[32.001,34.801]];
  assert.deepEqual(decodeFlexiblePolyline(encodePolyline(points)), points.map(p=>p.map(v=>Math.round(v*1e5)/1e5)));
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

test("treats missing coordinates as unresolved instead of assuming safe", () => {
  const result = evaluateFleetRestrictions({ sections: route([[31.999,34.8],[32.001,34.8]]), restrictions:[{...verified,latitude:null,longitude:null}], vehicle, currentWeightKg:18000, now:new Date("2026-11-08T10:00:00Z") });
  assert.equal(result.unresolved.length,1);
  assert.equal(result.validated,false);
});
