# Release-readiness gap register

Updated: 2026-11-25

This is a verification register, not a release approval. The application must remain unmerged and undeployed until the outstanding live checks and rollout gates below are accepted.

## Verified in CI on the current PR revision

- The validation job passed: production dependency audit, application/safety/workflow tests, Next.js production build, and isolated smoke tests.
- The database integration job passed with the dedicated Test-project identity guard, rollback-only SQL suite, and fixture cleanup.
- Live Auth **and private Storage** integration passed on the current candidate via dedicated Test-only push run `45666461146` on `test/current-candidate-auth-e2e`: signed sessions, fail-closed role/membership checks, local HTTP API checks, assigned-driver and owner proof uploads, signed reads, cross-fleet read/upload/delete denial, owner/driver delete denial, PDF MIME rejection, 10 MiB+1 upload rejection, and exact-path object/Auth fixture cleanup all succeeded. This is Test-only evidence, not a Production pass.
- The rollback-only SQL suite now covers delivery-note issuance/idempotency/immutable snapshots, authorized signature exceptions, server-side 10 MiB per-photo and 40 MiB aggregate limits, and shipment-to-stop/cargo cascade cleanup. A scoped Storage DELETE policy plus client-side failure cleanup now removes only same-user, unreferenced proof uploads; referenced proof objects remain immutable.
- Test-only schema provisioning added the missing daily-work/load, shipment/cargo, and delivery-proof modules plus fleet-scoped constraints. Test now has 25 public tables with RLS enabled on all of them; `delivery-proof-private` is private and restricted to PNG/JPEG/WebP, 10 MiB per object. All temporary fleets, shipments, proof objects, and Auth users were cleaned after run `45666461146`.
- Test migration history now includes 13 explicitly named `test_*` provisioning records. This is intentionally not treated as migration-ledger reconciliation or a Production release sequence. Production was rechecked and remains unchanged: 12 public tables and no `delivery-proof-private` bucket.
- Test Performance Advisor now reports no unindexed foreign keys and no duplicate indexes after adding child-side indexes and removing the redundant `vehicles_fleet_id_id_key` constraint (the separately named `vehicles_fleet_id_id_unique` remains and continues to back the fleet-scoped foreign keys). There are 37 unused-index INFO notices; no other indexes were removed without query-plan evidence. Security Advisor still reports 10 authenticated-executable `SECURITY DEFINER` RPCs (no anon EXECUTE grant); these are privileged write paths and remain subject to role/auth code review. Leaked-password protection remains disabled and is still an Auth hardening gate.

## Outstanding evidence

| Area | Existing evidence | Required before release |
|---|---|---|
| Live Auth and RLS | Test-only run `45666461146` passed signed-token verification, role/membership fail-closed checks, local HTTP routes, and Auth fixture cleanup | Add browser-level Auth/session checks and keep Production Auth settings unchanged until separately approved |
| Storage document access | Live Test-only run `45666461146` passed assigned-driver/owner upload, signed read, cross-fleet denial, immutable delete denial, PDF MIME rejection, >10 MiB rejection, and exact-path cleanup | Browser-level document viewing/download and Production configuration review; retain private bucket and narrow authenticated DELETE policy limited to the uploading user’s own unreferenced object; any object referenced by immutable delivery proof remains undeletable |
| Browser workflows | Unit, API, smoke, and local HTTP route-handler tests | Browser E2E with owner/manager/dispatcher/driver roles, including task assignment, pre-trip checklist, trip start/finish, and delivery proof |
| Driver/device experience | Responsive application build and code-level checks | Mobile viewport/browser pass, offline/network interruption behavior, GPS permission denial/recovery, and stale-location handling |
| Routing safety | Geometry, source-evidence, vehicle-profile, quota, and fail-closed tests | Verified authoritative restriction data with provenance, freshness, geographic coverage, vehicle dimensions/weight constraints, and explicit safety approval; only then provider integration tests |
| Production migration | Schema archive, catalog comparison, documented drift | Reconcile migration provenance; test a reviewed migration set on disposable local DB and then Test; exact SQL, backup, preflight, rollback, and maintenance plan for Production |
| Auth hardening | Production advisor reported leaked-password protection disabled | Review and enable in Auth Dashboard only after dedicated regression checks for sign-in and password reset; do not change Production as part of this register |

## Required live Auth execution

The workflow intentionally permits live Auth only on direct pushes to `test/isolated-e2e-ci`, the dedicated candidate-validation branch `test/current-candidate-auth-e2e`, or the separately guarded routing-fix test branch; manual dispatch is limited to `test/isolated-e2e-ci` with `confirm_test_auth=true`. It requires:

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`

The workflow's Auth job builds with routing providers disabled and coverage approval false, binds the app server to loopback, and removes the service-role key from the server process. Its fixture uses unique markers and cleanup-only logic. Never substitute Production secrets or expose secret values in logs/chat.

## Release gates

1. Live Auth and private Storage are verified for the current candidate by Test-only run `45666461146`; browser/device E2E and broader device/network recovery checks remain outstanding.
2. No routing provider is enabled until authoritative restriction coverage and safety review are approved.
3. No hosted schema, Auth, Storage, or data mutation is performed without a separately reviewed change plan and explicit approval.
4. No merge or deployment is implied by green CI; browser E2E, production configuration review, and rollback readiness remain independent gates.

## Current disposition

**Not release-ready.** Automated application, rollback-only database integration, and live Test Auth/Storage checks are green. Browser/device E2E, authoritative routing coverage, leaked-password protection review, migration provenance reconciliation, and Production rollout approval remain outstanding.
