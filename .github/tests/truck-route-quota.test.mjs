import test from "node:test";
import assert from "node:assert/strict";
import { checkTruckRouteQuota } from "../../lib/truck-route-quota.mjs";

test("allows a route request only when the database quota RPC returns true", async () => {
  let calledWith = null;
  const result = await checkTruckRouteQuota({
    async rpc(name) {
      calledWith = name;
      return { data: true, error: null };
    }
  });
  assert.equal(calledWith, "consume_truck_route_quota");
  assert.deepEqual(result, { allowed: true, status: 200, reason: null });
});

test("returns 429 when the per-user route quota is exhausted", async () => {
  const result = await checkTruckRouteQuota({
    async rpc() { return { data: false, error: null }; }
  });
  assert.deepEqual(result, { allowed: false, status: 429, reason: "quota_exceeded" });
});

test("fails closed when the database quota RPC reports an error", async () => {
  const result = await checkTruckRouteQuota({
    async rpc() { return { data: null, error: new Error("database unavailable") }; }
  });
  assert.deepEqual(result, { allowed: false, status: 503, reason: "quota_unavailable" });
});

test("fails closed when the database quota RPC throws", async () => {
  const result = await checkTruckRouteQuota({
    async rpc() { throw new Error("network unavailable"); }
  });
  assert.deepEqual(result, { allowed: false, status: 503, reason: "quota_unavailable" });
});

test("fails closed when no authenticated database client is supplied", async () => {
  assert.deepEqual(
    await checkTruckRouteQuota(null),
    { allowed: false, status: 503, reason: "quota_unavailable" }
  );
});
