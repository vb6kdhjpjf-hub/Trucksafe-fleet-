import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveFleetApiAccess } from "../../lib/fleet-api-access.mjs";
import {
  FIXTURE_EMAIL_PREFIX,
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

async function cleanupMarkedFixtureUsers(admin) {
  const users = await listMarkedFixtureUsers(admin);
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("Unable to delete a marked disposable TruckSafe Test Auth user.");
  }
  return users.length;
}

async function main() {
  const { url, anonKey, serviceRoleKey } = readConfig();
  const admin = createAdminClient(url, serviceRoleKey);

  if (process.argv.includes("--cleanup-only")) {
    const removed = await cleanupMarkedFixtureUsers(admin);
    process.stdout.write(`Cleaned ${removed} marked disposable Test Auth fixture user(s).\n`);
    return;
  }

  // Recover identities left by a previously interrupted runner before creating anything new.
  const staleRemoved = await cleanupMarkedFixtureUsers(admin);
  const email = `${FIXTURE_EMAIL_PREFIX}${randomUUID()}@example.com`;
  const password = randomBytes(36).toString("base64url");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { trucksafe_ci_fixture: FIXTURE_MARKER }
  });
  if (createError || !created?.user?.id) {
    throw new Error("Unable to create disposable Test Auth fixture user.");
  }

  const signInClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  let testError;
  try {
    const { data: sessionData, error: signInError } = await signInClient.auth.signInWithPassword({ email, password });
    if (signInError || !sessionData?.session?.access_token) {
      throw new Error("Disposable Test user could not obtain a signed Supabase Auth session.");
    }

    const accessToken = sessionData.session.access_token;
    const authenticatedClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });

    const { data: verified, error: verifyError } = await authenticatedClient.auth.getUser(accessToken);
    if (verifyError || verified?.user?.id !== created.user.id) {
      throw new Error("Supabase Auth did not validate the signed Test access token as the created user.");
    }

    const { data: rows, error: membershipError } = await authenticatedClient
      .from("fleet_members")
      .select("fleet_id,role")
      .eq("user_id", created.user.id)
      .limit(2);

    if (membershipError || !Array.isArray(rows) || rows.length !== 0) {
      throw new Error("Disposable Auth fixture did not produce the expected zero-membership PostgREST result.");
    }

    const access = await resolveFleetApiAccess(authenticatedClient, accessToken);
    assert.equal(access.status, 403);
    assert.equal(access.reason, "fleet_membership_required");
    assert.equal(access.data, null);

    process.stdout.write("Live Test Auth passed: signed JWT verified by Auth, PostgREST membership query returned zero rows, and API access failed closed.\n");
  } catch (error) {
    testError = error;
  } finally {
    await signInClient.auth.signOut({ scope: "global" }).catch(() => {});
    try {
      const removed = await cleanupMarkedFixtureUsers(admin);
      process.stdout.write(`Fixture cleanup completed; removed ${removed} marked user(s).\n`);
    } catch (cleanupError) {
      throw new Error("CRITICAL: disposable Test Auth fixture cleanup failed; a subsequent run must perform the marker-scoped cleanup.", { cause: cleanupError });
    }
  }

  if (testError) throw testError;
  process.stdout.write(`Stale fixtures cleaned before run: ${staleRemoved}.\n`);
}

main().catch(error => {
  process.stderr.write(`Live Test Auth integration failed: ${error.message}\n`);
  process.exitCode = 1;
});
