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

## Live Supabase Auth integration

The `auth-integration` job runs only on a direct push to `test/isolated-e2e-ci`, or on a manual dispatch on that branch with explicit confirmation. Pull-request events do not receive the live Test Auth secrets. The job runs only when all three dedicated Test secrets are configured:

- `SUPABASE_TEST_URL` — must resolve exactly to `https://yxxrgblpqzhnnyojbwcr.supabase.co`.
- `SUPABASE_TEST_ANON_KEY` — public Test-project key used only by the server-side test runner.
- `SUPABASE_TEST_SERVICE_ROLE_KEY` — privileged Test-project key used only by the server-side Auth Admin client.

The runner has a hard hostname guard and refuses Production. It creates seven disposable identities through Supabase Auth Admin APIs, signs in through the public Auth API, validates their real signed JWTs, and uses their tokens for actual PostgREST and local production-mode HTTP requests. The identities cover owner, fleet manager, dispatcher, safety manager, driver, a user with ambiguous multi-fleet membership, and an unassigned user. Coverage includes role-specific RLS visibility, manager-only access, fail-closed ambiguous membership, unauthenticated and invalid-token denial, actual API route authorization, immediate membership revocation, immediate manager-role demotion, and rejection of forged `user_metadata` privilege claims.

The app server is bound to `127.0.0.1`; the Test service-role key is kept out of the server process and browser bundle. Provider keys remain empty and routing coverage approval remains false, so the tests stop at the configured safety gates rather than invoking HERE/PTV or claiming safe routing.

Cleanup uses only the Supabase Auth Admin API and exact server-controlled fixture markers. It removes marked fleets and users in a guaranteed teardown path and performs a second cleanup step with `if: always()`. The latest verified run removed all seven identities and fleets; the follow-up sweep found zero remaining fixtures. No direct writes to `auth.users` are permitted.

This live signed-token suite is distinct from rollback-only SQL tests that simulate JWT claims using PostgreSQL request settings. The latter do not validate signed tokens. Neither suite is a browser E2E test against a deployed app, proves production configuration, or validates routing-provider accuracy or Israeli restriction coverage. If the secrets are absent, Auth integration is skipped and must not be reported as passed.

## Release and safety gates

- Keep PR #15 open and in Draft until explicitly authorized otherwise.
- Do not merge or deploy as part of this validation work.
- Do not modify Production schema or data.
- Do not enable production HERE/PTV navigation or claim nationwide restriction coverage without verified authoritative source coverage, freshness, licensing, and independent safety review.
- A passing CI run is evidence for the tested code paths only; it is not a certification that truck routes are safe or that all fleet permissions are correct.

## Security advisor review (Test project)

The latest Test-project security advisor still reports two authenticated-callable `SECURITY DEFINER` RPCs: `public.start_trip_with_inspection` and `public.finish_trip`. A read-only review found that these are deliberate atomic trip operations: they derive the actor from `auth.uid()`, check fleet membership and applicable role/driver constraints, use a pinned empty `search_path`, and are not executable by `anon`. Do not change them to `SECURITY INVOKER` or revoke authenticated execution merely to silence the generic lint; first add live signed-in positive and negative-path coverage and review the complete call sites.

The Test performance advisor also reports two unindexed nullable reviewer foreign keys (`road_restrictions.verified_by` and `vehicles.registration_verified_by`). Additive index migration and rollback-only test candidates exist in the branch but have not been applied persistently. The advisor reports 17 currently unused indexes; do not remove them without workload evidence.
