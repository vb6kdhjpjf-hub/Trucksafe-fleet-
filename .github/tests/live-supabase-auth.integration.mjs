import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveFleetApiAccess } from "../../lib/fleet-api-access.mjs";
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
  const roles = ["owner", "fleet_manager", "driver"];
  const fixtures = [];
  const signedIn = [];
  let testError;

  try {
    for (const role of roles) {
      const email = `${FIXTURE_EMAIL_PREFIX}${role}-${runId}@example.com`;
      const password = randomBytes(36).toString("base64url");
      const user = await createFixtureUser(admin, email, password);
      fixtures.push({ role, user, password });
    }

    const owner = fixtures.find(item => item.role === "owner");
    const ownerSession = await signInFixtureUser(url, anonKey, owner.user, owner.password);
    signedIn.push(ownerSession);

    // Fleet creation uses the real signed owner JWT and the existing fleets_insert_owner RLS policy.
    const { data: createdFleet, error: fleetError } = await ownerSession.client
      .from("fleets")
      .insert({ name: fleetName, owner_user_id: owner.user.id })
      .select("id,name")
      .single();
    if (fleetError || !createdFleet?.id || createdFleet.name !== fleetName) {
      throw new Error(`Unable to create the uniquely marked Test fixture fleet through the signed owner session (code: ${fleetError?.code ?? "unknown"}; message: ${String(fleetError?.message ?? "no response").slice(0, 240)}).`);
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

    const additionalMembers = fixtures
      .filter(item => item.role !== "owner")
      .map(item => ({ fleet_id: createdFleet.id, user_id: item.user.id, role: item.role }));
    const { error: memberInsertError } = await admin.from("fleet_members").insert(additionalMembers);
    if (memberInsertError) {
      throw new Error(`Unable to create marked Test-only fleet memberships (code: ${memberInsertError?.code ?? "unknown"}; message: ${String(memberInsertError?.message ?? "no response").slice(0, 240)}).`);
    }

    for (const fixture of fixtures) {
      const session = fixture.role === "owner"
        ? ownerSession
        : await signInFixtureUser(url, anonKey, fixture.user, fixture.password);
      if (fixture.role !== "owner") signedIn.push(session);
      await assertMembershipAccess({
        ...session,
        userId: fixture.user.id,
        fleetId: createdFleet.id,
        role: fixture.role
      });
    }

    process.stdout.write(
      "Live Test Auth passed: three real signed JWTs (owner, fleet_manager, driver), " +
      "PostgREST membership reads, manager-only allow/deny checks, and RLS membership visibility all matched expectations.\n"
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
    }
  }

  if (testError) throw testError;
  process.stdout.write(`Stale fixtures cleaned before run: ${staleRemoved}.\n`);
}

main().catch(error => {
  process.stderr.write(`Live Test Auth integration failed: ${error.message}\n`);
  process.exitCode = 1;
});
