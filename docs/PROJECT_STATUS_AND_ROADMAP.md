# TruckSafe Fleet V1 — Project Status and Roadmap

Last reviewed: 2026-11-11
Branch: `test/isolated-e2e-ci`
Pull request: [#15](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/pull/15) — open, Draft, not merged
Production release: **not approved**

This document is the working status record. It separates implemented software from capabilities that have not yet been proven safe or commercially authorized.

## Executive status

TruckSafe has a substantial fleet-management application and an isolated validation baseline. The truck-routing path is deliberately gated: passing software tests or receiving a route from a mapping provider does not establish that a route is safe for a particular truck in Israel.

**Current release posture: development / controlled testing only. Do not use as an approved truck-navigation service.**

## Workstreams

| Workstream | Current status | Evidence / remaining gate |
|---|---|---|
| Fleet workspace and dashboard | Implemented in the application | Login, fleet membership, fleet dashboard and operational modules exist; dashboard loading now fails closed when an account has multiple fleet memberships or multiple owned fleets instead of selecting one arbitrarily. Complete user-acceptance testing is still required. |
| Drivers, vehicles and tasks | Implemented; safety checks added | Driver eligibility, vehicle lifecycle and task/pre-trip flows have automated tests. Isolated authenticated-role tests now verify cross-fleet row isolation, dispatcher write denial, driver assignment-scoped vehicle reads, authenticated driver start/finish RPC authorization, and private registration-document read/upload restrictions. Real-user acceptance and edge-case review remain. |
| Maintenance, incidents, history and reports | Implemented in the application | Pages and data workflows exist; full operational acceptance and permissions review remain. |
| Vehicle registration verification | Guarded workflow implemented in the development branch | Private registration document and authorized review are required; material technical-profile, registration-number, make/model and vehicle-type edits invalidate prior approval; a database INSERT trigger clears any client-supplied approval or document metadata. SQL integration tests cover forged INSERT metadata and re-review after a registration identity change. Rollout to Production has not been authorized. |
| Fleet road-restriction catalogue | Implemented as fleet-scoped workflow | Geometry, time validity and verification evidence checks exist. It is not a national authoritative road database. |
| Route API security and quota | Implemented in the development branch | Authenticated fleet access with ambiguous multi-fleet membership rejected, saved verified vehicle selection in the routing UI, server-trusted vehicle profile, streamed 16 KB request-body limit, strict UTF-8/JSON parsing, request validation and fail-closed quota enforcement are tested in the isolated test project. |
| Cross-fleet relational integrity | Candidate composite-FK migration and behavioral tests added; isolated CI passed | The candidate migration is applied only inside a rollback-only transaction on the dedicated Test project. CI proves same-fleet inserts succeed, 15 cross-fleet relationship attempts fail, trip-location driver mismatch fails, and delete semantics (SET NULL, CASCADE and NO ACTION) behave as intended. No persistent schema change was made. The migration remains unapproved for Production and requires a final migration review before any persistent rollout. |
| HERE truck-routing integration | Code path exists, but routing is disabled by safety gate | Requires approved credentials/plan, validated Israel coverage and independent restriction checks. A provider route alone is not a safety approval. |
| PTV integration | Experimental preparation only | Preview catalogue diagnostic returned 22 profiles (16 truck candidates). No live route integration is approved. Commercial/production rights and Israel coverage must be confirmed in writing. |
| Israeli restriction data acquisition | Research and request draft completed | Ministry specification and other candidate leads are documented. No verified nationwide feed or commercial-use agreement has been received. |
| Offline source provenance pipeline | Implemented and unit-tested | Staging, evidence-completeness assessment, append-only human review, verification and content-addressed manifest are available. This pipeline does not authenticate the truth of source documents or approve routing. |
| Production release | Blocked / not approved | No merge, deployment, Production database migration or national-coverage approval is authorized. |

## Verified engineering baseline

The latest verified isolated validation run is [GitHub Actions run 43038314010](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43038314010), on commit `7b427ffef8602a9c3e29a22f893a75dc58658b9c`.

Recorded results:
- Application and safety unit-test step passed (161 tests), including streamed request-body limit and routing-profile validation tests.
- Vehicle-registration and RLS integration tests passed: direct vehicle INSERT cannot forge a verified status or inject document/approval metadata; technical-profile edits and registration-identity changes invalidate prior approval and clear reviewer metadata. Fourteen rollback-only security scenarios passed, including owner/other-fleet row isolation, dispatcher vehicle write denial, driver assignment-scoped vehicle reads, private registration-document access limited to fleet owners/managers, and authenticated driver trip start/finish with cross-fleet rejection. Fleet dashboard code also rejects ambiguous multi-fleet selection rather than silently choosing a workspace.
- Isolated database integration job passed; its connection was verified to target only the dedicated test project.
- Next.js production build passed.
- Production dependency audit reported 0 vulnerabilities.
- Synthetic database fixtures are rollback-only.
- Cross-fleet integrity CI applied the candidate composite-FK migration in a transaction, validated same-fleet positives, 15 cross-fleet rejection cases, trip-location driver matching, and delete actions, then rolled back.
- The dedicated Test project was independently checked after CI: all fixture tables, including `auth.users`, remained empty.
- The two nullable reviewer foreign-key columns have an additive index migration. CI applies it only inside a transaction on the dedicated Test project, verifies both indexes, and rolls it back; no persistent Test or Production schema change was made.

Supabase Security Advisor review on the isolated test project reported two warnings for the authenticated RPC functions `start_trip_with_inspection` and `finish_trip`, which are intentionally SECURITY DEFINER so they can perform controlled trip lifecycle writes. Their bodies enforce authenticated membership, fleet/task/driver/vehicle matching and driver-or-manager authorization; CI now exercises the assigned-driver path and rejects a cross-fleet start. These warnings remain visible and should be re-reviewed if the RPC authorization logic changes.

These results establish that the tested code passed those checks. They do not establish live provider correctness, source-data coverage, production readiness, or road safety.

## Critical release blockers

1. **Authoritative Israeli restriction data:** obtain current records from the competent road owners/authorities, with stable IDs, exact geometry, direction/lane, height/weight/dimension/time constraints, measurement evidence, effective dates and withdrawal/update process.
2. **Commercial rights:** obtain written permission for commercial storage, transformation, display and route decisions for every source and routing provider.
3. **Coverage and freshness:** document included road owners/classes and all gaps. Prove how expired, withdrawn, temporary and emergency restrictions reach the system.
4. **Independent validation:** compare a representative sample against official documents and field/authority checks; measure false negatives separately and define an approved safety threshold.
5. **Cross-fleet relationship integrity:** the candidate composite-FK migration and rollback-only positive/negative/delete-action tests now pass in isolated CI. Before any persistent rollout, perform final migration review, confirm schema parity and query/index impact, and obtain explicit release authorization. No persistent schema change has been applied.
6. **Vehicle profile correctness:** validate registration-derived dimensions and weights, actual loaded weight and axle-weight semantics; do not infer missing values.
7. **Geospatial correctness:** replace coarse geographic bounds with a trusted Israel boundary and road-access checks before any routing release.
8. **End-to-end pilot:** run staging-only imports and shadow routes, test time windows and Israel daylight-saving transitions, and obtain sign-off from the data owner, safety reviewer and operational owner.
9. **Production governance:** review migrations, RLS/storage permissions, monitoring, incident response, backups and rollback before any production change.

## Next milestones

### Milestone 1 — Evidence acquisition (current)
- Verify the published Netivei Israel contact and source-owner responsibility.
- Obtain a written response, data dictionary, representative sample, coverage map, update mechanism and commercial-use terms.
- Keep the existing request as a draft until the project owner explicitly authorizes sending it.

### Milestone 2 — Isolated pilot importer
- Build only after a real sample and licence are received.
- Preserve original files, checksums, retrieval metadata and source version.
- Validate schema, units, coordinate reference system, geometry, lane/direction, time zone, expiry, conflicts and withdrawals.
- Keep all imported records candidate/unverified and outside production routing.

### Milestone 3 — Shadow validation
- Compare candidate restrictions with authoritative documents and field/authority checks.
- Run route comparisons without presenting them as safe navigation.
- Record false negatives, stale data, coverage gaps and provider disagreements.
- Require written safety and data-owner sign-off.

### Milestone 4 — Controlled pilot decision
- Limit any pilot to a clearly documented area and road-owner scope.
- Enable only after commercial rights, coverage, update SLA, vehicle mapping, independent tests and rollback plan are approved.
- Keep national coverage disabled unless separately proven and explicitly approved.

### Milestone 5 — Production release
- Separate release review and production migration plan.
- Confirm deployment, monitoring, access control, backup and incident procedures.
- Obtain explicit release authorization. No automatic merge or deploy.

## Non-negotiable safeguards

- `TRUCK_RESTRICTION_COVERAGE_APPROVED` remains off unless the full national-coverage evidence and approval gates are satisfied.
- Missing, stale, conflicting or unverified restriction data must never be interpreted as a clear road.
- Candidate bridge geometry is not a measured height restriction.
- The fleet-scoped restriction catalogue is not nationwide coverage.
- PTV remains experimental until commercial rights, service behavior and Israel coverage are verified.
- Do not apply branch migrations to Production or alter Production data as part of this work.
- Keep PR #15 Draft and unmerged; do not deploy without explicit authorization.


## Backup and restore workflow hardening

A workflow review found that the schema restore job referenced a stale artifact name and hard-coded an old Actions run ID that did not match the current schema-backup workflow. The restore workflow now requires the operator to provide a backup run ID, verifies through GitHub CLI that it belongs to a completed successful `Supabase schema-only backup` run, downloads the matching `trucksafe-schema-only` artifact from that exact run, and retains the explicit `RESTORE` confirmation gate. The backup artifact retention was extended from one to seven days. Restore remains restricted to the dedicated Test project's Session pooler, refuses a non-empty public schema, validates that the snapshot contains no top-level data blocks, and executes within a single transaction. No backup or restore workflow was executed during this review, and no database was changed. CI now includes static regression tests for this workflow contract.

## Fleet authorization and privileged-routine audit

The rollback-only security integration suite now audits every public table for enabled RLS, every SECURITY DEFINER routine in the public/private schemas for a pinned empty search_path and denial of anonymous EXECUTE, and every exposed public view/materialized view for invoker security or absence of client SELECT grants. The dedicated Test project was also inspected read-only: all current public tables have RLS enabled, no public views are currently exposed, and no anonymous role can execute a SECURITY DEFINER routine. Existing owner/dispatcher/driver/two-fleet and private vehicle-registration storage behavior tests remain in place.

## Application smoke and route-quota security checks

The isolated validation workflow now starts the built Next.js app with database and routing-provider credentials explicitly blanked and routing coverage approval disabled. It exercises the dashboard shell, routing readiness, authentication gates on the truck-route and PTV diagnostic APIs, HTTP method restrictions, JSON content-type enforcement, no-store response headers, and 20 concurrent unauthenticated/readiness requests. This is an application-process smoke test, not a full authenticated end-to-end test against a live fleet.

The rollback-only route-quota database test also verifies that each synthetic user receives an independent ten-request window, that one user cannot read another user's quota rows through RLS, that authenticated users cannot update or delete quota history directly, and that the anonymous role cannot execute the quota function. No paid routing provider is contacted.

## Synthetic query-plan and performance regression checks

A rollback-only CI test now creates two temporary benchmark relations with 100,000 synthetic rows each. It checks the PostgreSQL plans for two common fleet operations: filtering tasks by fleet and status, and loading the latest location history for a trip. The runner asserts that the expected composite indexes are actually used, that each limited query returns 100 rows, and that PostgreSQL reports an execution time.

Latest observed isolated CI measurements on the dedicated Test project's PostgreSQL instance:
- Fleet/status task query: `idx_trucksafe_perf_tasks_fleet_status` used; 100 rows returned in 2.922 ms and 4.183 ms across two CI runs.
- Trip location history query: `idx_trucksafe_perf_locations_trip_recorded` used; 100 rows returned in 0.175 ms and 0.176 ms across two CI runs.

These are synthetic temporary-table measurements, not production workload benchmarks or latency guarantees. The temporary tables and all 200,000 synthetic rows are rolled back; no public table, persistent schema, Test data, or Production data is changed. Larger realistic load testing against the application/API remains a separate milestone.

## Cross-fleet relational integrity — detailed constraint map

The isolated test schema was inspected by exact foreign-key name and referential action. Most of the following relationships enforce referenced-row existence but do not enforce fleet equality. One existing exception is `vehicles(fleet_id, assigned_driver_id) → drivers(fleet_id, id)`, which already enforces same-fleet vehicle/driver assignment. The `drivers(fleet_id, id)` unique key already exists; the other parent composite keys still need to be added by the reviewed migration:

| Table | Existing foreign key | Existing delete behavior |
|---|---|---|
| vehicles | vehicles_assigned_driver_same_fleet_fkey → drivers(fleet_id, id) | RESTRICT |
| tasks | tasks_assigned_driver_id_fkey → drivers(id) | SET NULL |
| tasks | tasks_assigned_vehicle_id_fkey → vehicles(id) | SET NULL |
| trips | trips_task_id_fkey → tasks(id) | SET NULL |
| trips | trips_driver_id_fkey → drivers(id) | NO ACTION |
| trips | trips_vehicle_id_fkey → vehicles(id) | NO ACTION |
| incidents | incidents_trip_id_fkey → trips(id) | SET NULL |
| incidents | incidents_driver_id_fkey → drivers(id) | SET NULL |
| incidents | incidents_vehicle_id_fkey → vehicles(id) | SET NULL |
| inspections | inspections_trip_id_fkey → trips(id) | SET NULL |
| inspections | inspections_driver_id_fkey → drivers(id) | NO ACTION |
| inspections | inspections_vehicle_id_fkey → vehicles(id) | NO ACTION |
| maintenance_records | maintenance_records_incident_id_fkey → incidents(id) | SET NULL |
| maintenance_records | maintenance_records_vehicle_id_fkey → vehicles(id) | CASCADE |
| trip_locations | trip_locations_trip_id_fkey → trips(id) | CASCADE |
| trip_locations | trip_locations_driver_id_fkey → drivers(id) | CASCADE |

The planned replacement uses composite fleet-scoped keys for all fleet-owned references, and a (trip_id, driver_id) relationship to the trip's actual driver for trip_locations. Optional-reference deletes must clear only the reference column, never fleet_id; vehicle deletion from maintenance records remains CASCADE. These mappings are a design record, not an applied migration.

The candidate migration is now part of the Draft branch and its rollback-only CI test proves same-fleet inserts succeed, 15 cross-fleet relationship attempts fail, trip locations cannot name a different driver, and optional-reference SET NULL, maintenance/location CASCADE, and operational NO ACTION behavior are preserved. A read-only preflight query is available at `supabase/diagnostics/cross_fleet_integrity_preflight.sql` to identify pre-existing mismatched references before any future rollout; it returned zero rows on the empty Test project. The CI transaction is rolled back; the Test project was checked afterward and all synthetic fixture tables remained empty. This is not approval to apply the migration persistently or to Production. Before generating/applying it, reconcile the full relationship map against the live Test schema, including the existing vehicle-to-driver composite FK, then run positive, negative and delete-action tests on the isolated Test project.


## Verified fleet workspace resolution

A shared application helper now verifies the active Supabase user with `auth.getUser()` before loading fleet membership, checks membership against the verified user ID, and refuses to select an arbitrary fleet when the account has multiple memberships. Protected application pages use this resolver before loading fleet-scoped data (drivers, tasks, incidents, maintenance, map, reports, daily report, trip history, and road restrictions). Missing authentication or membership fails closed; ambiguous membership produces an explicit error until a fleet-selection flow is implemented.

Unit tests cover unverifiable/expired identity, no membership, multiple memberships, valid single membership, and missing fleet metadata. These tests are part of `test:ci`. They are deterministic client-contract tests, not a live authenticated two-user/two-fleet API E2E test. No Auth users were created, no real fleet data was written, and no Production or Test database was modified for this change. The next security milestone is a disposable Test-project Auth fixture with guaranteed cleanup, followed by API-level cross-fleet read/write denial tests; do not create persistent test users until the cleanup mechanism is established.


## Fleet-context enforcement across application and routing APIs

Completed the shared workspace-resolver rollout across all nine protected fleet pages, including daily reports, trip history, and road restrictions. A static regression test now asserts every protected page imports and invokes the shared verified resolver. The dashboard retains its existing explicit multi-membership refusal and server-validated `auth.getUser()` startup check.

The three server routing/diagnostic POST endpoints now all verify the supplied bearer token with Supabase Auth and inspect up to two fleet memberships. The PTV diagnostic endpoints were tightened from a one-row membership lookup to a two-row check so multi-fleet accounts cannot be silently treated as having an unambiguous fleet context. Static API contract tests assert bearer validation, Auth verification, membership checks, and ambiguity detection for all three endpoints.

This remains defense-in-depth at the client/API boundary; database RLS remains the actual row-level authorization boundary. No live Auth users or fleet records were created. The current validation suite does not yet perform a real authenticated two-user/two-fleet API exercise; that remains blocked on a disposable Auth-user fixture with guaranteed cleanup. All work remains isolated to the Draft branch.


## Latest validation and API fleet-membership hardening — 2026-11-11

The Draft branch now centralizes the routing API fleet-membership lookup in `lib/fleet-membership.mjs`. The helper reads up to two membership rows and returns explicit fail-closed outcomes for missing membership, multiple memberships, or lookup errors. The truck-route, PTV profile diagnostic, and PTV routing diagnostic endpoints all use it after verifying the bearer token with Supabase Auth. The PTV diagnostic endpoints still enforce owner/fleet-manager role checks after the single-fleet result is established.

A deterministic unit test exercises zero, one, and multiple memberships, verifies the two-row limit, and checks lookup-error handling. The latest GitHub Actions run for commit `3dd966edd8b25b2e48b7dfe8f6b011cc8c28e45c` completed successfully: both `validate` and `database-integration` jobs passed. This includes the existing rollback-only database suite and application/security validation. Run: https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43047885030

A read-only Supabase Test Auth check returned zero Auth users after the run. No Auth users or persistent fleet fixtures were created. No Test schema/data or Production schema/data was modified by this work.

### Review of current Supabase advisor findings

The Test project's security advisor reports two authenticated-executable SECURITY DEFINER RPCs: `public.start_trip_with_inspection` and `public.finish_trip`. Read-only inspection confirmed both pin an empty `search_path`, deny `anon` EXECUTE, and grant EXECUTE to `authenticated` and `service_role`. Their bodies derive identity from `auth.uid()`, verify fleet membership, and apply role/driver checks before transactional trip operations. These are deliberately privileged atomic application RPCs; changing them to SECURITY INVOKER or revoking authenticated EXECUTE without a replacement design could break the workflow or change RLS behavior. Do not change their privileges based solely on the generic advisor warning. Add live authenticated role/negative-path coverage before considering a privilege redesign.

The performance advisor also reports missing indexes for nullable reviewer references `road_restrictions.verified_by` and `vehicles.registration_verified_by`. An additive candidate migration already exists at `supabase/migrations/20261111160000_add_verified_by_fk_indexes.sql`. The indexes have not been applied persistently. Keep them as a reviewed candidate until the isolated migration verification and rollout plan are explicitly completed; do not apply to Production.

Next milestone: implement and verify a disposable Auth fixture with guaranteed cleanup, then run authenticated API-level cross-fleet denial tests. The available connector does not expose the required Supabase Auth Admin create/delete workflow, so do not bypass it with direct SQL against `auth.users` or expose a service-role key. Until a secure fixture mechanism is available, continue with deterministic mock-based tests and read-only audits. PR #15 remains open and Draft; no merge, deployment, or Production changes are authorized.


## Shared fleet API authorization gate — 2026-11-11

The three server-side routing and PTV diagnostic endpoints now use `lib/fleet-api-access.mjs` as a shared authorization gate. It verifies the bearer token through Supabase Auth, requires exactly one fleet membership, maps invalid sessions to HTTP 401 and missing/ambiguous membership to HTTP 403, and optionally enforces an explicit role allowlist. The PTV profile and routing diagnostics allow only `owner` and `fleet_manager`; truck-route access continues to require one verified fleet membership, while its existing vehicle and restriction queries remain scoped to that fleet.

New deterministic tests cover invalid sessions, zero and multiple memberships, role denial for a driver, successful fleet-manager access, and single-membership access for a non-manager where that endpoint's policy permits it. The route contract test also verifies all three endpoints call the shared gate. These are mock-based authorization tests, not a live authenticated API E2E exercise.

Commit `0c60db130a72a1baac0cde2e4fbab51600ee895f` passed both GitHub Actions push jobs: `validate` and `database-integration` (run [43049428595](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43049428595)). A read-only query against the isolated Test project confirmed `auth.users` still contains zero users. No Auth users or persistent fleet fixtures were created; no database schema or data was changed. PR #15 remains open and Draft, with no merge or deployment.


## Fleet-scoped routing authorization tests — 2026-11-11

Added regression checks that the truck-route API constrains both vehicle lookup and road-restriction catalogue lookup to the verified `membership.fleet_id`, forwards the caller's bearer token to Supabase so RLS remains active, does not reference service-role/secret keys, and completes authorization before paid HERE geocoding. Added checks that both PTV diagnostic endpoints apply the owner/fleet-manager allowlist before any provider request and do not use service-role/secret keys.

Validation for commit `e043ea9f32a87975c00634ce8662c40ae3def9a0` completed successfully: GitHub Actions run [43050136924](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43050136924), with both `validate` and `database-integration` jobs passing. PR #15 remains open and Draft; no merge, deployment, or Production database change was made.

Next security-test milestone: replace the existing rollback-only SQL test fixture pattern that directly inserts synthetic rows into `auth.users` with a disposable Supabase Auth Admin API fixture that has guaranteed cleanup. Until that safe fixture exists, do not create Auth users or claim live authenticated API E2E coverage.

## API membership validation and Test RLS review — 2026-11-11

The shared API access gate now also validates the shape of the sole membership row before allowing a request: `fleet_id` must be a non-empty string and `role` must be one of the five roles enforced by the Test database constraint (`owner`, `fleet_manager`, `dispatcher`, `safety_manager`, `driver`). Unknown roles and malformed identifiers are denied with HTTP 403. Deterministic tests cover unknown/null roles and an empty fleet identifier.

Validation for commit `6ec8a0a3453acd31995387ce88950f666505f529` completed successfully in GitHub Actions run [43050746489](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43050746489): both `validate` and `database-integration` passed. The validation log reports 161 application/safety tests, 18 fleet workspace/API authorization tests, 3 workflow safety tests, a successful Next.js build, and successful concurrent smoke checks (including unauthenticated API denial). The database integration job completed successfully.

A read-only review of the isolated Test project's RLS metadata confirmed RLS is enabled on `fleet_members`, `vehicles`, and `road_restrictions`. The membership SELECT policy exposes the caller's own membership row (or rows for fleet managers); vehicle and restriction policies use the private fleet membership/role helpers. This is policy-definition inspection only, not proof of live cross-fleet denial under authenticated JWTs. No Test or Production schema/data was modified, and Test Auth still has zero users.

The remaining live-auth milestone is still blocked on a disposable Supabase Auth fixture with guaranteed cleanup. Do not create Auth users through direct SQL or expose a service-role secret. Until a safe Admin API fixture is available, treat the authorization suite as deterministic mock coverage plus read-only RLS review, not authenticated E2E. PR #15 remains open and Draft; no merge or deployment.

## API authorization denial-order regression and CI verification — 2026-11-11

Added an explicit regression test that verifies each API handler returns on authentication/authorization denial before any downstream vehicle, quota, restriction-catalogue, or PTV-provider work. For the truck-route handler, the test also asserts that paid geocoding occurs only after the denial branches. This is a source-order contract test; it does not execute the route handler against a live Supabase Auth session and must not be described as live API E2E.

Commit `8a6af0f1f5526a342abbd6e974b8ff68ce0e76c7` passed both GitHub Actions jobs in runs [43051114223](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43051114223) and [43051122981](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43051122981): `validate` and `database-integration` succeeded. The validation log confirms 161 application/safety tests, 19 fleet workspace/API tests, 3 workflow-safety tests, zero high-severity production dependency audit findings, a successful Next.js build, and 20 concurrent API smoke requests returning expected statuses. The database integration job ran against the dedicated Test project and all rollback-only SQL tests passed, including the synthetic cross-fleet integrity/preflight checks and query-plan performance checks.

The database job's SQL fixtures are transaction-scoped and rolled back; they do not create persistent Auth users or fleet records. No production schema or data was touched. The next live-auth test milestone remains blocked until a Supabase Auth Admin fixture can be provisioned and guaranteed cleanup can be demonstrated. Continue not to use direct SQL against `auth.users`, not to expose service-role secrets, and not to enable provider navigation or nationwide safety claims. PR #15 remains open and Draft; no merge or deployment.
