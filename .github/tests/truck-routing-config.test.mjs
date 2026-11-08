import test from "node:test";
import assert from "node:assert/strict";
import { getTruckRoutingConfig } from "../../lib/truck-routing-config.mjs";

const approvedEnv = {
  TRUCK_ROUTING_ENABLED: "true",
  TRUCK_ROUTING_PROVIDER: "here",
  HERE_API_KEY_ROTATED: "true",
  HERE_PROVIDER_USAGE_APPROVED: "true",
  HERE_API_KEY: "test-key"
};

test("truck routing stays disabled unless the explicit safety switch is true", () => {
  const result = getTruckRoutingConfig({
    ...approvedEnv,
    TRUCK_ROUTING_ENABLED: "false"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "disabled");
  assert.equal(result.apiKey, null);
});

test("truck routing rejects an unapproved provider", () => {
  const result = getTruckRoutingConfig({
    ...approvedEnv,
    TRUCK_ROUTING_PROVIDER: "other"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "provider_not_approved");
  assert.equal(result.apiKey, null);
});

test("truck routing requires explicit confirmation that the exposed credential was rotated", () => {
  const result = getTruckRoutingConfig({
    ...approvedEnv,
    HERE_API_KEY_ROTATED: "false"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "credential_rotation_not_confirmed");
  assert.equal(result.apiKey, null);
});

test("truck routing requires separate approval for paid provider usage", () => {
  const result = getTruckRoutingConfig({
    ...approvedEnv,
    HERE_PROVIDER_USAGE_APPROVED: "false"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "provider_usage_not_approved");
  assert.equal(result.apiKey, null);
});

test("truck routing rejects a missing or blank provider key", () => {
  for (const key of [undefined, "", "   "]) {
    const result = getTruckRoutingConfig({
      ...approvedEnv,
      HERE_API_KEY: key
    });
    assert.equal(result.configured, false);
    assert.equal(result.reason, "missing_provider_key");
    assert.equal(result.apiKey, null);
  }
});

test("truck routing activates only when all safety and provider settings are valid", () => {
  const result = getTruckRoutingConfig(approvedEnv);
  assert.equal(result.configured, true);
  assert.equal(result.reason, "ready");
  assert.equal(result.apiKey, "test-key");
});

test("truck routing requires literal true values for every approval", () => {
  for (const [key, value] of [
    ["TRUCK_ROUTING_ENABLED", "TRUE"],
    ["TRUCK_ROUTING_ENABLED", "1"],
    ["HERE_API_KEY_ROTATED", "yes"],
    ["HERE_PROVIDER_USAGE_APPROVED", " true "]
  ]) {
    const result = getTruckRoutingConfig({
      ...approvedEnv,
      [key]: value
    });
    assert.equal(result.configured, false);
  }
});
