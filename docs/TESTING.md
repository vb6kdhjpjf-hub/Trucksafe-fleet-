# TruckSafe Fleet validation guide

## Current validation layers

The `test/isolated-e2e-ci` branch runs two independent CI jobs:

1. **Application validation** — production dependency audit, application/safety/workflow tests, Next.js build, and concurrent application smoke tests.
2. **Database integration** — rollback-only SQL checks against the dedicated TruckSafe Fleet Test Supabase project. The workflow validates the database URI against the Test project identifier and refuses a Production target.

The database test runner executes the SQL files in `.github/tests/` inside transactions and rolls them back. These tests are intended to validate constraints, policy behavior, and database workflows without persisting fixture records or schema changes.

## RLS test scope and limitations

`.github/tests/cross-fleet-integrity-e2e.sql` exercises PostgreSQL row-level security with the database role `authenticated` and synthetic request JWT claim settings (`request.jwt.claim.sub` and `request.jwt.claim.role`). It verifies:

- Fleet owners cannot read or update another fleet's protected records.
- Drivers can read only their assigned vehicle, assigned task, own trip, and own inspections.
- Drivers cannot update vehicle, task, trip, inspection, or incident records, and cannot delete vehicles.
- Cross-fleet references are rejected by database constraints.

**Important:** setting PostgreSQL request-claim variables is a synthetic claim simulation. It is not a signed JWT, does not validate a real Supabase Auth session, and is not live Supabase Auth end-to-end coverage. The local Supabase JS SDK fixture in `.github/tests/fleet-api-access.integration.test.mjs` is also a local protocol fixture, not a connection to a live Auth service.

## Required next stage for live Auth coverage

Do not create test identities by directly inserting into or deleting from `auth.users`. Before live Auth E2E is introduced, establish a disposable Test-only Auth fixture that:

- Uses Supabase Auth Admin APIs from a trusted server-side test runner.
- Is restricted to the dedicated Test project and cannot target Production.
- Creates uniquely identified synthetic users and records their IDs for cleanup.
- Cleans up users through the Auth Admin API in a guaranteed teardown path, including failed tests.
- Never exposes service-role credentials to browser code, client bundles, logs, or chat.

Until that fixture and cleanup guarantees are in place, report the current coverage accurately as synthetic-claim PostgreSQL RLS integration plus local SDK protocol tests. The expanded driver write-denial checks were added in commit `c124f9c` and passed both CI jobs (`validate` and `database-integration`) against the dedicated Test database.

## Opt-in live Supabase Auth integration

The optional `auth-integration` job runs only on pushes to `test/isolated-e2e-ci`; it does not receive Auth secrets on pull-request events. It runs only when all three GitHub Actions secrets are configured:

- `SUPABASE_TEST_URL` — must resolve exactly to `https://yxxrgblpqzhnnyojbwcr.supabase.co`.
- `SUPABASE_TEST_ANON_KEY` — public Test-project key used only by the server-side test runner.
- `SUPABASE_TEST_SERVICE_ROLE_KEY` — privileged Test-project key used only by the server-side Admin API client.

The runner refuses any other URL, creates one confirmed synthetic Test Auth user through `auth.admin.createUser()`, signs in through the public Auth endpoint, validates the resulting signed access token with Auth, then performs a real `fleet_members` PostgREST lookup and verifies that a user with no membership is denied by the API. It does not create fleet memberships or modify application tables.

The cleanup selector requires both a server-controlled `app_metadata.trucksafe_ci_fixture` marker and the dedicated `trucksafe-ci-` email prefix. It sweeps stale marked identities before a run, removes the created fixture in a `finally` path, and runs a second cleanup step with `if: always()`. If a runner is terminated before cleanup, the next Test Auth run sweeps any remaining marked fixture before creating another. Cleanup is performed only through the Supabase Auth Admin API; there are no direct writes to `auth.users`.

The live test intentionally covers a real signed-in identity with **zero** fleet memberships. It does not yet prove positive membership access, role-specific RLS, or cross-fleet authorization using live Auth users. Those remain separate gates and must not be inferred from this smoke test or from synthetic SQL claim simulations. If the three secrets are absent, the job emits a notice and skips the live test rather than claiming it passed.

## Release and safety gates

- Keep PR #15 open and in Draft until explicitly authorized otherwise.
- Do not merge or deploy as part of this validation work.
- Do not modify Production schema or data.
- Do not enable production HERE/PTV navigation or claim nationwide restriction coverage without verified authoritative source coverage, freshness, licensing, and independent safety review.
- A passing CI run is evidence for the tested code paths only; it is not a certification that truck routes are safe or that all fleet permissions are correct.

## Security advisor review (Test project)

The latest Test-project security advisor still reports two authenticated-callable `SECURITY DEFINER` RPCs: `public.start_trip_with_inspection` and `public.finish_trip`. A read-only review found that these are deliberate atomic trip operations: they derive the actor from `auth.uid()`, check fleet membership and applicable role/driver constraints, use a pinned empty `search_path`, and are not executable by `anon`. Do not change them to `SECURITY INVOKER` or revoke authenticated execution merely to silence the generic lint; first add live signed-in positive and negative-path coverage and review the complete call sites.

The Test performance advisor also reports two unindexed nullable reviewer foreign keys (`road_restrictions.verified_by` and `vehicles.registration_verified_by`). Additive index migration and rollback-only test candidates exist in the branch but have not been applied persistently. The advisor reports 17 currently unused indexes; do not remove them without workload evidence.
