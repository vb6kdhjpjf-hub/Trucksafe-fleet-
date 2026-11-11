# Test Auth validation runbook

This runbook applies only to the dedicated Supabase Test project (`yxxrgblpqzhnnyojbwcr`).

## Required GitHub Actions repository secrets

- `SUPABASE_TEST_URL` — `https://yxxrgblpqzhnnyojbwcr.supabase.co`
- `SUPABASE_TEST_ANON_KEY` — the Test project's public anon/publishable API key
- `SUPABASE_TEST_SERVICE_ROLE_KEY` — the Test project's server-side secret/service-role key

Never use Production project keys. Never paste secret values into chat, source files, client-side code, or logs.

## Live signed-session role integration

A push to `test/isolated-e2e-ci` runs the live Auth check only when all three dedicated Test secrets are available. The fixture:

1. Enumerates and removes only prior Auth users carrying the exact server-controlled app-metadata marker, dedicated email prefix, and `@example.com` suffix.
2. Creates three disposable identities (owner, fleet manager, driver) only through the Supabase Auth Admin API.
3. Signs each identity in through the public Auth API and validates its real signed JWT with `auth.getUser`.
4. Creates one uniquely named fleet through the dedicated Test service-role client with the owner Auth user as its owner. The database's existing owner-membership trigger must create the owner row; all subsequent membership reads and authorization assertions use the users' real signed JWTs.
5. Adds only the two marked manager/driver memberships through the dedicated Test project's service-role PostgREST client.
6. Verifies real PostgREST membership reads, ordinary fleet API access, manager-only allow/deny decisions, and role-dependent RLS visibility (owner/manager see all three membership rows; driver sees only its own).
7. Deletes uniquely marked fixture fleets first (cascading app rows and memberships), verifies each fleet is gone, then deletes only marked Auth users through Auth Admin API and asserts no marked users remain.

The script has a hard HTTPS hostname guard for the exact Test project. It does not query or write Production. It never inserts into or deletes from `auth.users` directly. It does not change RLS, deploy an Edge Function, merge the PR, or deploy the app.

A cleanup failure is treated as critical and stops the job; marked users are retained if their owned fleet cannot be safely removed, so a subsequent cleanup-only run can retry. A skipped live Auth job is not a passing live test.

## Current coverage boundaries

This proves signed-token authentication and live PostgREST/RLS behavior for one isolated Test fleet with owner, fleet_manager, and driver memberships. Fleet and membership fixture setup uses the dedicated Test service-role client; the tested reads and role gates use each user's real signed JWT. It also proves the shared API authorization helper's manager-only role gate. It does not prove the user-facing fleet-creation RLS policy. It is not a browser end-to-end test of the deployed application, does not prove production configuration, and does not validate PTV/HERE routing. The routing provider remains disabled pending separate safety approval and authoritative restriction coverage.

The SQL RLS integration suite remains rollback-only and uses synthetic JWT claim settings; it is distinct from the signed-token live Auth suite.

## Important workflow trigger distinction

The `auth-integration` job is intentionally restricted to a direct `push` on `test/isolated-e2e-ci`, or a manual dispatch on that branch with explicit confirmation. Pull-request events do not receive the live Test Auth secrets.
