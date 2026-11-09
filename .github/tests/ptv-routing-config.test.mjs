import test from "node:test";
import assert from "node:assert/strict";
import { getPTVRoutingConfig } from "../../lib/ptv-routing-config.mjs";

const complete = {
  TRUCK_ROUTING_ENABLED: "true",
  TRUCK_ROUTING_PROVIDER: "ptv",
  PTV_API_KEY: "test-secret",
  PTV_PROVIDER_USAGE_APPROVED: "true",
  PTV_FREE_PLAN_CONFIRMED: "true"
};

test("PTV routing is disabled by default and never exposes a key", () => {
  const result = getPTVRoutingConfig({});
  assert.equal(result.configured, false);
  assert.equal(result.reason, "disabled");
  assert.equal(result.apiKey, null);
});

test("PTV key alone cannot enable provider requests", () => {
  const result = getPTVRoutingConfig({ PTV_API_KEY: "test-secret" });
  assert.equal(result.configured, false);
  assert.equal(result.apiKey, null);
});

test("PTV remains disabled without explicit provider usage approval", () => {
  const result = getPTVRoutingConfig({
    ...complete,
    PTV_PROVIDER_USAGE_APPROVED: "false"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "provider_usage_not_approved");
  assert.equal(result.apiKey, null);
});

test("PTV remains disabled unless the free-plan restriction is confirmed", () => {
  const result = getPTVRoutingConfig({
    ...complete,
    PTV_FREE_PLAN_CONFIRMED: "false"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "free_plan_not_confirmed");
  assert.equal(result.apiKey, null);
});

test("PTV becomes configured only when every independent gate is true", () => {
  const result = getPTVRoutingConfig(complete);
  assert.equal(result.configured, true);
  assert.equal(result.reason, "ready");
  assert.equal(result.apiKey, "test-secret");
});

test("HERE selection cannot accidentally activate PTV", () => {
  const result = getPTVRoutingConfig({
    ...complete,
    TRUCK_ROUTING_PROVIDER: "here"
  });
  assert.equal(result.configured, false);
  assert.equal(result.reason, "provider_not_selected");
  assert.equal(result.apiKey, null);
});
