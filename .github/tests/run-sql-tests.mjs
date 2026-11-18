import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const root = process.cwd();
const TEST_PROJECT_REF = "yxxrgblpqzhnnyojbwcr";
const PRODUCTION_PROJECT_REF = "jqebxlhhffwiebijiug";
const FIXTURE_MARKER = "trucksafe-rollback-sql-ci";
const PAGE_SIZE = 1000;
const FIXTURE_FILES = new Set([
  "lifecycle-e2e.sql",
  "daily-load-ledger-e2e.sql",
  "shipment-operations-e2e.sql",
  "road-vehicle-security-e2e.sql",
  "cross-fleet-integrity-e2e.sql",
  "cross-fleet-preflight-detects-anomalies.sql",
  "task-assignment-eligibility-e2e.sql",
]);

async function expandIncludes(file, stack = []) {
  const absolute = path.resolve(root, file);
  if (stack.includes(absolute)) {
    throw new Error(`Circular SQL include: ${[...stack, absolute].join(" -> ")}`);
  }
  const source = await readFile(absolute, "utf8");
  const lines = source.split(/\r?\n/);
  const expanded = [];
  for (const line of lines) {
    const match = line.match(/^\s*\\ir\s+(.+?)\s*$/);
    if (match) {
      const includePath = path.resolve(path.dirname(absolute), match[1]);
      expanded.push(await expandIncludes(path.relative(root, includePath), [...stack, absolute]));
    } else {
      expanded.push(line);
    }
  }
  return expanded.join("\n");
}

function readConfig() {
  const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!databaseUrl || !url || !anonKey || !serviceRoleKey) {
    throw new Error("Database integration requires the dedicated Test DB URL, Auth URL, anon key and server-side service-role key.");
  }

  const parsedAuthUrl = new URL(url);
  if (parsedAuthUrl.protocol !== "https:" || parsedAuthUrl.hostname !== `${TEST_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing SQL fixture setup: Auth URL is not the exact dedicated Test project.");
  }
  if (anonKey === serviceRoleKey) {
    throw new Error("Refusing SQL fixture setup: public and server-side keys must be different.");
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const databaseIdentity = `${parsedDatabaseUrl.hostname} ${decodeURIComponent(parsedDatabaseUrl.username || "")}`;
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
      !databaseIdentity.includes(TEST_PROJECT_REF) ||
      databaseIdentity.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Refusing SQL integration: database URI does not identify only the dedicated Test project.");
  }

  return { databaseUrl, url: parsedAuthUrl.origin, anonKey, serviceRoleKey };
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

function extractAuthFixtureRows(sql) {
  const directivePattern = /^\s*--\s*@auth-fixture\s+([a-z_][a-z0-9_]*|'[0-9a-f-]{36}')\s+([^\s]+)\s*$/gim;
  const rows = [...sql.matchAll(directivePattern)].map((match) => ({
    identity: match[1],
    email: match[2]
  }));
  return { directivePattern, rows };
}

async function prepareSqlFixtures(sql, file, admin, createdUsers) {
  const { directivePattern, rows } = extractAuthFixtureRows(sql);
  if (rows.length === 0) return sql;

  const replacements = new Map();
  for (const row of rows) {
    const [localPart, domain] = row.email.split("@");
    if (!localPart || !domain) throw new Error("Invalid email in SQL fixture definition.");
    const email = `${localPart}-${randomUUID()}@${domain}`;
    const password = randomBytes(36).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        trucksafe_ci_fixture: FIXTURE_MARKER,
        fixture_file: path.basename(file)
      }
    });
    if (error || !data?.user?.id) {
      throw new Error("Supabase Auth Admin API could not create a disposable Test fixture user.");
    }
    createdUsers.push(data.user.id);

    if (row.identity.startsWith("'")) {
      const originalId = row.identity.slice(1, -1);
      if (replacements.has(originalId)) throw new Error("Duplicate Auth fixture UUID in one SQL test.");
      replacements.set(originalId, data.user.id);
    } else {
      const variablePattern = new RegExp(`\\b${row.identity}\\s+uuid\\s*:=\\s*'([0-9a-f-]{36})'`, "i");
      const declaration = sql.match(variablePattern);
      if (!declaration) {
        throw new Error(`Could not bind Auth Admin fixture to SQL variable ${row.identity} in ${file}.`);
      }
      const originalId = declaration[1];
      if (replacements.has(originalId)) throw new Error("Duplicate Auth fixture UUID in one SQL test.");
      replacements.set(originalId, data.user.id);
    }
  }

  let prepared = sql.replace(
    directivePattern,
    "-- Auth user fixture created by Supabase Auth Admin API in run-sql-tests.mjs.\n"
  );
  for (const [originalId, userId] of replacements) {
    prepared = prepared.split(originalId).join(userId);
  }

  if (/\b(?:insert|update|delete)\s+(?:into\s+)?auth\.users\b/i.test(prepared)) {
    throw new Error(`Direct SQL mutation of auth.users remains in ${file}; refusing to execute.`);
  }
  return prepared;
}

async function deleteCreatedFixtureUsers(admin, userIds) {
  const failures = [];
  for (const userId of [...userIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) failures.push(userId);
  }
  if (failures.length) {
    throw new Error(`Auth Admin API cleanup failed for ${failures.length} disposable Test fixture user(s).`);
  }
}

async function listMarkedSqlFixtureUsers(admin) {
  const matches = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error("Unable to enumerate disposable SQL fixture users in the dedicated Test project.");
    const users = data?.users ?? [];
    matches.push(...users.filter(user =>
      user.app_metadata?.trucksafe_ci_fixture === FIXTURE_MARKER
    ));
    if (users.length < PAGE_SIZE) break;
  }
  return matches;
}

async function cleanupMarkedSqlFixtureUsers(admin) {
  const users = await listMarkedSqlFixtureUsers(admin);
  for (const user of users) {
    const fixtureFile = user.app_metadata?.fixture_file;
    const email = user.email ?? "";
    if (!FIXTURE_FILES.has(fixtureFile) || !/@example\.(?:invalid|com)$/i.test(email)) {
      throw new Error("Refusing SQL fixture cleanup: a marked user has an unexpected file or email identity.");
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("Unable to delete a marked disposable SQL fixture user through Auth Admin API.");
  }

  // Auth user deletion can be visible to the Admin API's paginated list a
  // short time after deleteUser returns. Verify with a bounded retry instead
  // of reporting a false cleanup failure on the first eventually-consistent read.
  let remaining = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    remaining = await listMarkedSqlFixtureUsers(admin);
    if (remaining.length === 0) return users.length;
    // Re-issue deletion for any still-visible marked identities. This also
    // catches fixtures left by a cancelled sibling run; final verification
    // remains mandatory and no unmarked account can enter this path.
    for (const user of remaining) {
      const fixtureFile = user.app_metadata?.fixture_file;
      const email = user.email ?? "";
      if (!FIXTURE_FILES.has(fixtureFile) || !/@example\.(?:invalid|com)$/i.test(email)) {
        throw new Error("Refusing SQL fixture cleanup retry: a marked user has an unexpected file or email identity.");
      }
      await admin.auth.admin.deleteUser(user.id);
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error("SQL Auth fixture cleanup verification failed; marked Test users remain.");
}

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_TEST_DB_URL is required");

const files = [
  ".github/tests/fk-index-migration-e2e.sql",
  ".github/tests/active-trip-uniqueness-e2e.sql",
  ".github/tests/lifecycle-e2e.sql",
  ".github/tests/daily-load-ledger-e2e.sql",
  ".github/tests/shipment-operations-e2e.sql",
  ".github/tests/road-vehicle-security-e2e.sql",
  ".github/tests/route-quota-e2e.sql",
  ".github/tests/cross-fleet-integrity-e2e.sql",
  ".github/tests/cross-fleet-preflight-detects-anomalies.sql",
  ".github/tests/query-plan-performance-e2e.sql",
  ".github/tests/vehicle-special-equipment-schema-e2e.sql",
  ".github/tests/task-assignment-eligibility-e2e.sql",
];

const { databaseUrl: verifiedDatabaseUrl, url, anonKey, serviceRoleKey } = readConfig();
const admin = createAdminClient(url, serviceRoleKey);
if (process.argv.includes("--cleanup-only")) {
  const removed = await cleanupMarkedSqlFixtureUsers(admin);
  console.log(`Cleaned ${removed} marked disposable SQL Auth fixture user(s) through Auth Admin API.`);
  process.exit(0);
}
const staleRemoved = await cleanupMarkedSqlFixtureUsers(admin);
if (staleRemoved) {
  console.log(`Cleaned ${staleRemoved} stale disposable SQL Auth fixture user(s) before starting.`);
}
const client = new Client({
  connectionString: verifiedDatabaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  query_timeout: 120000,
});

try {
  await client.connect();
  for (const file of files) {
    const createdUsers = [];
    let testError;
    try {
      console.log(`Running rollback-only SQL test: ${file}`);
      let sql = await expandIncludes(file);
      sql = await prepareSqlFixtures(sql, file, admin, createdUsers);
      if (createdUsers.length) {
        console.log(`Created ${createdUsers.length} disposable Auth fixture user(s) through Auth Admin API for ${file}.`);
      }
      // These SQL scripts test PostgreSQL RLS with synthetic request.jwt.claim settings.
      // They are database-policy tests, not signed-token or Supabase Auth E2E tests.
      const results = await client.query(sql);
      if (file === ".github/tests/cross-fleet-integrity-e2e.sql") {
        const resultList = Array.isArray(results) ? results : [results];
        const preflight = resultList.find((result) =>
          result.fields?.some((field) => field.name === "relationship")
        );
        if (!preflight) {
          throw new Error("Cross-fleet preflight diagnostic did not return its expected result set");
        }
        if (preflight.rows.length !== 0) {
          throw new Error(`Cross-fleet preflight found ${preflight.rows.length} unexpected violation(s)`);
        }
        console.log("PASS: populated synthetic fixture has zero cross-fleet preflight findings");
      }
      if (file === ".github/tests/cross-fleet-preflight-detects-anomalies.sql") {
        const resultList = Array.isArray(results) ? results : [results];
        const preflight = resultList.find((result) =>
          result.fields?.some((field) => field.name === "relationship")
        );
        if (!preflight) {
          throw new Error("Anomaly preflight diagnostic did not return its expected result set");
        }
        if (
          preflight.rows.length !== 1 ||
          preflight.rows[0].relationship !== "tasks.assigned_driver_id"
        ) {
          throw new Error(
            `Expected exactly one tasks.assigned_driver_id anomaly; received ${preflight.rows.length} finding(s)`
          );
        }
        console.log("PASS: preflight detects the synthetic cross-fleet task-driver anomaly");
      }
      if (file === ".github/tests/query-plan-performance-e2e.sql") {
        const resultList = Array.isArray(results) ? results : [results];
        const plans = resultList.filter((result) =>
          result.fields?.some((field) => field.name === "QUERY PLAN")
        );
        if (plans.length !== 2) {
          throw new Error("Expected 2 EXPLAIN plans; received " + plans.length);
        }
        const expectedIndexes = [
          "idx_trucksafe_perf_tasks_fleet_status",
          "idx_trucksafe_perf_locations_trip_recorded",
        ];
        for (let index = 0; index < plans.length; index += 1) {
          const rawPlan = plans[index].rows[0]?.["QUERY PLAN"];
          const document = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
          const indexNames = [];
          const visit = (node) => {
            if (!node || typeof node !== "object") return;
            if (node["Index Name"]) indexNames.push(node["Index Name"]);
            for (const child of node.Plans ?? []) visit(child);
          };
          visit(document?.Plan);
          if (!indexNames.includes(expectedIndexes[index])) {
            throw new Error("Expected query plan to use " + expectedIndexes[index] +
              "; found: " + (indexNames.join(", ") || "no index"));
          }
          if (document?.Plan?.["Actual Rows"] !== 100) {
            throw new Error("Expected 100 returned rows for " + expectedIndexes[index] +
              "; received " + document?.Plan?.["Actual Rows"]);
          }
          if (!Number.isFinite(document?.["Execution Time"])) {
            throw new Error("Missing execution time for " + expectedIndexes[index]);
          }
          console.log("PASS: " + expectedIndexes[index] + " used; 100 rows returned in " +
            document["Execution Time"].toFixed(3) + " ms");
        }
      }
      console.log(`PASS: ${file}`);
    } catch (error) {
      testError = error;
    } finally {
      // Ensure an interrupted multi-statement test cannot leave the connection in an open transaction.
      await client.query("ROLLBACK").catch(() => {});
      try {
        await deleteCreatedFixtureUsers(admin, createdUsers);
      } catch (cleanupError) {
        if (!testError) testError = cleanupError;
        else console.error("Auth fixture cleanup also failed:", cleanupError.message);
      }
    }
    if (testError) throw testError;
  }
} catch (error) {
  console.error("Database integration test failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
