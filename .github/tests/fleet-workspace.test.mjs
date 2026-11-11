import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { resolveSingleFleetMembership } from "../../lib/fleet-membership.mjs";

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

test("page workspace resolver delegates membership decisions to the shared fail-closed helper", async () => {
  const source = await readFile(new URL("../../lib/fleet-workspace.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ resolveSingleFleetMembership \} from ["']\.\/fleet-membership\.mjs["']/);
  assert.match(source, /resolveSingleFleetMembership\(client, user\.id\)/);
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
    assert.match(source, /import \{ resolveSingleFleetMembership \} from ["']\.\.\/\.\.\/\.\.\/lib\/fleet-membership\.mjs["']/, route + " must import the shared membership resolver");
    assert.match(source, /resolveSingleFleetMembership\(db, authData\.user\.id\)/, route + " must reject missing or ambiguous fleet membership");
  }
});


test("single-fleet membership resolver fails closed for missing, ambiguous, or failed lookups", async () => {
  const makeClient = ({ rows = [], error = null } = {}) => {
    const state = { filters: [], limit: null };
    const query = {
      select(columns) { state.columns = columns; return query; },
      eq(column, value) { state.filters.push([column, value]); return query; },
      limit(value) { state.limit = value; return query; },
      then(resolve, reject) {
        return Promise.resolve({ data: rows, error }).then(resolve, reject);
      }
    };
    return { from(table) { assert.equal(table, "fleet_members"); return query; }, state };
  };

  const invalidClient = await resolveSingleFleetMembership(null, "user-a");
  assert.equal(invalidClient.error.code, "AUTH_REQUIRED");
  const invalidUser = await resolveSingleFleetMembership(makeClient(), "");
  assert.equal(invalidUser.error.code, "AUTH_REQUIRED");

  const missing = makeClient();
  const noFleet = await resolveSingleFleetMembership(missing, "user-a");
  assert.equal(noFleet.error.code, "NO_FLEET");

  const ambiguous = makeClient({ rows: [
    { fleet_id: "fleet-a", role: "owner" },
    { fleet_id: "fleet-b", role: "driver" }
  ] });
  const multiple = await resolveSingleFleetMembership(ambiguous, "user-a");
  assert.equal(multiple.error.code, "MULTIPLE_FLEETS");
  assert.equal(ambiguous.state.limit, 2);
  assert.deepEqual(ambiguous.state.filters, [["user_id", "user-a"]]);

  const failed = makeClient({ error: new Error("lookup failed") });
  const lookupFailure = await resolveSingleFleetMembership(failed, "user-a");
  assert.equal(lookupFailure.error.code, "MEMBERSHIP_LOOKUP_FAILED");

  const single = makeClient({ rows: [{ fleet_id: "fleet-a", role: "dispatcher" }] });
  const valid = await resolveSingleFleetMembership(single, "user-a");
  assert.deepEqual(valid, { data: { fleet_id: "fleet-a", role: "dispatcher" }, error: null });
});
