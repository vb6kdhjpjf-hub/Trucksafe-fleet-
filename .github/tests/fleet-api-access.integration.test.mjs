import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { resolveFleetApiAccess } from "../../lib/fleet-api-access.mjs";

const TEST_TOKEN = "local-fixture-access-token";
const TEST_USER_ID = "local-fixture-user";

async function startAuthFixture(t, { user = { id: TEST_USER_ID }, memberships = [{ fleet_id: "fleet-a", role: "dispatcher" }], authStatus = 200, membershipStatus = 200 } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      apikey: request.headers.apikey,
      body
    });

    if (request.url === "/auth/v1/user") {
      response.writeHead(authStatus, { "content-type": "application/json" });
      response.end(JSON.stringify(authStatus === 200 ? user : { message: "Invalid token" }));
      return;
    }

    if (request.url?.startsWith("/rest/v1/fleet_members")) {
      response.writeHead(membershipStatus, { "content-type": "application/json" });
      response.end(JSON.stringify(membershipStatus === 200 ? memberships : { message: "Membership lookup failed" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Not found" }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  const address = server.address();
  const client = createClient(`http://127.0.0.1:${address.port}`, "local-fixture-anon-key", {
    global: { headers: { Authorization: `Bearer ${TEST_TOKEN}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  return { client, requests };
}

test("Supabase JS client resolves a single fleet membership through a local Auth/PostgREST contract fixture", async t => {
  const { client, requests } = await startAuthFixture(t);
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 200);
  assert.equal(result.data.user.id, TEST_USER_ID);
  assert.deepEqual(result.data.membership, { fleet_id: "fleet-a", role: "dispatcher" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/auth/v1/user");
  assert.equal(requests[0].authorization, `Bearer ${TEST_TOKEN}`);
  assert.ok(requests[1].url.startsWith("/rest/v1/fleet_members?"));
  assert.ok(requests[1].url.includes("user_id=eq." + TEST_USER_ID));
  assert.match(requests[1].url, /limit=2/);
  assert.equal(requests[1].authorization, `Bearer ${TEST_TOKEN}`);
});

test("local Auth fixture rejects an invalid session before any fleet membership query", async t => {
  const { client, requests } = await startAuthFixture(t, { authStatus: 401 });
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 401);
  assert.equal(result.reason, "invalid_session");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/auth/v1/user");
});

test("local PostgREST fixture denies a user without fleet membership", async t => {
  const { client, requests } = await startAuthFixture(t, { memberships: [] });
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 403);
  assert.equal(result.reason, "fleet_membership_required");
  assert.equal(requests.length, 2);
});

test("local PostgREST fixture denies ambiguous multi-fleet membership", async t => {
  const { client } = await startAuthFixture(t, {
    memberships: [
      { fleet_id: "fleet-a", role: "owner" },
      { fleet_id: "fleet-b", role: "driver" }
    ]
  });
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 403);
  assert.equal(result.reason, "fleet_membership_required");
});

test("local PostgREST fixture fails closed when membership lookup returns a server error", async t => {
  const { client } = await startAuthFixture(t, { membershipStatus: 500 });
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 403);
  assert.equal(result.reason, "fleet_membership_required");
});

test("membership lookup uses the identity returned by Supabase Auth", async t => {
  const { client, requests } = await startAuthFixture(t, { user: { id: "different-user" } });
  const result = await resolveFleetApiAccess(client, TEST_TOKEN);

  assert.equal(result.status, 200);
  assert.equal(result.data.user.id, "different-user");
  assert.equal(requests[1].url, "/rest/v1/fleet_members?select=fleet_id%2Crole&user_id=eq.different-user&limit=2");
});

test("local fixture enforces the manager-only role allowlist", async t => {
  const { client: driverClient } = await startAuthFixture(t, {
    memberships: [{ fleet_id: "fleet-a", role: "driver" }]
  });
  const driver = await resolveFleetApiAccess(driverClient, TEST_TOKEN, {
    allowedRoles: ["owner", "fleet_manager"]
  });
  assert.equal(driver.status, 403);
  assert.equal(driver.reason, "fleet_manager_required");

  const { client: managerClient } = await startAuthFixture(t, {
    memberships: [{ fleet_id: "fleet-a", role: "fleet_manager" }]
  });
  const manager = await resolveFleetApiAccess(managerClient, TEST_TOKEN, {
    allowedRoles: ["owner", "fleet_manager"]
  });
  assert.equal(manager.status, 200);
  assert.equal(manager.data.membership.role, "fleet_manager");
});
