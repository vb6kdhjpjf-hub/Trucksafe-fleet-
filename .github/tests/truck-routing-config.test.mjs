import test from "node:test";
import assert from "node:assert/strict";
import { getTruckRoutingConfig } from "../../lib/truck-routing-config.mjs";

test("truck routing stays disabled unless the explicit safety switch is true", () => {
  const result = getTruckRoutingConfig({
    TRUCK_ROUTING_ENABLED: "false",
    TRUCK_ROUTING_PROVIDER: "here",
    HERE_API_KEY: "test-key"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "disabled");
  assert.equal(result.apiKey, null);
});

test("truck routing rejects an unapproved provider", () => {
  const result = getTruckRoutingConfig({
    TRUCK_ROUTING_ENABLED: "true",
    TRUCK_ROUTING_PROVIDER: "other",
    HERE_API_KEY: "test-key"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "provider_not_approved");
  assert.equal(result.apiKey, null);
});

test("truck routing rejects a missing or blank provider key", () => {
  for (const key of [undefined, "", "   "]) {
    const result = getTruckRoutingConfig({
      TRUCK_ROUTING_ENABLED: "true",
      TRUCK_ROUTING_PROVIDER: "here",
      HERE_API_KEY: key
    });
    assert.equal(result.configured, false);
    assert.equal(result.reason, "missing_provider_key");
    assert.equal(result.apiKey, null);
  }
});

test("truck routing activates only when all three settings are valid", () => {
  const result = getTruckRoutingConfig({
    TRUCK_ROUTING_ENABLED: "true",
    TRUCK_ROUTING_PROVIDER: "here",
    HERE_API_KEY: "test-key"
  });
  assert.equal(result.configured, true);
  assert.equal(result.reason, "ready");
  assert.equal(result.apiKey, "test-key");
});

test("truck routing requires the literal true value", () => {
  for (const value of ["TRUE", "1", "yes", " true "]) {
    const result = getTruckRoutingConfig({
      TRUCK_ROUTING_ENABLED: value,
      TRUCK_ROUTING_PROVIDER: "here",
      HERE_API_KEY: "test-key"
    });
    assert.equal(result.configured, false);
  }
});
