import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { resolveSingleFleetMembership } from "../../lib/fleet-membership.mjs";
import { resolveAuthenticatedFleetMembership } from "../../lib/authenticated-fleet-membership.mjs";
import { resolveFleetApiAccess } from "../../lib/fleet-api-access.mjs";

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
    assert.match(source, /import \{ resolveFleetApiAccess \} from ["']\.\.\/\.\.\/\.\.\/lib\/fleet-api-access\.mjs["']/, route + " must import the shared API access guard");
    assert.match(source, /resolveFleetApiAccess\(db, token/, route + " must validate bearer identity and fleet membership through the shared guard");
  }
});


test("truck route reads vehicle and restriction records only inside the verified fleet", async () => {
  const source = await readFile(new URL("../../app/api/truck-route/route.js", import.meta.url), "utf8");

  assert.match(source, /\.from\(["']vehicles["']\)[\s\S]*?\.eq\(["']id["'],\s*vehicleId\)[\s\S]*?\.eq\(["']fleet_id["'],\s*membership\.fleet_id\)/,
    "vehicle lookup must be constrained by both vehicle ID and verified fleet ID");
  assert.match(source, /\.from\(["']road_restrictions["']\)[\s\S]*?\.eq\(["']fleet_id["'],\s*membership\.fleet_id\)/,
    "restriction catalogue lookup must be constrained by verified fleet ID");
  assert.match(source, /global:\s*\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}\s*\}/,
    "database requests must carry the verified user's bearer token for RLS");
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/,
    "truck route must not use a service-role or secret key");
  assert.ok(source.indexOf("resolveFleetApiAccess(db, token)") < source.indexOf("geocode(originText, apiKey)"),
    "authorization must complete before paid geocoding is attempted");
});

test("PTV diagnostic endpoints enforce manager roles before contacting the provider", async () => {
  for (const route of ["app/api/ptv-profile-check/route.js", "app/api/ptv-routing-check/route.js"]) {
    const source = await readFile(new URL("../../" + route, import.meta.url), "utf8");
    const gateIndex = source.indexOf('resolveFleetApiAccess(db, token, { allowedRoles: ["owner", "fleet_manager"] })');
    const providerIndex = source.indexOf("await fetch(");
    assert.ok(gateIndex >= 0, route + " must use an explicit manager role allowlist");
    assert.ok(providerIndex > gateIndex, route + " must authorize before making provider requests");
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/,
      route + " must not use a service-role or secret key");
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


test("fleet API access gate maps invalid sessions, missing and ambiguous membership to denial", async () => {
  const invalid = await resolveFleetApiAccess({
    auth: { getUser: async () => ({ data: { user: null }, error: new Error("expired") }) }
  }, "expired-token");
  assert.deepEqual(invalid, { data: null, status: 401, reason: "invalid_session" });

  const makeClient = (rows) => ({
    auth: { getUser: async (token) => {
      assert.equal(token, "valid-token");
      return { data: { user: { id: "verified-user" } }, error: null };
    } },
    from(table) {
      assert.equal(table, "fleet_members");
      const query = {
        select() { return query; },
        eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, "verified-user"); return query; },
        limit(value) { assert.equal(value, 2); return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); }
      };
      return query;
    }
  });

  const noFleet = await resolveFleetApiAccess(makeClient([]), "valid-token");
  assert.deepEqual(noFleet, { data: null, status: 403, reason: "fleet_membership_required" });

  const multiple = await resolveFleetApiAccess(makeClient([
    { fleet_id: "fleet-a", role: "owner" },
    { fleet_id: "fleet-b", role: "driver" }
  ]), "valid-token");
  assert.deepEqual(multiple, { data: null, status: 403, reason: "fleet_membership_required" });
});

test("fleet API access gate enforces management roles and returns only verified membership", async () => {
  const makeClient = (role) => ({
    auth: { getUser: async () => ({ data: { user: { id: "verified-user" } }, error: null }) },
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: [{ fleet_id: "fleet-a", role }], error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  });

  const driver = await resolveFleetApiAccess(makeClient("driver"), "valid-token", {
    allowedRoles: ["owner", "fleet_manager"]
  });
  assert.deepEqual(driver, { data: null, status: 403, reason: "fleet_manager_required" });

  const manager = await resolveFleetApiAccess(makeClient("fleet_manager"), "valid-token", {
    allowedRoles: ["owner", "fleet_manager"]
  });
  assert.equal(manager.status, 200);
  assert.equal(manager.reason, null);
  assert.deepEqual(manager.data.membership, { fleet_id: "fleet-a", role: "fleet_manager" });
  assert.equal(manager.data.user.id, "verified-user");

  const dispatcher = await resolveFleetApiAccess(makeClient("dispatcher"), "valid-token");
  assert.equal(dispatcher.status, 200);
  assert.deepEqual(dispatcher.data.membership, { fleet_id: "fleet-a", role: "dispatcher" });
});

test("shared authenticated fleet guard verifies the bearer token with Supabase Auth", async () => {
  const source = await readFile(new URL("../../lib/authenticated-fleet-membership.mjs", import.meta.url), "utf8");
  assert.match(source, /client\.auth\.getUser\(token\)/);
  assert.match(source, /resolveSingleFleetMembership\(client, user\.id\)/);
});

test("authenticated fleet guard rejects missing and invalid bearer sessions", async () => {
  const missing = await resolveAuthenticatedFleetMembership(null, "");
  assert.equal(missing.error.code, "AUTH_REQUIRED");

  const invalid = await resolveAuthenticatedFleetMembership({
    auth: { getUser: async (token) => ({ data: { user: null }, error: new Error("expired") }) }
  }, "expired-token");
  assert.equal(invalid.error.code, "INVALID_SESSION");
});

test("authenticated fleet guard fails closed for no membership, multiple memberships and lookup errors", async () => {
  const makeClient = ({ user = { id: "user-a" }, rows = [], membershipError = null } = {}) => ({
    auth: { getUser: async (token) => {
      assert.equal(token, "valid-token");
      return { data: { user }, error: null };
    } },
    from(table) {
      assert.equal(table, "fleet_members");
      const query = {
        select() { return query; },
        eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, user.id); return query; },
        limit(value) { assert.equal(value, 2); return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: rows, error: membershipError }).then(resolve, reject);
        }
      };
      return query;
    }
  });

  const noFleet = await resolveAuthenticatedFleetMembership(makeClient(), "valid-token");
  assert.equal(noFleet.error.code, "NO_FLEET");

  const multiple = await resolveAuthenticatedFleetMembership(makeClient({
    rows: [{ fleet_id: "fleet-a", role: "owner" }, { fleet_id: "fleet-b", role: "driver" }]
  }), "valid-token");
  assert.equal(multiple.error.code, "MULTIPLE_FLEETS");

  const failed = await resolveAuthenticatedFleetMembership(makeClient({
    membershipError: new Error("lookup failed")
  }), "valid-token");
  assert.equal(failed.error.code, "MEMBERSHIP_LOOKUP_FAILED");
});

test("authenticated fleet guard returns verified user and the sole fleet membership", async () => {
  const result = await resolveAuthenticatedFleetMembership({
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }) },
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: [{ fleet_id: "fleet-a", role: "owner" }], error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  }, "valid-token");
  assert.equal(result.error, null);
  assert.deepEqual(result.data, {
    user: { id: "user-a" },
    membership: { fleet_id: "fleet-a", role: "owner" }
  });
});
