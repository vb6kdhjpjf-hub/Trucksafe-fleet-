# Test Auth validation runbook

This runbook applies only to the dedicated Supabase Test project (`yxxrgblpqzhnnyojbwcr`).

## Required GitHub Actions repository secrets

- `SUPABASE_TEST_URL` — `https://yxxrgblpqzhnnyojbwcr.supabase.co`
- `SUPABASE_TEST_ANON_KEY` — the Test project's public anon/publishable API key
- `SUPABASE_TEST_SERVICE_ROLE_KEY` — the Test project's server-side secret/service-role key

Never use Production project keys. Never paste secret values into chat, source files, client-side code, or logs.

## Running the check

A push to `test/isolated-e2e-ci` starts the isolated validation workflow. The `auth-integration` job checks for all three secrets and skips the live test if any are missing. When available, it creates a disposable Auth fixture only through the Supabase Auth Admin API, signs in through the public Auth API, verifies the signed-in identity and fail-closed access with no fleet membership, then cleans up the marked fixture through the Auth Admin API.

The test does not create fleet memberships, write application tables, touch Production, merge the pull request, or deploy the application. A skipped job is not a passing live Auth test. The current live test does not prove positive membership access, role-specific RLS, or cross-fleet authorization.

### Important trigger distinction

The `auth-integration` job is intentionally restricted to a direct `push` on `test/isolated-e2e-ci`. When this workflow runs for a `pull_request` event, the job is expected to show as skipped (gray, 0 seconds). To execute the live Auth check, a new commit must be pushed to the dedicated test branch; do not use “Re-run jobs” on a pull-request-triggered run.

 
## Gate before adding positive-membership live E2E

Do not add a live owner/manager/driver membership fixture until all of the following have been inspected and documented against the current Test schema:

1. The exact columns, required fields, foreign keys, unique constraints, RLS policies, grants, and triggers for `fleets`, `fleet_members`, and any dependent rows.
2. Whether fleet creation automatically creates an owner membership, and whether a supported application/admin API exists for adding a driver membership.
3. A Test-only fixture namespace/marker strategy that cannot match ordinary user or fleet records.
4. Cleanup order for membership rows, dependent fleet rows, and Auth users, with retry-safe behavior and a post-cleanup zero-row assertion.
5. A hard project-host guard for every privileged client and a fail-closed check that Production project ref `jqebxlhhffwiebijiug` is absent.
6. A dry-run/preflight that proves the target fixture IDs are unique and no pre-existing rows will be changed or deleted.

Only after this gate passes should a dedicated Test-only fixture create an owner and driver, obtain signed sessions through Auth, and verify both allowed and denied API/RLS paths. Prefer supported Supabase Auth Admin APIs for identities; never insert or delete rows in `auth.users` directly. Do not deploy helper functions or weaken RLS to make a test pass.

Until that work is complete, describe current live Auth coverage accurately: a signed Test user with no fleet membership is denied. Role matrix tests use a local Auth/PostgREST contract fixture, and database RLS tests use synthetic JWT claim settings inside rollback-only transactions; neither is a live signed-token positive-membership E2E.
