import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPTVRoutingProbeRequest,
  assessPTVRoutingProbeResponse
} from "../../lib/ptv-routing-probe.mjs";

test("builds a fixed Israel Routing API probe and keeps key out of URL", () => {
  const request = buildPTVRoutingProbeRequest("secret-key");
  const url = new URL(request.url);
  assert.equal(url.origin, "https://api.myptv.com");
  assert.equal(url.pathname, "/routing/v1/routes");
  assert.deepEqual(url.searchParams.getAll("waypoints"), ["32.0853,34.7818", "31.7683,35.2137"]);
  assert.equal(url.searchParams.has("apiKey"), false);
  assert.equal(request.headers.ApiKey, "secret-key");
  assert.equal(request.method, "GET");
});

test("rejects missing PTV key", () => {
  assert.throws(() => buildPTVRoutingProbeRequest(" "), /missing_ptv_api_key/);
});

test("accepts documented successful route summary without claiming truck safety", () => {
  assert.deepEqual(
    assessPTVRoutingProbeResponse({ distance: 60000, travelTime: 3600, violated: false }),
    { valid: true, routeFound: true, providerReportedViolation: false, distanceMeters: 60000, durationSeconds: 3600 }
  );
});

test("reports provider violation separately from API connectivity", () => {
  const result = assessPTVRoutingProbeResponse({ distance: 60000, travelTime: 3600, violated: true });
  assert.equal(result.valid, true);
  assert.equal(result.routeFound, false);
  assert.equal(result.providerReportedViolation, true);
});

test("fails closed for malformed or incomplete provider responses", () => {
  for (const payload of [null, {}, { distance: -1, travelTime: 1, violated: false }, { distance: 1, travelTime: "1", violated: false }, { distance: 1, travelTime: 1 }]) {
    assert.equal(assessPTVRoutingProbeResponse(payload).valid, false);
  }
});
