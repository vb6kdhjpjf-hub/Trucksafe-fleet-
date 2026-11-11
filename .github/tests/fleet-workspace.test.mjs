import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";

function client({ user = { id: "user-a" }, authError = null, memberships = [], membershipError = null, fleet = { id: "fleet-a", name: "Fleet A" }, fleetError = null } = {}) {
  const calls = [];
  const api = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from(table) {
      const state = { table, filters: [], limit: null };
      const query = {
        select(columns) { state.columns = columns; return query; },
        eq(column, value) { state.filters.push([column, value]); return query; },
        limit(value) { state.limit = value; return query; },
        maybeSingle: async () => ({ data: memberships[0] || null, error: membershipError }),
        single: async () => ({ data: fleet, error: fleetError }),
        then(resolve, reject) {
          calls.push(state);
          return Promise.resolve(table === "fleet_members"
            ? { data: memberships, error: membershipError }
            : { data: fleet, error: fleetError }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return { api, calls };
}

test("rejects missing or unverifiable users before querying fleet data", async () => {
  for (const setup of [
    { user: null },
    { user: { id: "other-user" } },
    { user: { id: "user-a" }, authError: new Error("expired") }
  ]) {
    const { api, calls } = client(setup);
    const result = await resolveFleetWorkspace(api, "user-a");
    assert.equal(result.data, null);
    assert.equal(result.error.code, "AUTH_REQUIRED");
    assert.equal(calls.length, 0);
  }
});

test("rejects accounts with no fleet membership", async () => {
  const { api } = client({ memberships: [] });
  const result = await resolveFleetWorkspace(api, "user-a");
  assert.equal(result.error.code, "NO_FLEET");
});

test("rejects ambiguous multi-fleet membership rather than choosing the first", async () => {
  const { api } = client({ memberships: [{ fleet_id: "fleet-a", role: "owner" }, { fleet_id: "fleet-b", role: "driver" }] });
  const result = await resolveFleetWorkspace(api, "user-a");
  assert.equal(result.error.code, "MULTIPLE_FLEETS");
});

test("returns only the single verified membership and its fleet", async () => {
  const { api, calls } = client({ memberships: [{ fleet_id: "fleet-a", role: "dispatcher" }] });
  const result = await resolveFleetWorkspace(api, "user-a");
  assert.equal(result.error, null);
  assert.deepEqual(result.data.fleet, { id: "fleet-a", name: "Fleet A", role: "dispatcher" });
  assert.deepEqual(calls[0].filters, [["user_id", "user-a"]]);
  assert.equal(calls[0].limit, 2);
});

test("fails closed when fleet metadata cannot be loaded", async () => {
  const { api } = client({ memberships: [{ fleet_id: "fleet-a", role: "owner" }], fleetError: new Error("not found") });
  const result = await resolveFleetWorkspace(api, "user-a");
  assert.equal(result.error.code, "FLEET_LOOKUP_FAILED");
});

test("all protected fleet pages use the shared verified workspace resolver", async () => {
  const pages = [
    "app/drivers/page.js",
    "app/tasks/page.js",
    "app/incidents/page.js",
    "app/maintenance/page.js",
    "app/map/page.js",
    "app/reports/page.js",
    "app/daily-report/page.js",
    "app/history/page.js",
    "app/road-restrictions/page.js"
  ];
  for (const page of pages) {
    const source = await readFile(new URL("../../" + page, import.meta.url), "utf8");
    assert.match(source, /import \{ resolveFleetWorkspace \} from ["']\.\.\/\.\.\/lib\/fleet-workspace\.mjs["']/,
      page + " must import the shared resolver");
    assert.match(source, /resolveFleetWorkspace\(supabase,/,
      page + " must verify the fleet workspace before loading fleet data");
  }
});

test("server routing endpoints verify bearer identity and reject ambiguous fleet membership", async () => {
  const routes = [
    "app/api/truck-route/route.js",
    "app/api/ptv-profile-check/route.js",
    "app/api/ptv-routing-check/route.js"
  ];
  for (const route of routes) {
    const source = await readFile(new URL("../../" + route, import.meta.url), "utf8");
    assert.match(source, /authorization\.startsWith\(["']Bearer ["']\)/, route + " must require a bearer token");
    assert.match(source, /auth\.getUser\(token\)/, route + " must validate the token with Supabase Auth");
    assert.match(source, /\.from\(["']fleet_members["']\)/, route + " must check fleet membership");
    assert.match(source, /\.limit\(2\)/, route + " must detect multiple memberships rather than silently choosing one");
  }
});
