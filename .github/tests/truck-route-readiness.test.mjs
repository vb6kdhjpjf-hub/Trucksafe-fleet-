import test from "node:test";
import assert from "node:assert/strict";
import { isTruckRouteConfigured } from "../../lib/truck-route-readiness.mjs";

const approved = {
  provider: "here",
  apiKey: "test-key",
  restrictionCoverageApproved: "true",
  providerApproved: "true"
};

test("truck routing remains disabled without explicit national restriction coverage approval", () => {
  assert.equal(isTruckRouteConfigured({ ...approved, restrictionCoverageApproved: "false" }), false);
  assert.equal(isTruckRouteConfigured({ ...approved, restrictionCoverageApproved: undefined }), false);
});

test("truck routing remains disabled until the provider has separate explicit approval", () => {
  assert.equal(isTruckRouteConfigured({ ...approved, providerApproved: "false" }), false);
  assert.equal(isTruckRouteConfigured({ ...approved, providerApproved: undefined }), false);
  assert.equal(isTruckRouteConfigured({ ...approved, providerApproved: "TRUE" }), false);
});

test("truck routing requires the supported provider, a server key, coverage approval, and provider approval", () => {
  assert.equal(isTruckRouteConfigured({ ...approved, provider: "ptv" }), false);
  assert.equal(isTruckRouteConfigured({ ...approved, apiKey: "" }), false);
  assert.equal(isTruckRouteConfigured({ ...approved, apiKey: "   " }), false);
  assert.equal(isTruckRouteConfigured(approved), true);
});
