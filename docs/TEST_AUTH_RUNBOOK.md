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
2. Creates five disposable identities (owner, fleet manager, driver, a multi-fleet ambiguous identity, and an unassigned user) only through the Supabase Auth Admin API.
3. Signs each identity in through the public Auth API and validates its real signed JWT with `auth.getUser`.
4. Creates two uniquely named fleets through the dedicated Test service-role client: one owned by the owner identity and one owned by the ambiguous identity. The database's existing owner-membership trigger must create both owner rows.
5. Adds only the marked manager/driver memberships plus a driver membership for the ambiguous identity in the first fleet. The ambiguous identity therefore has exactly two distinct fleet memberships.
6. Verifies real PostgREST membership reads, ordinary fleet API access, manager-only allow/deny decisions, role-dependent RLS visibility (owner/manager see all four membership rows in the first fleet; each driver sees only its own row), and fail-closed denial when the ambiguous identity can see two self-membership rows.
7. Builds the production Next.js app against the dedicated Test public URL/anon key with provider keys empty and coverage approval false. The app server process is explicitly stripped of the Test service-role secret and bound only to `127.0.0.1`.
8. Invokes the actual exported POST handlers in-process and sends the same signed identities over real HTTP requests to `ptv-profile-check`, `ptv-routing-check`, and `truck-route`. Owner/manager pass the PTV role gate and stop at the missing-key 503; driver receives 403; the unassigned and ambiguous users receive 403; a deliberately invalid bearer receives 401. Fleet members with exactly one membership reach the truck-route coverage gate and receive 503 because coverage approval is explicitly false. All HTTP route responses are checked for `Cache-Control: no-store`.
9. Deletes uniquely marked fixture fleets first (cascading app rows and memberships), verifies each fleet is gone, then deletes only marked Auth users through Auth Admin API and asserts no marked users remain.
10. Creates one synthetic shipment/stop in Fleet A and uploads signature/photo fixtures to the private `delivery-proof-private` bucket using Fleet A's signed session. It verifies an active assigned driver and Fleet A owner can upload and create short-lived signed read URLs, while Fleet B cannot read by guessed path, upload into Fleet A's path, or delete another user's object. It also verifies that an assigned driver and fleet owner can delete only their own unreferenced failed-upload objects.
11. Re-authenticates the two exact retained Test-only identities (owner and assigned driver) for the legacy immutable-proof fixture. Using their real signed JWTs, it verifies both can read the referenced signature/photo but neither can delete either referenced object; it then uploads temporary unreferenced files and checks same-user cleanup succeeds while cross-user deletion is filtered. No immutable proof row is inserted or deleted during this check.
12. The rollback-only SQL suite exercises delivery-note issuance, idempotency, immutable snapshots, authorized signature exceptions, server-side 10 MiB per-photo / 40 MiB aggregate limits, shipment/cargo cascade behavior, and the exact RLS policy definitions for private Storage cleanup.
13. The same-user cleanup rule is installed by `20261119120000_allow_cleanup_unreferenced_delivery_proof_uploads.sql`; it checks `owner_id`, the exact shipment/stop path, an active assigned driver or permitted fleet role, and absence of any immutable proof reference.

The script has a hard HTTPS hostname guard for the exact Test project. It does not query or write Production. It never inserts into or deletes from `auth.users` directly. It does not change RLS, deploy an Edge Function, merge the PR, or deploy the app.

A cleanup failure is treated as critical and stops the job. One exact legacy Test-only fleet and its seven marked Auth fixture identities are explicitly retained because that failed historical run contains an immutable delivery proof; cleanup verifies its exact fleet, proof, shipment, driver and both private objects before preserving it. The cleanup never disables immutable triggers or deletes referenced proof objects. All newly created run fixtures are still deleted and verified. A skipped live Auth job is not a passing live test.

## Current coverage boundaries

This proves signed-token authentication and live PostgREST/RLS behavior across two isolated Test fleets, including owner, fleet_manager, driver, a user with two fleet memberships, and an unassigned Auth identity that has no fleet membership. It also exercises real private Storage upload/read behavior, cross-fleet denial, same-user unreferenced-object cleanup, MIME/size rejection, and exact-path service-role fixture cleanup. It separately exercises immutable-reference DELETE denial against the one explicitly retained legacy Test proof using real owner/driver JWTs. It exercises the actual three Next.js POST route-handler functions in-process using the signed tokens, including unauthenticated and unassigned denials. Fleet and membership fixture setup uses the dedicated Test service-role client; the tested reads and route authorization gates use each user's real signed JWT. It also proves the shared API authorization helper's manager-only role gate, explicitly rejects ambiguous multi-fleet membership, and exercises the actual production-mode Next.js HTTP server locally (loopback only) with signed Test JWTs. It does not prove the user-facing fleet-creation RLS policy. It is not a browser end-to-end test of the deployed application, does not prove production configuration, and does not validate PTV/HERE routing. The routing provider remains disabled pending separate safety approval and authoritative restriction coverage.

The SQL RLS integration suite remains rollback-only and uses synthetic JWT claim settings; it is distinct from the signed-token live Auth suite.

## Important workflow trigger distinction

The `auth-integration` job is intentionally restricted to direct pushes on `test/isolated-e2e-ci` and the dedicated current-candidate validation branch `test/current-candidate-auth-e2e` (plus the separately guarded routing-fix test branch), or a manual dispatch on `test/isolated-e2e-ci` with explicit confirmation. Pull-request events do not receive the live Test Auth secrets.


The HTTP checks run against a local production-mode Next.js server on 127.0.0.1, not a deployed server. They stop at deliberately disabled configuration/safety gates; they do not test paid provider integrations, vehicle-specific route calculation, post-gate quota behavior, browser sessions, or production deployment.
