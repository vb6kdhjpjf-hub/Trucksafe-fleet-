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
