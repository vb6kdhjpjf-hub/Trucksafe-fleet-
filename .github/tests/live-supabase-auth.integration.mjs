import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveFleetApiAccess } from "../../lib/fleet-api-access.mjs";
import { POST as ptvProfilePost } from "../../app/api/ptv-profile-check/route.js";
import { POST as ptvRoutingPost } from "../../app/api/ptv-routing-check/route.js";
import { POST as truckRoutePost } from "../../app/api/truck-route/route.js";
import {
  FIXTURE_EMAIL_PREFIX,
  FIXTURE_FLEET_PREFIX,
  FIXTURE_MARKER,
  isTruckSafeFixtureUser
} from "./live-auth-fixture-utils.mjs";

const TEST_PROJECT_REF = "yxxrgblpqzhnnyojbwcr";
const PAGE_SIZE = 1000;

function readConfig() {
  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Live Auth integration requires all three dedicated Test secrets.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${TEST_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing live Auth integration: URL is not the exact dedicated Test project host.");
  }
  if (anonKey === serviceRoleKey) {
    throw new Error("Refusing live Auth integration: public and server-side keys must be different.");
  }
  return { url: parsed.origin, anonKey, serviceRoleKey };
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

async function listMarkedFixtureUsers(admin) {
  const matches = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error("Unable to enumerate Test Auth users for safe fixture cleanup.");
    const users = data?.users ?? [];
    matches.push(...users.filter(isTruckSafeFixtureUser));
    if (users.length < PAGE_SIZE) break;
  }
  return matches;
}

async function removeOwnedFixtureFleets(admin, users) {
  for (const user of users) {
    const { data: fleets, error: listError } = await admin
      .from("fleets")
      .select("id,name,owner_user_id")
      .eq("owner_user_id", user.id);
    if (listError) throw new Error("Unable to identify Test fleets owned by a marked fixture user.");
    for (const fleet of (fleets ?? []).filter(row =>
      typeof row.name === "string" && row.name.startsWith(FIXTURE_FLEET_PREFIX)
    )) {
      if (fleet.owner_user_id !== user.id || !fleet.name.startsWith(FIXTURE_FLEET_PREFIX)) {
        throw new Error("Refusing cleanup: fixture fleet ownership or marker did not match exactly.");
      }
      const { data: deleted, error: deleteError } = await admin
        .from("fleets")
        .delete()
        .eq("id", fleet.id)
        .eq("owner_user_id", user.id)
        .eq("name", fleet.name)
        .select("id");
      if (deleteError || deleted?.length !== 1) {
        throw new Error("Unable to delete the exact marked Test fixture fleet; Auth users were retained for retry.");
      }
      const { data: remaining, error: verifyError } = await admin
        .from("fleets")
        .select("id")
        .eq("id", fleet.id)
        .maybeSingle();
      if (verifyError || remaining) {
        throw new Error("Fixture fleet cleanup verification failed; Auth users were retained for retry.");
      }
      const { data: orphanMembers, error: memberVerifyError } = await admin
        .from("fleet_members")
        .select("user_id")
        .eq("fleet_id", fleet.id);
      if (memberVerifyError || orphanMembers?.length) {
        throw new Error("Fixture membership cascade verification failed; Auth users were retained for retry.");
      }
    }
  }
}

async function cleanupMarkedFixtureUsers(admin) {
  const users = await listMarkedFixtureUsers(admin);
  // Delete only uniquely marked fixture fleets first; cascades remove their memberships and dependent rows.
  await removeOwnedFixtureFleets(admin, users);
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("Unable to delete a marked disposable TruckSafe Test Auth user.");
  }
  const remaining = await listMarkedFixtureUsers(admin);
  if (remaining.length !== 0) {
    throw new Error("Post-cleanup assertion failed: marked disposable Test Auth users remain.");
  }
  return users.length;
}

async function createFixtureUser(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { trucksafe_ci_fixture: FIXTURE_MARKER }
  });
  if (error || !data?.user?.id) {
    throw new Error("Unable to create a disposable marked Test Auth fixture user.");
  }
  return data.user;
}

async function signInFixtureUser(url, anonKey, user, password) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error || !data?.session?.access_token) {
    throw new Error("Disposable Test user could not obtain a signed Supabase Auth session.");
  }
  const token = data.session.access_token;
  const { data: verified, error: verifyError } = await client.auth.getUser(token);
  if (verifyError || verified?.user?.id !== user.id) {
    throw new Error("Supabase Auth did not validate the signed Test access token as the created user.");
  }
  const apiClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  return { client: apiClient, authClient: client, token };
}

async function assertMembershipAccess({ client, token, userId, fleetId, role }) {
  const { data: rows, error } = await client
    .from("fleet_members")
    .select("fleet_id,role")
    .eq("user_id", userId)
    .eq("fleet_id", fleetId)
    .limit(2);
  if (error || !Array.isArray(rows) || rows.length !== 1 || rows[0].role !== role) {
    throw new Error(`Live PostgREST membership check failed for role ${role}.`);
  }

  const general = await resolveFleetApiAccess(client, token);
  assert.equal(general.status, 200, `${role} should pass ordinary fleet API access`);
  assert.equal(general.data.membership.fleet_id, fleetId);
  assert.equal(general.data.membership.role, role);

  const managerOnly = await resolveFleetApiAccess(client, token, {
    allowedRoles: ["owner", "fleet_manager"]
  });
  if (role === "owner" || role === "fleet_manager") {
    assert.equal(managerOnly.status, 200, `${role} should pass manager-only access`);
  } else {
    assert.equal(managerOnly.status, 403, `${role} must be denied manager-only access`);
    assert.equal(managerOnly.reason, "fleet_manager_required");
  }

  const { data: visibleMembers, error: visibilityError } = await client
    .from("fleet_members")
    .select("user_id,role")
    .eq("fleet_id", fleetId);
  if (visibilityError || !Array.isArray(visibleMembers)) {
    throw new Error(`Live RLS membership visibility query failed for role ${role}.`);
  }
  const expectedVisible = role === "owner" || role === "fleet_manager" ? 3 : 1;
  assert.equal(visibleMembers.length, expectedVisible,
    `${role} should see ${expectedVisible} fleet membership row(s) under RLS`);
}


async function assertActualRouteAuthorization({ url, anonKey, token, role }) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  delete process.env.PTV_API_KEY;
  delete process.env.HERE_API_KEY;
  delete process.env.TRUCK_ROUTING_PROVIDER;
  process.env.TRUCK_RESTRICTION_COVERAGE_APPROVED = "false";

  const call = async (handler) => {
    const response = await handler(new Request("https://trucksafe.test/api/integration-check", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    }));
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    return { status: response.status, body: await response.json() };
  };

  for (const handler of [ptvProfilePost, ptvRoutingPost]) {
    const result = await call(handler);
    if (role === "owner" || role === "fleet_manager") {
      assert.equal(result.status, 503, `${role} should pass manager authorization and stop at the disabled PTV key gate`);
      assert.equal(result.body.reason, "ptv_key_not_configured");
    } else if (role === "driver") {
      assert.equal(result.status, 403, "driver must be denied by the actual PTV route handler");
      assert.equal(result.body.reason, "fleet_manager_required");
    } else if (role === "unassigned" || role === "ambiguous") {
      assert.equal(result.status, 403, "user without exactly one fleet membership must be denied by the actual PTV route handler");
      assert.equal(result.body.reason, "fleet_membership_required");
    } else {
      assert.equal(result.status, 401, "invalid bearer token must be denied by the actual PTV route handler");
    }
  }

  const truckResult = await call(truckRoutePost);
  if (role === "owner" || role === "fleet_manager" || role === "driver") {
    assert.equal(truckResult.status, 503, `${role} should pass ordinary membership authorization and stop at the disabled coverage gate`);
    assert.match(truckResult.body.error, /כיסוי ארצי ועדכני/);
  } else {
    assert.equal(truckResult.status, role === "unassigned" || role === "ambiguous" ? 403 : 401);
  }
}


async function startLocalHttpServer(url, anonKey) {
  const port = 3191;
  const baseUrl = "http://127.0.0.1:" + port;
  const serverEnv = {
    ...process.env,
    PORT: String(port),
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    HERE_API_KEY: "",
    PTV_API_KEY: "",
    TRUCK_ROUTING_PROVIDER: "disabled",
    TRUCK_RESTRICTION_COVERAGE_APPROVED: "false"
  };
  delete serverEnv.SUPABASE_TEST_SERVICE_ROLE_KEY;
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: process.cwd(), env: serverEnv, stdio: ["ignore", "pipe", "pipe"] }
  );
  let output = "";
  server.stdout.on("data", chunk => { output += chunk.toString(); });
  server.stderr.on("data", chunk => { output += chunk.toString(); });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) {
        throw new Error("Local Next.js HTTP server exited before readiness: " + output.slice(-4000));
      }
      try {
        const response = await fetch(baseUrl + "/");
        if (response.status === 200) return {
          baseUrl,
          stop: async () => {
            if (server.exitCode !== null) return;
            server.kill("SIGTERM");
            await Promise.race([
              new Promise(resolve => server.once("exit", resolve)),
              new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            if (server.exitCode === null) server.kill("SIGKILL");
          }
        };
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("Local Next.js HTTP server did not become ready: " + output.slice(-4000));
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }
}

async function assertActualHttpAuthorization({ baseUrl, token, role }) {
  const request = async (path) => {
    const response = await fetch(baseUrl + path, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json"
      },
      body: "{}"
    });
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0",
      "HTTP route response must not be cached: " + path);
    return { status: response.status, body: await response.json() };
  };
  for (const path of ["/api/ptv-profile-check", "/api/ptv-routing-check"]) {
    const result = await request(path);
    if (role === "owner" || role === "fleet_manager") {
      assert.equal(result.status, 503);
      assert.equal(result.body.reason, "ptv_key_not_configured");
    } else if (role === "driver") {
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, "fleet_manager_required");
    } else if (role === "unassigned" || role === "ambiguous") {
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, "fleet_membership_required");
    } else {
      assert.equal(result.status, 401);
    }
  }
  const truck = await request("/api/truck-route");
  if (role === "owner" || role === "fleet_manager" || role === "driver") {
    assert.equal(truck.status, 503);
    assert.match(truck.body.error, /כיסוי ארצי ועדכני/);
  } else {
    assert.equal(truck.status, role === "unassigned" || role === "ambiguous" ? 403 : 401);
  }
  process.stdout.write("HTTP server authorization passed for identity: " + role + ".\n");
}

async function main() {
  const { url, anonKey, serviceRoleKey } = readConfig();
  const admin = createAdminClient(url, serviceRoleKey);

  if (process.argv.includes("--cleanup-only")) {
    const removed = await cleanupMarkedFixtureUsers(admin);
    process.stdout.write(`Cleaned ${removed} marked disposable Test Auth fixture user(s) and their marked fleets.\n`);
    return;
  }

  const staleRemoved = await cleanupMarkedFixtureUsers(admin);
  const runId = randomUUID();
  const fleetName = `${FIXTURE_FLEET_PREFIX}${runId}`;
  const roles = ["owner", "fleet_manager", "driver", "ambiguous", "unassigned"];
  const fixtures = [];
  const signedIn = [];
  let testError;
  let httpServer;

  try {
    httpServer = await startLocalHttpServer(url, anonKey);
    for (const role of roles) {
      const email = `${FIXTURE_EMAIL_PREFIX}${role}-${runId}@example.com`;
      const password = randomBytes(36).toString("base64url");
      const user = await createFixtureUser(admin, email, password);
      fixtures.push({ role, user, password });
    }

    const owner = fixtures.find(item => item.role === "owner");
    const ownerSession = await signInFixtureUser(url, anonKey, owner.user, owner.password);
    signedIn.push(ownerSession);

    // Create only the uniquely marked fixture fleet with the dedicated Test service-role client.
    // The owner membership trigger runs in the database; all authorization assertions below use real signed user JWTs.
    const { data: createdFleet, error: fleetError } = await admin
      .from("fleets")
      .insert({ name: fleetName, owner_user_id: owner.user.id })
      .select("id,name")
      .single();
    if (fleetError || !createdFleet?.id || createdFleet.name !== fleetName) {
      throw new Error(`Unable to create the uniquely marked Test fixture fleet through the dedicated Test service-role client (code: ${fleetError?.code ?? "unknown"}; message: ${String(fleetError?.message ?? "no response").slice(0, 240)}).`);
    }

    const { data: ownerMembership, error: ownerMembershipError } = await ownerSession.client
      .from("fleet_members")
      .select("fleet_id,role")
      .eq("fleet_id", createdFleet.id)
      .eq("user_id", owner.user.id)
      .maybeSingle();
    if (ownerMembershipError || ownerMembership?.role !== "owner") {
      throw new Error("The existing fleet-owner membership trigger did not create the expected owner row.");
    }

    const ambiguous = fixtures.find(item => item.role === "ambiguous");
    const secondFleetName = FIXTURE_FLEET_PREFIX + runId + "-ambiguous";
    const { data: secondFleet, error: secondFleetError } = await admin
      .from("fleets")
      .insert({ name: secondFleetName, owner_user_id: ambiguous.user.id })
      .select("id,name")
      .single();
    if (secondFleetError || !secondFleet?.id || secondFleet.name !== secondFleetName) {
      throw new Error("Unable to create the second marked Test fleet for the ambiguous-membership fixture.");
    }

    const additionalMembers = fixtures
      .filter(item => item.role === "fleet_manager" || item.role === "driver" || item.role === "ambiguous")
      .map(item => ({ fleet_id: createdFleet.id, user_id: item.user.id, role: item.role === "ambiguous" ? "driver" : item.role }));
    const { error: memberInsertError } = await admin.from("fleet_members").insert(additionalMembers);
    if (memberInsertError) {
      throw new Error(`Unable to create marked Test-only fleet memberships (code: ${memberInsertError?.code ?? "unknown"}; message: ${String(memberInsertError?.message ?? "no response").slice(0, 240)}).`);
    }

    for (const fixture of fixtures) {
      const session = fixture.role === "owner"
        ? ownerSession
        : await signInFixtureUser(url, anonKey, fixture.user, fixture.password);
      if (fixture.role !== "owner") signedIn.push(session);
      if (fixture.role !== "unassigned" && fixture.role !== "ambiguous") {
        await assertMembershipAccess({
          ...session,
          userId: fixture.user.id,
          fleetId: createdFleet.id,
          role: fixture.role
        });
      }
      if (fixture.role === "ambiguous") {
        const { data: visibleMemberships, error: ambiguousReadError } = await session.client
          .from("fleet_members")
          .select("fleet_id,role")
          .eq("user_id", fixture.user.id)
          .limit(2);
        if (ambiguousReadError || !Array.isArray(visibleMemberships) || visibleMemberships.length !== 2) {
          throw new Error("Live RLS did not expose the two self-membership rows needed to detect an ambiguous fleet identity.");
        }
        const ambiguousAccess = await resolveFleetApiAccess(session.client, session.token);
        assert.equal(ambiguousAccess.status, 403, "a signed user with two fleet memberships must be denied");
        assert.equal(ambiguousAccess.reason, "fleet_membership_required");
      }
      await assertActualRouteAuthorization({
        url,
        anonKey,
        token: session.token,
        role: fixture.role
      });
      await assertActualHttpAuthorization({ baseUrl: httpServer.baseUrl, token: session.token, role: fixture.role });
    }
    await assertActualRouteAuthorization({
      url,
      anonKey,
      token: "invalid-signed-token",
      role: "invalid"
    });
    await assertActualHttpAuthorization({ baseUrl: httpServer.baseUrl, token: "invalid-signed-token", role: "invalid" });

    process.stdout.write(
      "Live Test Auth passed: five signed Test identities (owner, fleet_manager, driver, ambiguous multi-fleet, unassigned), " +
      "PostgREST membership reads, RLS visibility, actual route-handler authorization, and invalid-token denial all matched expectations.\n"
    );
  } catch (error) {
    testError = error;
  } finally {
    for (const session of signedIn) {
      await session.authClient.auth.signOut({ scope: "global" }).catch(() => {});
    }
    try {
      const removed = await cleanupMarkedFixtureUsers(admin);
      process.stdout.write(`Fixture cleanup completed; removed ${removed} marked Auth user(s) and their fleets.\n`);
    } catch (cleanupError) {
      throw new Error(
        "CRITICAL: disposable Test fixture cleanup failed; marked users and any undeleted fleet were retained for retry.",
        { cause: cleanupError }
      );
    } finally {
      if (httpServer) await httpServer.stop();
    }
  }

  if (testError) throw testError;
  process.stdout.write(`Stale fixtures cleaned before run: ${staleRemoved}.\n`);
}

main().catch(error => {
  process.stderr.write(`Live Test Auth integration failed: ${error.message}\n`);
  process.exitCode = 1;
});
