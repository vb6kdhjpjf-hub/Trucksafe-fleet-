import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backup = await readFile(".github/workflows/supabase-schema-backup.yml", "utf8");
const restore = await readFile(".github/workflows/restore-test-schema.yml", "utf8");
const validation = await readFile(".github/workflows/isolated-validation.yml", "utf8");
const liveAuth = await readFile(".github/tests/live-supabase-auth.integration.mjs", "utf8");

test("schema backup exports schema only and retains its artifact for seven days", () => {
  assert.match(backup, /supabase db dump --db-url="\$SUPABASE_DB_URL" --file=schema\.sql/);
  assert.match(backup, /name: trucksafe-schema-only/);
  assert.match(backup, /retention-days: 7/);
  assert.doesNotMatch(backup, /pg_dumpall|--data-only|COPY\s+.*FROM\s+stdin/i);
});

test("schema restore consumes the exact artifact from a user-selected successful backup run", () => {
  assert.match(restore, /schema_backup_run_id:[\s\S]*?required: true[\s\S]*?type: string/);
  assert.match(restore, /SCHEMA_BACKUP_RUN_ID: \$\{\{ inputs\.schema_backup_run_id \}\}/);
  assert.match(restore, /name: trucksafe-schema-only/);
  assert.match(restore, /run-id: \$\{\{ inputs\.schema_backup_run_id \}\}/);
  assert.match(restore, /gh run view "\$SCHEMA_BACKUP_RUN_ID"[^\n]*--json status,conclusion,workflowName/);
  assert.match(restore, /workflowName.*Supabase schema-only backup/);
  assert.match(restore, /if: \$\{\{ inputs\.confirm_restore == 'RESTORE' \}\}/);
});

test("schema restore is locked to the isolated Test project and refuses non-empty targets", () => {
  assert.match(restore, /postgres\.yxxrgblpqzhnnyojbwcr/);
  assert.match(restore, /Refusing connection: expected this test project's Session pooler/);
  assert.match(restore, /table_count/);
  assert.match(restore, /Refusing to overwrite a test database that already contains public tables/);
  assert.match(restore, /--single-transaction/);
  assert.doesNotMatch(restore, /SUPABASE_DB_URL|jqebxlhhffwiebijiug/);
});


test("database integration explicitly rejects the exact Production project ref", () => {
  assert.match(validation, /if "yxxrgblpqzhnnyojbwcr" not in identity/);
  assert.match(validation, /if "jqebxlhhffwiebijiug" in identity/);
  assert.doesNotMatch(validation, /jqebxlhhffwiebijiugx/);
});


test("live Test Auth credentials are isolated from pull_request execution", () => {
  const authJob = validation.slice(validation.indexOf("  auth-integration:"));
  assert.ok(authJob.includes("github.event_name == 'push'"));
  assert.ok(authJob.includes("refs/heads/test/isolated-e2e-ci"));
  assert.ok(authJob.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(authJob.includes("inputs.confirm_test_auth == true"));
  assert.ok(!authJob.includes("github.event_name == 'pull_request'"));
  assert.ok(liveAuth.includes("parsed.hostname !== `${TEST_PROJECT_REF}.supabase.co`"));
  assert.ok(liveAuth.includes("parsed.hostname !== `${TEST_PROJECT_REF}.supabase.co`"));
  assert.ok(liveAuth.includes("const TEST_PROJECT_REF = \"yxxrgblpqzhnnyojbwcr\";"));
  assert.ok(!liveAuth.includes("jqebxlhhffwiebijiug"));
  assert.ok(!authJob.includes("jqebxlhhffwiebijiug"));
});

 
test("live Auth cleanup always runs after the fixture attempt and uses only Auth Admin cleanup", () => {
  const authJob = validation.slice(validation.indexOf("  auth-integration:"));
  assert.match(authJob, /if: always\(\) && steps\.auth-secrets\.outputs\.available == 'true' && steps\.install\.outcome == 'success'/);
  assert.match(authJob, /node \.github\/tests\/live-supabase-auth\.integration\.mjs --cleanup-only/);
  assert.match(liveAuth, /admin\.auth\.admin\.createUser/);
  assert.match(liveAuth, /admin\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(liveAuth, /INSERT\s+INTO\s+auth\.users/i);
});

test("live Auth fixture creates and cleans uniquely marked Test-only fleets and role memberships", () => {
  assert.match(liveAuth, /FIXTURE_FLEET_PREFIX/);
  assert.match(liveAuth, /fleet_manager/);
  assert.match(liveAuth, /admin\\.from\\("fleet_members"\\)\\.insert/);
  assert.match(liveAuth, /removeOwnedFixtureFleets/);
  assert.match(liveAuth, /expectedVisible = role === "owner" \\|\\| role === "fleet_manager" \\? 3 : 1/);
  assert.match(liveAuth, /fleet_membership_required|fleet_manager_required/);
  assert.match(liveAuth, /parsed.hostname !== `\\$\\{TEST_PROJECT_REF\\}.supabase.co`/);
  assert.match(liveAuth, /admin\\.auth\\.admin\\.createUser/);
  assert.match(liveAuth, /admin\\.auth\\.admin\\.deleteUser/);
  assert.doesNotMatch(liveAuth, /INSERT\\s+INTO\\s+auth\\.users/i);
  assert.match(liveAuth, /\\.from\\("fleets"\\)\\s*\\n\\s*\\.insert/);
  assert.match(liveAuth, /\\.from\\("fleet_members"\\)\\.insert/);
});
