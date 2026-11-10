import test from "node:test";
import assert from "node:assert/strict";
import { isTruckRouteConfigured } from "../../lib/truck-route-readiness.mjs";

test("truck routing remains disabled without explicit national restriction coverage approval", () => {
  assert.equal(isTruckRouteConfigured({ provider: "here", apiKey: "test-key", restrictionCoverageApproved: "false" }), false);
  assert.equal(isTruckRouteConfigured({ provider: "here", apiKey: "test-key", restrictionCoverageApproved: undefined }), false);
});

test("truck routing requires a supported provider and a non-empty server key", () => {
  assert.equal(isTruckRouteConfigured({ provider: "ptv", apiKey: "test-key", restrictionCoverageApproved: "true" }), false);
  assert.equal(isTruckRouteConfigured({ provider: "here", apiKey: "", restrictionCoverageApproved: "true" }), false);
  assert.equal(isTruckRouteConfigured({ provider: "here", apiKey: "test-key", restrictionCoverageApproved: "true" }), true);
});
