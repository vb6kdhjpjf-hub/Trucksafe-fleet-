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
2. Creates four disposable identities (owner, fleet manager, driver, and an unassigned user) only through the Supabase Auth Admin API.
3. Signs each identity in through the public Auth API and validates its real signed JWT with `auth.getUser`.
4. Creates one uniquely named fleet through the dedicated Test service-role client with the owner Auth user as its owner. The database's existing owner-membership trigger must create the owner row; all subsequent membership reads and authorization assertions use the users' real signed JWTs.
5. Adds only the two marked manager/driver memberships through the dedicated Test project's service-role PostgREST client.
6. Verifies real PostgREST membership reads, ordinary fleet API access, manager-only allow/deny decisions, and role-dependent RLS visibility (owner/manager see all three fleet membership rows; driver sees only its own).
7. Deletes uniquely marked fixture fleets first (cascading app rows and memberships), verifies each fleet is gone, then deletes only marked Auth users through Auth Admin API and asserts no marked users remain.
8. Builds the production Next.js app against the dedicated Test public URL/anon key with provider keys empty and coverage approval false, then starts `next start` bound only to `127.0.0.1`. The app server process is explicitly stripped of the Test service-role secret.
9. Invokes the actual exported POST handlers in-process and sends the same signed identities over real HTTP requests to `ptv-profile-check`, `ptv-routing-check`, and `truck-route`. Owner/manager pass the PTV role gate and stop at the missing-key 503; driver receives 403; the unassigned user receives 403; a deliberately invalid bearer receives 401. Fleet members reach the truck-route coverage gate and receive 503 because coverage approval is explicitly false. All three HTTP route responses are checked for `Cache-Control: no-store`.


The script has a hard HTTPS hostname guard for the exact Test project. It does not query or write Production. It never inserts into or deletes from `auth.users` directly. It does not change RLS, deploy an Edge Function, merge the PR, or deploy the app.

A cleanup failure is treated as critical and stops the job; marked users are retained if their owned fleet cannot be safely removed, so a subsequent cleanup-only run can retry. A skipped live Auth job is not a passing live test.

## Current coverage boundaries

This proves signed-token authentication and live PostgREST/RLS behavior for one isolated Test fleet with owner, fleet_manager, and driver memberships, plus an unassigned Auth identity that has no fleet membership. It exercises the actual three Next.js POST route-handler functions in-process using the signed tokens, including unauthenticated and unassigned denials. Fleet and membership fixture setup uses the dedicated Test service-role client; the tested reads and route authorization gates use each user's real signed JWT. It also proves the shared API authorization helper's manager-only role gate and exercises the actual production-mode Next.js HTTP server locally (loopback only) with signed Test JWTs. It does not prove the user-facing fleet-creation RLS policy. It is not a browser end-to-end test of the deployed application, does not prove production configuration, and does not validate PTV/HERE routing. The routing provider remains disabled pending separate safety approval and authoritative restriction coverage.

The SQL RLS integration suite remains rollback-only and uses synthetic JWT claim settings; it is distinct from the signed-token live Auth suite.

## Important workflow trigger distinction

The `auth-integration` job is intentionally restricted to a direct `push` on `test/isolated-e2e-ci`, or a manual dispatch on that branch with explicit confirmation. Pull-request events do not receive the live Test Auth secrets.


The HTTP checks run against a local production-mode Next.js server on 127.0.0.1, not a deployed server. They stop at deliberately disabled configuration/safety gates; they do not test paid provider integrations, vehicle-specific route calculation, post-gate quota behavior, browser sessions, or production deployment.
