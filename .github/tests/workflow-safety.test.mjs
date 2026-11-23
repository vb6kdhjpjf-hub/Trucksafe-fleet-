import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backup = await readFile(".github/workflows/supabase-schema-backup.yml", "utf8");
const restore = await readFile(".github/workflows/restore-test-schema.yml", "utf8");
const validation = await readFile(".github/workflows/isolated-validation.yml", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const supabaseConfig = await readFile("supabase/config.toml", "utf8");
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
  assert.match(restore, ¶»§q«^