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

// A prior failed Test-only CI run created one immutable delivery proof without
// an accompanying delivery note. Its BEFORE DELETE trigger intentionally
// blocks fleet cascades, so preserve this exact marked fixture as an audit
// artifact rather than disabling immutability or deleting referenced files.
const RETAINED_LEGACY_PROOF_FIXTURE = Object.freeze({
  runId: "cd14e032-4945-4f3e-8850-2611f3e272cc",
  fleetId: "e773391e-bf75-47d1-b487-bdf2c89151ee",
  fleetName: "TRUCKSAFE_CI_FIXTURE_cd14e032-4945-4f3e-8850-2611f3e272cc",
  ownerUserId: "1f665508-748e-4984-835e-28a22e5d85a6",
  driverUserId: "6f20f22b-eb91-4343-a627-2245c97b43b2",
  driverId: "a527a29a-a809-4e8c-8e80-15de79dd52d7",
  shipmentId: "cf140548-399d-489f-a3bf-7867a66acdf1",
  stopId: "a4f3ae70-0cd0-44cd-837d-ebd4f763f542",
  proofId: "e9d50660-d36d-41d3-8ed4-180573227607",
  eventKey: "d142d489-86c7-492b-86d5-67a210a72179",
  signaturePath: "e773391e-bf75-47d1-b487-bdf2c89151ee/cf140548-399d-489f-a3bf-7867a66acdf1/a4f3ae70-0cd0-44cd-837d-ebd4f763f542/cd14e032-4945-4f3e-8850-2611f3e272cc-signature.png",
  photoPath: "e773391e-bf75-47d1-b487-bdf2c89151ee/cf140548-399d-489f-a3bf-7867a66acdf1/a4f3ae70-0cd0-44cd-837d-ebd4f763f542/cd14e032-4945-4f3e-8850-2611f3e272cc-photo.png"
});
const RETAINED_LEGACY_FIXTURE_ROLES = [
  "ambiguous", "dispatcher", "driver", "fleet_manager", "owner", "safety_manager", "unassigned"
];

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

async function identifyRetainedLegacyProofFixture(admin, users) {
  const suffix = `-${RETAINED_LEGACY_PROOF_FIXTURE.runId}@example.com`;
  const retainedUsers = users.filter(user => typeof user.email === "string" && user.email.endsWith(suffix));
  if (retainedUsers.length === 0) return [];
  const expectedEmails = new Set(RETAINED_LEGACY_FIXTURE_ROLES.map(
    role => `trucksafe-ci-${role}${suffix}`
  ));
  // The first cleanup attempt may see all seven historical fixture users;
  // after a partial or successful cleanup, only the owner and driver remain.
  // Any in-between subset is also safe, provided every identity is allowlisted.
  if (retainedUsers.length < 2 || retainedUsers.length > expectedEmails.size ||
      retainedUsers.some(user => !expectedEmails.has(user.email) ||
        user.app_metadata?.trucksafe_ci_fixture !== FIXTURE_MARKER)) {
    throw new Error("Refusing to preserve a legacy Test fixture: its exact Auth identities do not match the approved immutable-proof marker.");
  }
  const owner = retainedUsers.find(user => user.email === `trucksafe-ci-owner${suffix}`);
  const driver = retainedUsers.find(user => user.email === `trucksafe-ci-driver${suffix}`);
  if (owner?.id !== RETAINED_LEGACY_PROOF_FIXTURE.ownerUserId ||
      driver?.id !== RETAINED_LEGACY_PROOF_FIXTURE.driverUserId) {
    throw new Error("Refusing to preserve a legacy Test fixture: owner or driver identity changed.");
  }

  const { data: fleet, error: fleetError } = await admin
    .from("fleets")
    .select("id,name,owner_user_id")
    .eq("id", RETAINED_LEGACY_PROOF_FIXTURE.fleetId)
    .maybeSingle();
  if (fleetError || !fleet ||
      fleet.name !== RETAINED_LEGACY_PROOF_FIXTURE.fleetName ||
      fleet.owner_user_id !== owner.id) {
    throw new Error("Refusing to preserve a legacy Test fixture: the exact marked fleet does not match.");
  }

  const { data: proof, error: proofError } = await admin
    .from("delivery_proofs")
    .select("id,fleet_id,shipment_id,stop_id,event_key,proof_status,performed_by,signature_object_path,photo_object_paths")
    .eq("id", RETAINED_LEGACY_PROOF_FIXTURE.proofId)
    .maybeSingle();
  if (proofError || !proof ||
      proof.fleet_id !== fleet.id ||
      proof.shipment_id !== RETAINED_LEGACY_PROOF_FIXTURE.shipmentId ||
      proof.stop_id !== RETAINED_LEGACY_PROOF_FIXTURE.stopId ||
      proof.event_key !== RETAINED_LEGACY_PROOF_FIXTURE.eventKey ||
      proof.proof_status !== "signed" ||
      proof.performed_by !== driver.id ||
      proof.signature_object_path !== RETAINED_LEGACY_PROOF_FIXTURE.signaturePath ||
      JSON.stringify(proof.photo_object_paths) !== JSON.stringify([RETAINED_LEGACY_PROOF_FIXTURE.photoPath])) {
    throw new Error("Refusing to preserve a legacy Test fixture: immutable delivery-proof evidence does not match the exact allowlist.");
  }

  const { data: driverRow, error: driverError } = await admin
    .from("drivers")
    .select("id,user_id")
    .eq("id", RETAINED_LEGACY_PROOF_FIXTURE.driverId)
    .eq("fleet_id", fleet.id)
    .maybeSingle();
  if (driverError || !driverRow || driverRow.user_id !== driver.id) {
    throw new Error("Refusing to preserve a legacy Test fixture: the marked proof performer no longer matches its driver record.");
  }

  const { data: shipment, error: shipmentError } = await admin
    .from("shipments")
    .select("id,fleet_id,assigned_driver_id")
    .eq("id", RETAINED_LEGACY_PROOF_FIXTURE.shipmentId)
    .maybeSingle();
  if (shipmentError || !shipment ||
      shipment.fleet_id !== fleet.id ||
      shipment.assigned_driver_id !== RETAINED_LEGACY_PROOF_FIXTURE.driverId) {
    throw new Error("Refusing to preserve a legacy Test fixture: its shipment/driver relationship changed.");
  }

  const { data: notes, error: notesError } = await admin
    .from("delivery_notes")
    .select("id")
    .eq("fleet_id", fleet.id);
  if (notesError || notes?.length) {
    throw new Error("Refusing to preserve a legacy Test fixture: unexpected immutable delivery notes were found.");
  }

  // Only the owner and assigned driver are required to preserve and exercise
  // the immutable proof. Any other allowlisted legacy accounts are removed.
  return [owner.id, driver.id];
}
async function removeOwnedFixtureFleets(admin, users, retainedUserIds = new Set()) {
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
      if (fleet.id === RETAINED_LEGACY_PROOF_FIXTURE.fleetId &&
          retainedUserIds.has(RETAINED_LEGACY_PROOF_FIXTURE.ownerUserId)) {
        if (user.id !== RETAINED_LEGACY_PROOF_FIXTURE.ownerUserId ||
            fleet.name !== RETAINED_LEGACY_PROOF_FIXTURE.fleetName) {
          throw new Error("Refusing cleanup: retained immutable fixture fleet ownership unexpectedly changed.");
        }
        continue;
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
  // One exact, previously verified orphan from a failed Test-only run. Its
  // fleet was left behind because it contains an immutable delivery proof.
  const { error: legacyOrphanError } = await admin.storage.from("incident-photos").remove([
    "3d9dd6dd-c0ad-48cd-a5fe-fb04319dd33c/incidents/53138cdb-4170-4857-97f4-d2cb0785a654.jpg"
  ]);
  if (legacyOrphanError) {
    throw new Error("Unable to remove the exact verified orphaned Test incident-photo object.");
  }
  const users = await listMarkedFixtureUsers(admin);
  const retainedUsers = await identifyRetainedLegacyProofFixture(admin, users);
  const retainedUserIds = new Set(retainedUsers);
  await removeOwnedFixtureFleets(admin, users, retainedUserIds);
  for (const user of users) {
    if (retainedUserIds.has(user.id)) continue;
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      const { data: stillPresent, error: lookupError } = await admin.auth.admin.getUserById(user.id);
      if (!lookupError && stillPresent?.user) {
        throw new Error("Unable to delete a marked disposable TruckSafe Test Auth user.");
      }
    }
  }

  // Auth Admin listUsers is eventually consistent. Retry deletion of only the
  // exact, still-marked test identities before declaring cleanup complete.
  let remaining = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    remaining = await listMarkedFixtureUsers(admin);
    const unexpected = remaining.filter(user => !retainedUserIds.has(user.id));
    if (unexpected.length === 0 && remaining.length === retainedUserIds.size) break;
    for (const user of unexpected) {
      if (!isTruckSafeFixtureUser(user)) {
        throw new Error("Refusing cleanup retry: a remaining Auth identity is not an exact TruckSafe Test fixture.");
      }
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) {
        const { data: stillPresent, error: lookupError } = await admin.auth.admin.getUserById(user.id);
        if (!lookupError && stillPresent?.user) {
          throw new Error("Unable to retry deletion of a marked disposable TruckSafe Test Auth user.");
        }
      }
    }
    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  remaining = await listMarkedFixtureUsers(admin);
  const unexpected = remaining.filter(user => !retainedUserIds.has(user.id));
  if (unexpected.length !== 0 || remaining.length !== retainedUserIds.size) {
    throw new Error("Post-cleanup assertion failed: unexpected marked disposable Test Auth users remain.");
  }
  if (retainedUserIds.size) {
    process.stdout.write("Retained the exact legacy Test fleet and its two required Auth identities (owner and assigned driver); all other marked fixtures were cleaned.\\n");
  }
  return users.length - retainedUserIds.size;
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

async function signInRetainedLegacyProofUsers(url, anonKey, admin) {
  const legacyUsers = [];
  for (const [userId, expectedEmail] of [
    [RETAINED_LEGACY_PROOF_FIXTURE.ownerUserId,
      `trucksafe-ci-owner-${RETAINED_LEGACY_PROOF_FIXTURE.runId}@example.com`],
    [RETAINED_LEGACY_PROOF_FIXTURE.driverUserId,
      `trucksafe-ci-driver-${RETAINED_LEGACY_PROOF_FIXTURE.runId}@example.com`]
  ]) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user ||
        data.user.email !== expectedEmail ||
        data.user.app_metadata?.trucksafe_ci_fixture !== FIXTURE_MARKER) {
      throw new Error("The retained immutable-proof Test identities could not be verified.");
    }
    const password = randomBytes(36).toString("base64url");
    const { data: updated, error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError || !updated?.user || updated.user.id !== userId) {
      throw new Error("Unable to rotate credentials for the retained Test-only immutable-proof identity.");
    }
    const session = await signInFixtureUser(url, anonKey, updated.user, password);
    legacyUsers.push({ user: updated.user, session });
  }
  return {
    owner: legacyUsers.find(item => item.user.id === RETAINED_LEGACY_PROOF_FIXTURE.ownerUserId).session,
    driver: legacyUsers.find(item => item.user.id === RETAINED_LEGACY_PROOF_FIXTURE.driverUserId).session
  };
}

async function ensureRetainedLegacyProofObjects({ admin, ownerSession, driverSession }) {
  const bucket = "delivery-proof-private";
  const folder = [
    RETAINED_LEGACY_PROOF_FIXTURE.fleetId,
    RETAINED_LEGACY_PROOF_FIXTURE.shipmentId,
    RETAINED_LEGACY_PROOF_FIXTURE.stopId
  ].join("/");
  const { data: items, error: listError } = await admin.storage
    .from(bucket).list(folder, { limit: 50 });
  if (listError) {
    throw new Error("Unable to inspect the exact retained Test proof folder before recovery.");
  }
  const existingNames = new Set((items ?? []).map(item => item.name));
  const proofEntries = [
    {
      path: RETAINED_LEGACY_PROOF_FIXTURE.signaturePath,
      filename: RETAINED_LEGACY_PROOF_FIXTURE.signaturePath.split("/").at(-1),
      uploader: driverSession
    },
    {
      path: RETAINED_LEGACY_PROOF_FIXTURE.photoPath,
      filename: RETAINED_LEGACY_PROOF_FIXTURE.photoPath.split("/").at(-1),
      uploader: ownerSession
    }
  ];
  const existingPaths = proofEntries
    .filter(entry => existingNames.has(entry.filename))
    .map(entry => entry.path);

  // These are exclusively synthetic CI files. A prior service-role recovery
  // left owner_id NULL, which made delete-denial assertions inconclusive.
  // Re-create only these two allowlisted objects through the original signed
  // uploader identities: driver owns the signature, fleet owner owns the photo.
  if (existingPaths.length) {
    const { data: removed, error: removeError } = await admin.storage
      .from(bucket).remove(existingPaths);
    if (removeError || removed?.length !== existingPaths.length) {
      throw new Error("Unable to replace the exact retained synthetic proof files with correctly owned Test uploads.");
    }
  }

  const bytes = Buffer.from("TruckSafe synthetic delivery proof image fixture");
  for (const entry of proofEntries) {
    const { error } = await entry.uploader.client.storage.from(bucket).upload(entry.path, bytes, {
      contentType: "image/png",
      upsert: false
    });
    if (error) {
      throw new Error("Unable to re-upload the exact synthetic proof file through its original Test identity: " + error.message);
    }
  }
}
async function assertRetainedLegacyProofStorageAccess({ ownerSession, driverSession, admin }) {
  const bucket = "delivery-proof-private";
  const proofPaths = [
    RETAINED_LEGACY_PROOF_FIXTURE.signaturePath,
    RETAINED_LEGACY_PROOF_FIXTURE.photoPath
  ];
  await ensureRetainedLegacyProofObjects({ admin, ownerSession, driverSession });
  for (const [role, session] of [["owner", ownerSession], ["assigned driver", driverSession]]) {
    for (const path of proofPaths) {
      const { data, error } = await session.client.storage.from(bucket).createSignedUrl(path, 60);
      if (error || !data?.signedUrl) {
        throw new Error(`The retained ${role} could not read its fleet's immutable delivery-proof object.`);
      }
    }
  }

  const immutableDeleteAttempts = [
    ["assigned driver", driverSession, RETAINED_LEGACY_PROOF_FIXTURE.signaturePath],
    ["fleet owner", ownerSession, RETAINED_LEGACY_PROOF_FIXTURE.photoPath],
    ["fleet owner cross-user", ownerSession, RETAINED_LEGACY_PROOF_FIXTURE.signaturePath],
    ["assigned driver cross-user", driverSession, RETAINED_LEGACY_PROOF_FIXTURE.photoPath]
  ];
  for (const [role, session, path] of immutableDeleteAttempts) {
    const result = await session.client.storage.from(bucket).remove([path]);
    assert.equal(result.error, null, `${role} immutable-proof deletion should be RLS-filtered rather than leak a provider error`);
    assert.deepEqual(result.data, [], `${role} must not delete the referenced delivery-proof object`);
  }

  const folder = [
    RETAINED_LEGACY_PROOF_FIXTURE.fleetId,
    RETAINED_LEGACY_PROOF_FIXTURE.shipmentId,
    RETAINED_LEGACY_PROOF_FIXTURE.stopId
  ].join("/") + "/";
  const ownerOrphan = folder + randomUUID() + "-owner-cleanup.png";
  const driverOrphan = folder + randomUUID() + "-driver-cleanup.png";
  const exactCleanupPaths = [ownerOrphan, driverOrphan];
  const bytes = Buffer.from("TruckSafe immutable-proof cleanup policy fixture");
  try {
    const [ownerUpload, driverUpload] = await Promise.all([
      ownerSession.client.storage.from(bucket).upload(ownerOrphan, bytes, { contentType: "image/png", upsert: false }),
      driverSession.client.storage.from(bucket).upload(driverOrphan, bytes, { contentType: "image/png", upsert: false })
    ]);
    if (ownerUpload.error || driverUpload.error) {
      throw new Error("The retained owner and assigned driver must be able to upload scoped temporary proof objects.");
    }

    const ownerCannotDeleteDriverObject = await ownerSession.client.storage.from(bucket).remove([driverOrphan]);
    assert.equal(ownerCannotDeleteDriverObject.error, null);
    assert.deepEqual(ownerCannotDeleteDriverObject.data, [], "Fleet owner must not delete another user's unreferenced proof upload");

    const driverCannotDeleteOwnerObject = await driverSession.client.storage.from(bucket).remove([ownerOrphan]);
    assert.equal(driverCannotDeleteOwnerObject.error, null);
    assert.deepEqual(driverCannotDeleteOwnerObject.data, [], "Assigned driver must not delete another user's unreferenced proof upload");

    const ownerOwnCleanup = await ownerSession.client.storage.from(bucket).remove([ownerOrphan]);
    assert.equal(ownerOwnCleanup.error, null);
    assert.equal(ownerOwnCleanup.data?.length, 1, "Fleet owner can delete their own unreferenced upload");

    const driverOwnCleanup = await driverSession.client.storage.from(bucket).remove([driverOrphan]);
    assert.equal(driverOwnCleanup.error, null);
    assert.equal(driverOwnCleanup.data?.length, 1, "Assigned driver can delete their own unreferenced upload");
    process.stdout.write("Live immutable-proof Storage passed: signed reads for owner/driver, referenced-object delete denial for both roles, cross-user orphan delete denial, and same-user orphan cleanup.\\n");
  } finally {
    const { error: cleanupError } = await admin.storage.from(bucket).remove(exactCleanupPaths);
    if (cleanupError) {
      throw new Error("Unable to remove the exact temporary Storage cleanup-policy fixtures from Test.");
    }
  }
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
  const expectedVisible = role === "owner" || role === "fleet_manager" ? 6 : 1;
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
    } else if (role === "driver" || role === "dispatcher" || role === "safety_manager") {
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
  if (role === "owner" || role === "fleet_manager" || role === "driver" || role === "dispatcher" || role === "safety_manager") {
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


async function assertBrowserWorkspaceAccess({
  baseUrl, owner, driver, unassigned, shipmentCustomerName, shipmentItemName, stopAddress, admin
}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const pageErrors = [];
  try {
    async function loginFixture(fixture, role) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const browserDiagnostics = [];
      const requestUrls = [];
      page.on("request", request => {
        if (request.url().includes("supabase") || request.url().includes("/_next/")) {
          requestUrls.push(request.method() + " " + request.url().slice(0, 220));
        }
      });
      page.on("pageerror", error => {
        pageErrors.push(role + ": " + error.message);
        browserDiagnostics.push("pageerror: " + error.message);
      });
      page.on("console", message => {
        if (message.type() === "error") browserDiagnostics.push("console: " + message.text());
      });
      page.on("requestfailed", request => {
        browserDiagnostics.push("requestfailed: " + request.url() + " :: " + (request.failure()?.errorText || "unknown"));
      });
      page.on("response", response => {
        if (response.status() >= 400) browserDiagnostics.push("http " + response.status() + ": " + response.url());
      });
      const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      if (!response || response.status() !== 200) {
        throw new Error(role + " browser could not load the local TruckSafe homepage.");
      }
      const emailInput = page.locator('form.auth-form input[type="email"]');
      const passwordInput = page.locator('form.auth-form input[type="password"]');
      await emailInput.waitFor({ state: "visible", timeout: 30000 }).catch(async () => {
        const visiblePage = (await page.locator("body").innerText()).slice(0, 700);
        const runtime = await page.evaluate(() => ({
          readyState: document.readyState,
          scriptCount: document.scripts.length,
          scripts: Array.from(document.scripts).map(script => script.src).filter(Boolean).slice(-12),
          nextFlight: Array.isArray(window.__next_f) ? window.__next_f.length : null,
          forms: Array.from(document.forms).map(form => form.className),
          emailInputs: document.querySelectorAll('input[type="email"]').length
        }));
        throw new Error(role + " browser did not render the sign-in form. Body: " + visiblePage +
          " | Runtime: " + JSON.stringify(runtime) +
          " | Requests: " + requestUrls.slice(-30).join(" || ") +
          " | Browser diagnostics: " + browserDiagnostics.slice(-20).join(" || "));
      });
      await emailInput.fill(fixture.user.email);
      await passwordInput.fill(fixture.password);
      await page.locator('form.auth-form button[type="submit"]').click();
      return { context, page };
    }

    // Owner: login, open the real shipment screen and validate the rendered
    // customer, cargo and delivery stop in Chromium, not only via PostgREST.
    const ownerBrowser = await loginFixture(owner, "owner");
    const ownerPage = ownerBrowser.page;
    const shipmentLink = ownerPage.getByRole("link", { name: /משלוחים ותעודות/ });
    await shipmentLink.waitFor({ state: "visible", timeout: 30000 });
    await shipmentLink.click();
    await ownerPage.getByRole("heading", { name: "משלוחים ותעודות משלוח", level: 2 })
      .waitFor({ state: "visible", timeout: 30000 });
    await ownerPage.getByText(shipmentCustomerName, { exact: true })
      .waitFor({ state: "visible", timeout: 30000 });
    await ownerPage.getByText(shipmentItemName, { exact: true })
      .waitFor({ state: "visible", timeout: 30000 });
    await ownerPage.locator(".shipment-stop-title b")
      .filter({ hasText: stopAddress })
      .waitFor({ state: "visible", timeout: 30000 });
    if (await ownerPage.getByRole("button", { name: /משלוח חדש/ }).count() !== 1) {
      throw new Error("Fleet owner did not receive the shipment-management action in the browser UI.");
    }

    // Reload must preserve a valid signed session and re-authorize the same
    // fleet workspace; the app must not fall back to a duplicate-fleet screen.
    await ownerPage.reload({ waitUntil: "domcontentloaded" });
    await ownerPage.getByRole("link", { name: /משלוחים ותעודות/ })
      .waitFor({ state: "visible", timeout: 30000 });

    // Assigned driver: the same shipment is visible, but the create action is
    // not exposed to a driver role.
    const driverBrowser = await loginFixture(driver, "driver");
    const driverPage = driverBrowser.page;
    const driverShipmentLink = driverPage.getByRole("link", { name: /משלוחים ותעודות/ });
    await driverShipmentLink.waitFor({ state: "visible", timeout: 30000 });
    await driverShipmentLink.click();
    await driverPage.getByRole("heading", { name: "משלוחים ותעודות משלוח", level: 2 })
      .waitFor({ state: "visible", timeout: 30000 });
    await driverPage.getByText(shipmentCustomerName, { exact: true })
      .waitFor({ state: "visible", timeout: 30000 });
    if (await driverPage.getByRole("button", { name: /משלוח חדש/ }).count() !== 0) {
      throw new Error("A driver was incorrectly shown the manager-only create-shipment action.");
    }

    // Unassigned account: login must end at the explicit empty-workspace state.
    // It must not silently provision a new fleet as a side effect of sign-in.
    const unassignedBrowser = await loginFixture(unassigned, "unassigned");
    const unassignedPage = unassignedBrowser.page;
    await unassignedPage.getByRole("heading", { name: "לא נמצא ארגון בחשבון", level: 2 })
      .waitFor({ state: "visible", timeout: 30000 });
    const { data: accidentalFleets, error: fleetQueryError } = await admin
      .from("fleets")
      .select("id")
      .eq("owner_user_id", unassigned.user.id);
    if (fleetQueryError || accidentalFleets?.length !== 0) {
      throw new Error("An unassigned browser login unexpectedly created or acquired a fleet.");
    }

    if (pageErrors.length) {
      throw new Error("Browser UI raised uncaught client errors: " + pageErrors.join(" | "));
    }
    await Promise.all([
      ownerBrowser.context.close(),
      driverBrowser.context.close(),
      unassignedBrowser.context.close()
    ]);
    process.stdout.write("Browser E2E passed: owner login and reload, shipment/cargo/stop rendering, driver read-only role view, and unassigned-account no-auto-provision behavior.\\n");
  } finally {
    await browser.close();
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
    } else if (role === "driver" || role === "dispatcher" || role === "safety_manager") {
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
  if (role === "owner" || role === "fleet_manager" || role === "driver" || role === "dispatcher" || role === "safety_manager") {
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
  const roles = ["owner", "fleet_manager", "dispatcher", "safety_manager", "driver", "ambiguous", "unassigned"];
  const fixtures = [];
  const sessionsByUserId = new Map();
  let testError;
  let httpServer;
  let incidentPhotoFixturePath = null;
  let registrationDocumentFixturePath = null;
  const deliveryProofFixturePaths = [];

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
    sessionsByUserId.set(owner.user.id, ownerSession);

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

    // Real Storage RLS test: Fleet A uploads and references a private incident
    // photo. The Fleet B owner must not mint a signed URL, delete the object,
    // or upload into Fleet A's folder by guessing its UUID.
    incidentPhotoFixturePath = createdFleet.id + "/incidents/" + runId + ".jpg";
    const photoBytes = Buffer.from("TruckSafe synthetic private incident photo fixture");
    const { error: photoUploadError } = await ownerSession.client.storage
      .from("incident-photos")
      .upload(incidentPhotoFixturePath, photoBytes, {
        contentType: "image/jpeg",
        upsert: false
      });
    if (photoUploadError) {
      throw new Error("Fleet A owner could not upload its private incident photo fixture: " + photoUploadError.message);
    }

    const { data: photoIncident, error: photoIncidentError } = await ownerSession.client
      .from("incidents")
      .insert({
        fleet_id: createdFleet.id,
        incident_type: "other",
        description: "Synthetic private photo access fixture",
        created_by: owner.user.id,
        photo_path: incidentPhotoFixturePath,
        status: "open"
      })
      .select("id,photo_path")
      .single();
    if (photoIncidentError || photoIncident?.photo_path !== incidentPhotoFixturePath) {
      throw new Error("Fleet A incident could not reference its uploaded private photo.");
    }

    const ownerPhotoUrl = await ownerSession.client.storage
      .from("incident-photos")
      .createSignedUrl(incidentPhotoFixturePath, 60);
    if (ownerPhotoUrl.error || !ownerPhotoUrl.data?.signedUrl) {
      throw new Error("Fleet A owner could not create a short-lived signed URL for its own incident photo.");
    }

    const secondFleetOwner = fixtures.find(item => item.role === "ambiguous");
    const secondFleetOwnerSession = await signInFixtureUser(url, anonKey, secondFleetOwner.user, secondFleetOwner.password);
    sessionsByUserId.set(secondFleetOwner.user.id, secondFleetOwnerSession);

    // Use the explicitly retained Test-only immutable proof fixture to verify
    // real Storage RLS against referenced objects. No immutable rows are added.
    const retainedProofSessions = await signInRetainedLegacyProofUsers(url, anonKey, admin);
    await assertRetainedLegacyProofStorageAccess({
      ownerSession: retainedProofSessions.owner,
      driverSession: retainedProofSessions.driver,
      admin
    });

    // Give the signed driver identity an active driver record and Fleet A membership
    // before creating the delivery fixture, so the Storage policy's assigned-driver
    // branch is exercised with a real signed JWT (not only the owner role).
    const deliveryDriverFixture = fixtures.find(item => item.role === "driver");
    const { error: deliveryDriverMembershipError } = await admin.from("fleet_members").insert({
      fleet_id: createdFleet.id, user_id: deliveryDriverFixture.user.id, role: "driver"
    });
    if (deliveryDriverMembershipError) {
      throw new Error("Unable to create the marked assigned-driver membership for delivery proof.");
    }
    const { data: deliveryDriver, error: deliveryDriverError } = await admin.from("drivers").insert({
      fleet_id: createdFleet.id,
      user_id: deliveryDriverFixture.user.id,
      full_name: "TruckSafe CI Delivery Driver",
      license_expires_at: "2099-12-31",
      status: "active"
    }).select("id").single();
    if (deliveryDriverError || !deliveryDriver?.id) {
      throw new Error("Unable to create the marked active driver record for delivery proof.");
    }
    const deliveryDriverSession = await signInFixtureUser(url, anonKey, deliveryDriverFixture.user, deliveryDriverFixture.password);
    sessionsByUserId.set(deliveryDriverFixture.user.id, deliveryDriverSession);
 
    // Real delivery-proof Storage integration: create a marked shipment and
    // stop in Fleet A, upload private signature/photo objects, and prove Fleet B
    // cannot read, upload or delete Fleet A proof objects. Keep this Auth/Storage
    // test free of issued delivery-note rows so fixture fleet cleanup remains
    // compatible with the immutable audit-record retention constraint. The
    // complete_delivery_document RPC is covered by rollback-only SQL integration.
    const { data: deliveryShipmentId, error: deliveryShipmentError } = await ownerSession.client.rpc("create_shipment", {
      p_fleet_id: createdFleet.id,
      p_customer_name: "Synthetic delivery-proof customer",
      p_customer_reference: "CI-" + runId.slice(0, 12),
      p_delivery_reference: "CI-DELIVERY-" + runId.slice(0, 12),
      p_scheduled_at: new Date().toISOString(),
      p_assigned_driver_id: deliveryDriver.id,
      p_assigned_vehicle_id: null,
      p_notes: "Disposable integration fixture",
      p_lines: [{ description: "Synthetic cargo", unit: "package", planned_quantity: 1 }],
      p_stops: [{ stop_type: "delivery", address: "Synthetic Test address", items: [{ line_index: 0, planned_quantity: 1 }] }]
    });
    if (deliveryShipmentError || !deliveryShipmentId) {
      throw new Error("Unable to create a marked Test-only shipment for delivery-proof integration: " + (deliveryShipmentError?.message ?? "missing shipment id"));
    }
    const { data: deliveryStop, error: deliveryStopError } = await ownerSession.client
      .from("shipment_stops").select("id,status").eq("shipment_id", deliveryShipmentId).single();
    if (deliveryStopError || !deliveryStop?.id) {
      throw new Error("Unable to read the marked Test delivery stop.");
    }

    await assertBrowserWorkspaceAccess({
      baseUrl: httpServer.baseUrl,
      owner,
      driver: deliveryDriverFixture,
      unassigned: fixtures.find(item => item.role === "unassigned"),
      shipmentCustomerName: "Synthetic delivery-proof customer",
      shipmentItemName: "Synthetic cargo",
      stopAddress: "Synthetic Test address",
      admin
    });

    const deliveryPrefix = createdFleet.id + "/" + deliveryShipmentId + "/" + deliveryStop.id + "/";
    const deliverySignaturePath = deliveryPrefix + runId + "-signature.png";
    const deliveryPhotoPath = deliveryPrefix + runId + "-photo.png";
    deliveryProofFixturePaths.push(deliverySignaturePath, deliveryPhotoPath);
    const proofBytes = Buffer.from("TruckSafe synthetic delivery proof image fixture");
    const deliveryUploadSessions = [deliveryDriverSession, ownerSession];
    for (let index = 0; index < deliveryProofFixturePaths.length; index += 1) {
      const { error: uploadError } = await deliveryUploadSessions[index].client.storage
        .from("delivery-proof-private")
        .upload(deliveryProofFixturePaths[index], proofBytes, { contentType: "image/png", upsert: false });
      if (uploadError) {
        throw new Error((index === 0 ? "Assigned Fleet A driver" : "Fleet A owner") +
          " could not upload a private delivery-proof fixture: " + uploadError.message);
      }
    }

    const deliveryInvalidMimePath = deliveryPrefix + runId + "-invalid.pdf";
    const deliveryOversizePath = deliveryPrefix + runId + "-oversized.png";
    deliveryProofFixturePaths.push(deliveryInvalidMimePath, deliveryOversizePath);
    const rejectedMimeUpload = await ownerSession.client.storage
      .from("delivery-proof-private").upload(deliveryInvalidMimePath, Buffer.from("not an image"), {
        contentType: "application/pdf", upsert: false
      });
    assert.ok(rejectedMimeUpload.error, "Delivery-proof bucket must reject non-image MIME types");

    const oversizedBytes = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    const rejectedOversizeUpload = await ownerSession.client.storage
      .from("delivery-proof-private").upload(deliveryOversizePath, oversizedBytes, {
        contentType: "image/png", upsert: false
      });
    assert.ok(rejectedOversizeUpload.error, "Delivery-proof bucket must enforce its 10 MiB per-object limit");

    const driverDeliveryUrl = await deliveryDriverSession.client.storage
      .from("delivery-proof-private").createSignedUrl(deliverySignaturePath, 60);
    if (driverDeliveryUrl.error || !driverDeliveryUrl.data?.signedUrl) {
      throw new Error("The active assigned driver could not read its own delivery signature.");
    }
    const ownerDeliveryUrl = await ownerSession.client.storage
      .from("delivery-proof-private").createSignedUrl(deliverySignaturePath, 60);
    if (ownerDeliveryUrl.error || !ownerDeliveryUrl.data?.signedUrl) {
      throw new Error("Fleet A owner could not create a short-lived URL for its own delivery signature.");
    }
    const fleetBDeliveryUrl = await secondFleetOwnerSession.client.storage
      .from("delivery-proof-private").createSignedUrl(deliverySignaturePath, 60);
    assert.ok(fleetBDeliveryUrl.error, "Fleet B owner must not read Fleet A delivery proof by guessed object path");

    const fleetBDeliveryDelete = await secondFleetOwnerSession.client.storage
      .from("delivery-proof-private").remove([deliverySignaturePath]);
    assert.equal(fleetBDeliveryDelete.error, null);
    assert.deepEqual(fleetBDeliveryDelete.data, [], "Fleet B owner must not delete Fleet A's delivery signature");

    const fleetBDeliveryUpload = await secondFleetOwnerSession.client.storage
      .from("delivery-proof-private").upload(deliveryPrefix + runId + "-tamper.png", proofBytes, {
        contentType: "image/png", upsert: false
      });
    assert.ok(fleetBDeliveryUpload.error, "Fleet B owner must not upload into Fleet A's delivery-proof path");

    // An assigned driver may remove only their own unreferenced failed-upload
    // object. The fleet owner cannot delete an object uploaded by that driver.
    const deliveryOrphanPath = deliveryPrefix + runId + "-orphan.png";
    deliveryProofFixturePaths.push(deliveryOrphanPath);
    const { error: orphanUploadError } = await deliveryDriverSession.client.storage
      .from("delivery-proof-private").upload(deliveryOrphanPath, proofBytes, {
        contentType: "image/png", upsert: false
      });
    if (orphanUploadError) {
      throw new Error("Assigned driver could not upload a disposable unreferenced proof object: " + orphanUploadError.message);
    }
    const ownerOrphanDelete = await ownerSession.client.storage
      .from("delivery-proof-private").remove([deliveryOrphanPath]);
    assert.equal(ownerOrphanDelete.error, null);
    assert.deepEqual(ownerOrphanDelete.data, [], "Fleet A owner must not delete a proof object uploaded by a different user");
    const driverOrphanDelete = await deliveryDriverSession.client.storage
      .from("delivery-proof-private").remove([deliveryOrphanPath]);
    assert.equal(driverOrphanDelete.error, null);
    assert.equal(driverOrphanDelete.data?.length, 1, "Assigned driver must be able to clean up their own unreferenced upload");
    const { data: orphanRemainder, error: orphanListError } = await admin.storage
      .from("delivery-proof-private").list(deliveryPrefix, { search: runId + "-orphan.png", limit: 5 });
    if (orphanListError || orphanRemainder?.some(item => item.name === runId + "-orphan.png")) {
      throw new Error("The authorized orphan cleanup did not remove the exact disposable proof object.");
    }

    // These signed Storage fixtures remain intentionally unreferenced: verify
    // ownership-based cleanup of failed uploads without inserting an immutable
    // delivery_proofs row that would prevent the marked fleet from being removed.
    const ownerCannotDeleteDriverSignature = await ownerSession.client.storage
      .from("delivery-proof-private").remove([deliverySignaturePath]);
    assert.equal(ownerCannotDeleteDriverSignature.error, null);
    assert.deepEqual(ownerCannotDeleteDriverSignature.data, [], "Fleet owner cannot delete a proof object uploaded by the assigned driver");

    const ownerOwnPhotoDelete = await ownerSession.client.storage
      .from("delivery-proof-private").remove([deliveryPhotoPath]);
    assert.equal(ownerOwnPhotoDelete.error, null);
    assert.equal(ownerOwnPhotoDelete.data?.length, 1, "Fleet owner can clean up their own unreferenced photo upload");

    const driverOwnSignatureDelete = await deliveryDriverSession.client.storage
      .from("delivery-proof-private").remove([deliverySignaturePath]);
    assert.equal(driverOwnSignatureDelete.error, null);
    assert.equal(driverOwnSignatureDelete.data?.length, 1, "Assigned driver can clean up their own unreferenced signature upload");

    process.stdout.write("Live delivery-proof Storage passed: assigned-driver/owner uploads and reads, cross-fleet denial, immutable proof delete denial, own-unreferenced cleanup, MIME/size rejection, and exact fixture cleanup.\\n");


    const crossFleetPhotoUrl = await secondFleetOwnerSession.client.storage
      .from("incident-photos")
      .createSignedUrl(incidentPhotoFixturePath, 60);
    assert.ok(crossFleetPhotoUrl.error, "Fleet B owner must not mint a signed URL for Fleet A's private incident photo");

    const crossFleetPhotoDelete = await secondFleetOwnerSession.client.storage
      .from("incident-photos")
      .remove([incidentPhotoFixturePath]);
    // Supabase Storage may return an empty successful DELETE when RLS filters
    // the object rather than returning a policy error. Verify the object remains
    // readable by its owning fleet below instead of requiring an error object.
    assert.equal(crossFleetPhotoDelete.error, null, "RLS-filtered Storage deletion should not expose a provider error");
    assert.deepEqual(crossFleetPhotoDelete.data, [], "Fleet B owner must not delete Fleet A's private incident photo");

    const crossFleetPhotoUpload = await secondFleetOwnerSession.client.storage
      .from("incident-photos")
      .upload(createdFleet.id + "/incidents/" + runId + "-tamper.jpg", photoBytes, {
        contentType: "image/jpeg",
        upsert: false
      });
    assert.ok(crossFleetPhotoUpload.error, "Fleet B owner must not upload into Fleet A's folder using a guessed fleet UUID");

    const ownerPhotoStillReadable = await ownerSession.client.storage
      .from("incident-photos")
      .createSignedUrl(incidentPhotoFixturePath, 60);
    if (ownerPhotoStillReadable.error || !ownerPhotoStillReadable.data?.signedUrl) {
      throw new Error("Fleet A incident photo became inaccessible after denied cross-fleet attempts.");
    }

    // Create a second-fleet vehicle and incident using only the dedicated Test
    // service-role fixture client. The signed Fleet A owner then attempts BOLA
    // reads, updates, deletes and inserts against Fleet B identifiers.
    const { data: fleetBVehicle, error: fleetBVehicleError } = await admin
      .from("vehicles")
      .insert({
        fleet_id: secondFleet.id,
        registration_number: `CI-B-${runId.slice(0, 12)}`,
        make: "Synthetic",
        model: "Isolation Fixture"
      })
      .select("id,fleet_id,registration_number")
      .single();
    if (fleetBVehicleError || !fleetBVehicle?.id || fleetBVehicle.fleet_id !== secondFleet.id) {
      throw new Error("Unable to create the uniquely marked Fleet B vehicle fixture.");
    }

    const { data: fleetAVehicle, error: fleetAVehicleError } = await admin
      .from("vehicles")
      .insert({
        fleet_id: createdFleet.id,
        registration_number: `CI-A-${runId.slice(0, 12)}`,
        make: "Synthetic",
        model: "Registration Storage Fixture"
      })
      .select("id,fleet_id,registration_number")
      .single();
    if (fleetAVehicleError || !fleetAVehicle?.id || fleetAVehicle.fleet_id !== createdFleet.id) {
      throw new Error("Unable to create the uniquely marked Fleet A vehicle for registration Storage tests.");
    }

    // Registration documents are stored under fleet UUID / vehicle UUID / filename.
    // Only owners and fleet managers of that same fleet may upload or read them.
    registrationDocumentFixturePath = createdFleet.id + "/" + fleetAVehicle.id + "/" + runId + ".pdf";
    const registrationBytes = Buffer.from("%PDF-1.4\\n% TruckSafe synthetic private registration fixture\\n");
    const { error: registrationUploadError } = await ownerSession.client.storage
      .from("vehicle-registrations")
      .upload(registrationDocumentFixturePath, registrationBytes, {
        contentType: "application/pdf",
        upsert: false
      });
    if (registrationUploadError) {
      throw new Error("Fleet A owner could not upload its private vehicle registration fixture: " + registrationUploadError.message);
    }

    const ownerRegistrationUrl = await ownerSession.client.storage
      .from("vehicle-registrations")
      .createSignedUrl(registrationDocumentFixturePath, 60);
    if (ownerRegistrationUrl.error || !ownerRegistrationUrl.data?.signedUrl) {
      throw new Error("Fleet A owner could not create a short-lived signed URL for its private registration document.");
    }

    const crossFleetRegistrationUrl = await secondFleetOwnerSession.client.storage
      .from("vehicle-registrations")
      .createSignedUrl(registrationDocumentFixturePath, 60);
    assert.ok(crossFleetRegistrationUrl.error, "A non-manager from another fleet must not mint a signed URL for Fleet A's vehicle registration");

    const crossFleetRegistrationDelete = await secondFleetOwnerSession.client.storage
      .from("vehicle-registrations")
      .remove([registrationDocumentFixturePath]);
    assert.equal(crossFleetRegistrationDelete.error, null, "Storage may filter unauthorized registration deletes without an error");
    assert.deepEqual(crossFleetRegistrationDelete.data, [], "A non-manager from another fleet must not delete Fleet A's registration document");

    const crossFleetRegistrationUpload = await secondFleetOwnerSession.client.storage
      .from("vehicle-registrations")
      .upload(createdFleet.id + "/" + fleetAVehicle.id + "/" + runId + "-tamper.pdf", registrationBytes, {
        contentType: "application/pdf",
        upsert: false
      });
    assert.ok(crossFleetRegistrationUpload.error, "A non-manager from another fleet must not upload into Fleet A's vehicle registration folder");

    const ownerRegistrationStillReadable = await ownerSession.client.storage
      .from("vehicle-registrations")
      .createSignedUrl(registrationDocumentFixturePath, 60);
    if (ownerRegistrationStillReadable.error || !ownerRegistrationStillReadable.data?.signedUrl) {
      throw new Error("Fleet A registration document became inaccessible after denied cross-fleet attempts.");
    }


    const { data: fleetBIncident, error: fleetBIncidentError } = await admin
      .from("incidents")
      .insert({
        fleet_id: secondFleet.id,
        incident_type: "other",
        description: "Synthetic Fleet B isolation fixture",
        created_by: ambiguous.user.id,
        status: "open"
      })
      .select("id,fleet_id,description")
      .single();
    if (fleetBIncidentError || !fleetBIncident?.id || fleetBIncident.fleet_id !== secondFleet.id) {
      throw new Error("Unable to create the uniquely marked Fleet B incident fixture.");
    }

    const { data: fleetBMaintenance, error: fleetBMaintenanceError } = await admin
      .from("maintenance_records")
      .insert({
        fleet_id: secondFleet.id,
        vehicle_id: fleetBVehicle.id,
        maintenance_type: "routine",
        description: "Synthetic Fleet B isolation fixture",
        status: "scheduled"
      })
      .select("id,fleet_id,vehicle_id,description")
      .single();
    if (fleetBMaintenanceError || !fleetBMaintenance?.id || fleetBMaintenance.fleet_id !== secondFleet.id) {
      throw new Error("Unable to create the uniquely marked Fleet B maintenance fixture.");
    }

    const crossFleetVehicleRead = await ownerSession.client
      .from("vehicles").select("id,fleet_id").eq("id", fleetBVehicle.id);
    assert.equal(crossFleetVehicleRead.error, null, "cross-fleet vehicle read should be RLS-filtered, not leak an error");
    assert.deepEqual(crossFleetVehicleRead.data, [], "Fleet A owner must not read a Fleet B vehicle by guessed UUID");

    const crossFleetIncidentRead = await ownerSession.client
      .from("incidents").select("id,fleet_id").eq("id", fleetBIncident.id);
    assert.equal(crossFleetIncidentRead.error, null, "cross-fleet incident read should be RLS-filtered");
    assert.deepEqual(crossFleetIncidentRead.data, [], "Fleet A owner must not read a Fleet B incident by guessed UUID");

    const crossFleetMaintenanceRead = await ownerSession.client
      .from("maintenance_records").select("id,fleet_id").eq("id", fleetBMaintenance.id);
    assert.equal(crossFleetMaintenanceRead.error, null, "cross-fleet maintenance read should be RLS-filtered");
    assert.deepEqual(crossFleetMaintenanceRead.data, [], "Fleet A owner must not read Fleet B maintenance by guessed UUID");

    const crossFleetVehicleUpdate = await ownerSession.client
      .from("vehicles").update({ notes: "unauthorized Fleet A mutation" })
      .eq("id", fleetBVehicle.id).select("id");
    assert.equal(crossFleetVehicleUpdate.error, null);
    assert.deepEqual(crossFleetVehicleUpdate.data, [], "Fleet A owner must not update a Fleet B vehicle");

    const crossFleetIncidentUpdate = await ownerSession.client
      .from("incidents").update({ description: "unauthorized Fleet A mutation" })
      .eq("id", fleetBIncident.id).select("id");
    assert.equal(crossFleetIncidentUpdate.error, null);
    assert.deepEqual(crossFleetIncidentUpdate.data, [], "Fleet A owner must not update a Fleet B incident");

    const crossFleetMaintenanceUpdate = await ownerSession.client
      .from("maintenance_records").update({ description: "unauthorized Fleet A mutation" })
      .eq("id", fleetBMaintenance.id).select("id");
    assert.equal(crossFleetMaintenanceUpdate.error, null);
    assert.deepEqual(crossFleetMaintenanceUpdate.data, [], "Fleet A owner must not update Fleet B maintenance");

    const crossFleetVehicleDelete = await ownerSession.client
      .from("vehicles").delete().eq("id", fleetBVehicle.id).select("id");
    assert.equal(crossFleetVehicleDelete.error, null);
    assert.deepEqual(crossFleetVehicleDelete.data, [], "Fleet A owner must not delete a Fleet B vehicle");

    const crossFleetIncidentDelete = await ownerSession.client
      .from("incidents").delete().eq("id", fleetBIncident.id).select("id");
    assert.equal(crossFleetIncidentDelete.error, null);
    assert.deepEqual(crossFleetIncidentDelete.data, [], "Fleet A owner must not delete a Fleet B incident");

    const crossFleetMaintenanceDelete = await ownerSession.client
      .from("maintenance_records").delete().eq("id", fleetBMaintenance.id).select("id");
    assert.equal(crossFleetMaintenanceDelete.error, null);
    assert.deepEqual(crossFleetMaintenanceDelete.data, [], "Fleet A owner must not delete Fleet B maintenance");

    const crossFleetVehicleInsert = await ownerSession.client
      .from("vehicles").insert({
        fleet_id: secondFleet.id,
        registration_number: `CI-X-${runId.slice(0, 12)}`
      }).select("id");
    assert.ok(crossFleetVehicleInsert.error, "Fleet A owner must not insert a vehicle into Fleet B");

    const crossFleetIncidentInsert = await ownerSession.client
      .from("incidents").insert({
        fleet_id: secondFleet.id,
        incident_type: "other",
        description: "unauthorized cross-fleet insert",
        created_by: owner.user.id,
        status: "open"
      }).select("id");
    assert.ok(crossFleetIncidentInsert.error, "Fleet A owner must not insert an incident into Fleet B");

    const fleetBAfterAttempts = await admin
      .from("vehicles").select("id,notes").eq("id", fleetBVehicle.id).single();
    if (fleetBAfterAttempts.error || fleetBAfterAttempts.data?.notes != null) {
      throw new Error("Fleet B vehicle changed after cross-fleet update/delete attempts.");
    }
    const incidentBAfterAttempts = await admin
      .from("incidents").select("id,description").eq("id", fleetBIncident.id).single();
    if (incidentBAfterAttempts.error || incidentBAfterAttempts.data?.description !== "Synthetic Fleet B isolation fixture") {
      throw new Error("Fleet B incident changed after cross-fleet update/delete attempts.");
    }

    const maintenanceBAfterAttempts = await admin
      .from("maintenance_records").select("id,description").eq("id", fleetBMaintenance.id).single();
    if (maintenanceBAfterAttempts.error || maintenanceBAfterAttempts.data?.description !== "Synthetic Fleet B isolation fixture") {
      throw new Error("Fleet B maintenance record changed after cross-fleet update/delete attempts.");
    }

    process.stdout.write("Live cross-fleet BOLA checks passed: Fleet A owner could not read, insert, update or delete Fleet B vehicle, incident and maintenance records by identifier.\\n");

    const additionalMembers = fixtures
      .filter(item => item.role === "fleet_manager" || item.role === "dispatcher" || item.role === "safety_manager" || item.role === "ambiguous")
      .map(item => ({ fleet_id: createdFleet.id, user_id: item.user.id, role: item.role === "ambiguous" ? "driver" : item.role }));
    const { error: memberInsertError } = await admin.from("fleet_members").insert(additionalMembers);
    if (memberInsertError) {
      throw new Error(`Unable to create marked Test-only fleet memberships (code: ${memberInsertError?.code ?? "unknown"}; message: ${String(memberInsertError?.message ?? "no response").slice(0, 240)}).`);
    }

    for (const fixture of fixtures) {
      const session = fixture.role === "owner"
        ? ownerSession
        : await signInFixtureUser(url, anonKey, fixture.user, fixture.password);
      sessionsByUserId.set(fixture.user.id, session);
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

    // Membership is re-read from Test Postgres on every API request: removing a row
    // must revoke an otherwise valid, still-signed JWT without requiring re-login.
    const dispatcher = fixtures.find(item => item.role === "dispatcher");
    const dispatcherSession = sessionsByUserId.get(dispatcher.user.id);
    if (!dispatcherSession) throw new Error("Missing signed Auth session for the dispatcher revocation fixture.");
    const { data: removedMembership, error: removeMembershipError } = await admin
      .from("fleet_members")
      .delete()
      .eq("fleet_id", createdFleet.id)
      .eq("user_id", dispatcher.user.id)
      .select("user_id,fleet_id");
    if (removeMembershipError || removedMembership?.length !== 1) {
      throw new Error("Test-only membership revocation fixture did not remove exactly one dispatcher membership.");
    }

    const { data: adminMembershipAfterRemoval, error: adminReadAfterRemovalError } = await admin
      .from("fleet_members")
      .select("fleet_id,role")
      .eq("fleet_id", createdFleet.id)
      .eq("user_id", dispatcher.user.id);
    if (adminReadAfterRemovalError || adminMembershipAfterRemoval?.length !== 0) {
      throw new Error("Test-only membership revocation did not persist: the service-role read still sees the dispatcher membership.");
    }

    const { data: verifiedDispatcher, error: verifyDispatcherError } = await dispatcherSession.authClient.auth.getUser(dispatcherSession.token);
    if (verifyDispatcherError || verifiedDispatcher?.user?.id !== dispatcher.user.id) {
      throw new Error("Membership revocation test session no longer resolves to the expected dispatcher identity.");
    }

    // Use a new PostgREST client after the mutation to ensure this assertion
    // models a new API request rather than relying on any prior client state.
    const revokedSession = await signInFixtureUser(url, anonKey, dispatcher.user, dispatcher.password);
    const { data: dispatcherMembershipAfterRemoval, error: dispatcherReadAfterRemovalError } = await revokedSession.client
      .from("fleet_members")
      .select("fleet_id,role")
      .eq("user_id", dispatcher.user.id)
      .limit(2);
    if (dispatcherReadAfterRemovalError || dispatcherMembershipAfterRemoval?.length !== 0) {
      throw new Error("Dispatcher's still-valid JWT can still read a fleet_members row after service-role membership removal.");
    }

    const revokedAccess = await resolveFleetApiAccess(revokedSession.client, revokedSession.token);
    assert.equal(revokedAccess.status, 403, "a valid JWT must lose fleet access immediately after membership removal");
    assert.equal(revokedAccess.reason, "fleet_membership_required");
    await assertActualRouteAuthorization({ url, anonKey, token: revokedSession.token, role: "unassigned" });
    await assertActualHttpAuthorization({ baseUrl: httpServer.baseUrl, token: revokedSession.token, role: "unassigned" });

    // A manager demotion must also take effect for the same signed JWT immediately.
    const manager = fixtures.find(item => item.role === "fleet_manager");
    const managerSession = sessionsByUserId.get(manager.user.id);
    if (!managerSession) throw new Error("Missing signed Auth session for the manager demotion fixture.");
    const { data: demotedRows, error: demotionError } = await admin
      .from("fleet_members")
      .update({ role: "driver" })
      .eq("fleet_id", createdFleet.id)
      .eq("user_id", manager.user.id)
      .eq("role", "fleet_manager")
      .select("user_id,role");
    if (demotionError || demotedRows?.length !== 1 || demotedRows[0].role !== "driver") {
      throw new Error("Test-only role-demotion fixture did not change exactly one fleet_manager membership to driver.");
    }
    const demotedGeneral = await resolveFleetApiAccess(managerSession.client, managerSession.token);
    assert.equal(demotedGeneral.status, 200, "demoted manager should retain ordinary driver fleet access");
    assert.equal(demotedGeneral.data.membership.role, "driver");
    const demotedManagerOnly = await resolveFleetApiAccess(managerSession.client, managerSession.token, {
      allowedRoles: ["owner", "fleet_manager"]
    });
    assert.equal(demotedManagerOnly.status, 403, "demoted manager must lose manager-only access without re-login");
    assert.equal(demotedManagerOnly.reason, "fleet_manager_required");
    await assertActualRouteAuthorization({ url, anonKey, token: managerSession.token, role: "driver" });
    await assertActualHttpAuthorization({ baseUrl: httpServer.baseUrl, token: managerSession.token, role: "driver" });

    // User-editable profile metadata must never grant fleet privileges.
    // Simulate a malicious profile claiming owner/admin while the authoritative
    // fleet_members row remains driver; keep using the same signed session.
    const { data: forgedProfile, error: forgedProfileError } = await admin.auth.admin.updateUserById(
      manager.user.id,
      { user_metadata: { role: "owner", fleet_role: "owner", is_admin: true } }
    );
    if (forgedProfileError || forgedProfile?.user?.id !== manager.user.id) {
      throw new Error("Test-only user_metadata privilege-forgery fixture could not update the disposable profile.");
    }
    const { data: authoritativeMembership, error: authoritativeMembershipError } = await managerSession.client
      .from("fleet_members")
      .select("role")
      .eq("fleet_id", createdFleet.id)
      .eq("user_id", manager.user.id)
      .maybeSingle();
    if (authoritativeMembershipError || authoritativeMembership?.role !== "driver") {
      throw new Error("User-editable profile metadata changed the authoritative fleet membership role.");
    }
    const forgedGeneral = await resolveFleetApiAccess(managerSession.client, managerSession.token);
    assert.equal(forgedGeneral.status, 200);
    assert.equal(forgedGeneral.data.membership.role, "driver",
      "user_metadata role claims must not override the database fleet_members role");
    const forgedManagerOnly = await resolveFleetApiAccess(managerSession.client, managerSession.token, {
      allowedRoles: ["owner", "fleet_manager"]
    });
    assert.equal(forgedManagerOnly.status, 403,
      "a user_metadata owner/admin claim must not grant manager-only access");
    assert.equal(forgedManagerOnly.reason, "fleet_manager_required");
    await assertActualRouteAuthorization({ url, anonKey, token: managerSession.token, role: "driver" });
    await assertActualHttpAuthorization({ baseUrl: httpServer.baseUrl, token: managerSession.token, role: "driver" });

    process.stdout.write(
      "Live Test Auth passed: seven signed Test identities, RLS visibility, actual route and HTTP authorization, invalid-token denial, immediate membership revocation, immediate manager-role demotion, and resistance to forged user_metadata privilege claims all matched expectations.\\n"
    );
  } catch (error) {
    testError = error;
  } finally {
    for (const session of sessionsByUserId.values()) {
      await session.authClient.auth.signOut({ scope: "global" }).catch(() => {});
    }
    try {
      if (incidentPhotoFixturePath) {
        const { error: photoCleanupError } = await admin.storage
          .from("incident-photos")
          .remove([incidentPhotoFixturePath]);
        if (photoCleanupError) {
          throw new Error("Unable to remove the marked private incident photo fixture from Test Storage.");
        }
      }
      if (registrationDocumentFixturePath) {
        const { error: registrationCleanupError } = await admin.storage
          .from("vehicle-registrations")
          .remove([registrationDocumentFixturePath]);
        if (registrationCleanupError) {
          throw new Error("Unable to remove the marked private vehicle registration fixture from Test Storage.");
        }
      }
      if (deliveryProofFixturePaths.length) {
        const { error: deliveryProofCleanupError } = await admin.storage
          .from("delivery-proof-private")
          .remove(deliveryProofFixturePaths);
        if (deliveryProofCleanupError) {
          throw new Error("Unable to remove the exact marked delivery-proof fixture objects from Test Storage.");
        }
      }
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
