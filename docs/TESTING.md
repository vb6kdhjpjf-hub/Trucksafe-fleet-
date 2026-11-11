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
- Drivers cannot update vehicle records.
- Cross-fleet references are rejected by database constraints.

**Important:** setting PostgreSQL request-claim variables is a synthetic claim simulation. It is not a signed JWT, does not validate a real Supabase Auth session, and is not live Supabase Auth end-to-end coverage. The local Supabase JS SDK fixture in `.github/tests/fleet-api-access.integration.test.mjs` is also a local protocol fixture, not a connection to a live Auth service.

## Required next stage for live Auth coverage

Do not create test identities by directly inserting into or deleting from `auth.users`. Before live Auth E2E is introduced, establish a disposable Test-only Auth fixture that:

- Uses Supabase Auth Admin APIs from a trusted server-side test runner.
- Is restricted to the dedicated Test project and cannot target Production.
- Creates uniquely identified synthetic users and records their IDs for cleanup.
- Cleans up users through the Auth Admin API in a guaranteed teardown path, including failed tests.
- Never exposes service-role credentials to browser code, client bundles, logs, or chat.

Until that fixture and cleanup guarantees are in place, report the current coverage accurately as synthetic-claim PostgreSQL RLS integration plus local SDK protocol tests.

## Release and safety gates

- Keep PR #15 open and in Draft until explicitly authorized otherwise.
- Do not merge or deploy as part of this validation work.
- Do not modify Production schema or data.
- Do not enable production HERE/PTV navigation or claim nationwide restriction coverage without verified authoritative source coverage, freshness, licensing, and independent safety review.
- A passing CI run is evidence for the tested code paths only; it is not a certification that truck routes are safe or that all fleet permissions are correct.
