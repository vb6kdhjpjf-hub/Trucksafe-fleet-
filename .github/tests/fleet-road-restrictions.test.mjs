import test from "node:test";
import assert from "node:assert/strict";
import { loadFleetRoadRestrictions } from "../../lib/fleet-road-restrictions.mjs";

function clientFor(records, { countOverride, errorAtOffset = null, countByOffset = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "road_restrictions");
      const query = { offset: 0, end: 0 };
      const chain = {
        select(columns, options) {
          assert.equal(options.count, "exact");
          query.columns = columns;
          return chain;
        },
        eq(column, value) {
          query[column] = value;
          return chain;
        },
        order(column, options) {
          query.order = [column, options];
          return chain;
        },
        range(start, end) {
          query.offset = start;
          query.end = end;
          return chain;
        },
        then(resolve) {
          calls.push({ ...query });
          if (query.offset === errorAtOffset) {
            return Promise.resolve({ data: null, count: null, error: new Error("query failed") }).then(resolve);
          }
          const count = countByOffset?.[query.offset] ?? countOverride ?? records.length;
          const data = records.slice(query.offset, query.end + 1);
          return Promise.resolve({ data, count, error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
}

test("loads every restriction row across pages rather than trusting the default API row cap", async () => {
  const records = Array.from({ length: 1201 }, (_, index) => ({ id: String(index).padStart(4, "0") }));
  const client = clientFor(records);
  const result = await loadFleetRoadRestrictions(client, "fleet-1");
  assert.equal(result.ok, true);
  assert.equal(result.count, 1201);
  assert.equal(result.data.length, 1201);
  assert.deepEqual(client.calls.map(call => call.offset), [0, 500, 1000]);
  assert.ok(client.calls.every(call => call.fleet_id === "fleet-1" && call.country_code === "IL"));
});

test("fails closed when the complete catalogue exceeds the configured safe cap", async () => {
  const records = Array.from({ length: 5001 }, (_, index) => ({ id: String(index) }));
  const result = await loadFleetRoadRestrictions(clientFor(records), "fleet-1");
  assert.deepEqual(result, { ok: false, reason: "restriction_catalog_exceeds_safe_limit" });
});

test("fails closed when the catalogue changes while pages are being read", async () => {
  const records = Array.from({ length: 700 }, (_, index) => ({ id: String(index) }));
  const client = clientFor(records, { countByOffset: { 500: 701 } });
  const result = await loadFleetRoadRestrictions(client, "fleet-1");
  assert.deepEqual(result, { ok: false, reason: "restriction_catalog_changed_during_read" });
});

test("fails closed when a page is missing or the database query errors", async () => {
  const records = Array.from({ length: 700 }, (_, index) => ({ id: String(index) }));
  const client = clientFor(records, { errorAtOffset: 500 });
  const result = await loadFleetRoadRestrictions(client, "fleet-1");
  assert.deepEqual(result, { ok: false, reason: "restriction_catalog_query_failed" });
});

test("rejects invalid pagination and fleet inputs", async () => {
  assert.deepEqual(
    await loadFleetRoadRestrictions(null, "fleet-1"),
    { ok: false, reason: "invalid_restriction_query" }
  );
  assert.deepEqual(
    await loadFleetRoadRestrictions(clientFor([]), "", {}),
    { ok: false, reason: "invalid_restriction_query" }
  );
});
