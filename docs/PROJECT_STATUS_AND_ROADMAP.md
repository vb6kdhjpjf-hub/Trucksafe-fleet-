# TruckSafe Fleet V1 — Project Status and Roadmap

Last reviewed: 2026-11-12
Branch: `test/isolated-e2e-ci`
Pull request: [#15](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/pull/15) — open, Draft, not merged
Production release: **not approved**

This document is the working status record. It separates implemented software from capabilities that have not yet been proven safe or commercially authorized.

## Executive status

TruckSafe has a substantial fleet-management application and an isolated validation baseline. The truck-routing path is deliberately gated: passing software tests or receiving a route from a mapping provider does not establish that a route is safe for a particular truck in Israel.

**Current release posture: development / controlled testing only. Do not use as an approved truck-navigation service.**

## Workstreams

| Enterprise onboarding and data migration | Product requirement captured; implementation not started | Guided Excel/CSV migration and later approved connectors, with mapping, validation, dry-run, duplicate review, audit and reconciliation. No one-by-one re-entry for established fleets. |

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
| Israeli restriction data acquisition | Official candidate datasets reviewed; no authoritative operational restriction feed verified | The Ministry GIS viewer and the government road-authority dataset are useful discovery/context sources only. The GIS terms state that source layers update at varying frequencies and are not legally binding; the road-authority dataset identifies delegated signage authority segments, not current truck height/weight/time restrictions. No verified nationwide restriction feed, freshness SLA or commercial-use agreement has been received. |
| Offline source provenance pipeline | Implemented and unit-tested | Staging, evidence-completeness assessment, append-only human review, verification and content-addressed manifest are available. This pipeline does not authenticate the truth of source documents or approve routing. |
| Production release | Blocked / not approved | No merge, deployment, Production database migration or national-coverage approval is authorized. |

## Verified engineering baseline

The latest verified isolated validation run is [GitHub Actions run 43186466322](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43186466322), on commit `430512e4702267eeb584d1fb2e7de76124f487c6`. All three jobs passed: application validation, rollback-only database integration on the dedicated Test project, and live Test Auth integration.

Recorded results:
- Application and safety tests passed (210 tests); delivery quantity, photo and GPS tests passed (17); fleet API access tests passed (40); workflow safety tests passed (8).
- Dependency audit reported 0 vulnerabilities. The Next.js production build and 20 concurrent application smoke requests passed.
- Database integration passed, including delivery-proof storage policy assertions, rejection of incomplete GPS coordinate pairs, six-decimal GPS snapshot normalization, and idempotent replay of a delivery event with GPS evidence. SQL fixtures and migration checks are rollback-only on the dedicated Test database.
- Live Auth integration passed with seven disposable signed Test identities: owner, fleet manager, dispatcher, safety manager, driver, ambiguous multi-fleet user and unassigned user. It exercised real signed JWT validation, PostgREST membership reads, RLS visibility, actual route and local production-mode HTTP authorization, invalid-token denial, immediate membership revocation, manager-role demotion and rejection of forged `user_metadata` privilege claims.
- Auth fixture cleanup removed all seven marked Test identities and their fleets through the Supabase Auth Admin API; the follow-up cleanup found zero remaining fixtures.
- Delivery proof now supports optional GPS capture only after an explicit driver action; no background location tracking is performed. Coordinates are range-checked and normalized to the database's six-decimal precision before idempotency comparison.
- The two nullable reviewer foreign-key columns have an additive index migration. CI applies it only inside a transaction on the dedicated Test project, verifies both indexes, and rolls it back; no persistent Production schema change was made.

Supabase Security Advisor review on the isolated test project reported two warnings for the authenticated RPC functions `start_trip_with_inspection` and `finish_trip`, which are intentionally SECURITY DEFINER so they can perform controlled trip lifecycle writes. Their bodies enforce authenticated membership, fleet/task/driver/vehicle matching and driver-or-manager authorization; live Auth and SQL integration tests cover relevant positive and negative paths. These warnings remain visible and should be re-reviewed if the RPC authorization logic changes.

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
- Candidate-only sources reviewed: [Ministry of Transport GIS](https://geo.mot.gov.il/) aggregates layers from infrastructure companies, government bodies, local authorities and private entities; layer update frequency varies, and the portal explicitly says the information is not legally binding. [Government road-authority segment dataset](https://data.gov.il/he/datasets/ministry_of_transport/roadauthority) maps delegated traffic-signing authority, not truck restrictions; its publisher page lists `pinusi@mot.gov.il` and an update date of 22 July 2026. [Local traffic-authority directory](https://data.gov.il/he/datasets/ministry_of_transport/traffic_authority) provides authority names/codes but its indexed CSV was last updated 28 February 2023, so current responsibility/contact details need confirmation. [National transport infrastructure-plan dataset](https://data.gov.il/he/datasets/ministry_of_transport/ttl_transport) is planning information, not operational restrictions. These sources can help build a candidate enquiry/road-owner matrix only; they are not eligible for route decisions.
- Verify the published Netivei Israel contact and source-owner responsibility for actual bridge, weight, dimension and time restrictions.
- Evaluate Survey of Israel BNTAL as a possible national asset-geometry baseline only. Obtain the current product/layer catalogue, sample, per-layer dates/accuracy and commercial licence; do not infer bridge clearance from topographic structure height.
- Obtain a written response, data dictionary, representative sample, coverage map, update/withdrawal mechanism and commercial-use terms.
- Keep the existing request as a draft until the project owner explicitly authorizes sending it. Do not ingest candidate layers into route decisions.

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


## Truck-route quota security metadata regression and CI — 2026-11-11

Extended the rollback-only quota SQL integration test to verify the quota RPC remains SECURITY INVOKER with an empty pinned search_path, the cleanup trigger remains SECURITY DEFINER with an empty pinned search_path, row-level security stays enabled, and execution/table privileges remain restricted. The table intentionally grants INSERT only on the permitted columns rather than at table level; the test now checks those column-level grants explicitly and confirms the generated row ID cannot be supplied by the caller. A read-only metadata query against the isolated Test project confirmed authenticated SELECT, column-scoped INSERT, no UPDATE/DELETE, no anon access, and RLS enabled. No schema or data was changed by that inspection.

The first version of the new assertion incorrectly expected a table-level INSERT grant and failed in CI. This was a test assertion defect, not a database permission regression. After correcting it to test the actual column-level grant model, commit `69b6ba0ec203df9b9a42e2481c23cca1fe5d021b` passed both GitHub Actions jobs in runs [43051727902](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43051727902) and [43051736952](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43051736952): `validate` and `database-integration` succeeded in both runs.

The quota integration test remains rollback-only and uses synthetic identities; no authenticated Test users were created. No Production schema/data was accessed or modified. Live authenticated API E2E remains blocked on a disposable Auth Admin fixture with guaranteed cleanup. PR #15 remains open and Draft; no merge or deployment.


## Isolated Supabase SDK auth-gate integration fixture — 2026-11-11

Added `.github/tests/fleet-api-access.integration.test.mjs` and included it in `test:ci`. The fixture starts a loopback-only local HTTP server that implements the minimal Supabase Auth `/auth/v1/user` and PostgREST `/rest/v1/fleet_members` response contracts, then exercises the actual installed Supabase JS client and shared `resolveFleetApiAccess` gate. Coverage includes a valid single-fleet membership, invalid token denial before membership lookup, no membership, ambiguous multi-fleet membership, membership API failure, use of the Auth-returned identity for membership filtering, and manager-only role enforcement.

This is a local protocol/SDK integration test, **not** a live Supabase Auth E2E test and does not prove production JWT, deployed RLS, or real cross-fleet isolation. It creates no Supabase Auth users and sends no requests to either Supabase project. All fixture servers are bound to loopback and are closed after each test.

The first CI attempt exposed a mismatch in the fixture: the test client did not mirror the API routes' global bearer-header propagation to PostgREST. The fixture was corrected to use the same bearer header pattern as the application. Commit `b8cdd9ee473caa1fc6a340a5b911dd5300a38f1b` then passed both `validate` and `database-integration` in run [43052609907](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43052609907), including the application/safety tests, dependency audit, Next.js build, concurrent smoke tests, and rollback-only Test database checks.

Remaining gap: a live authenticated Supabase Test project E2E still requires a dedicated disposable Auth Admin fixture and guaranteed cleanup capability. Do not use SQL against `auth.users`, create users manually, or deploy a helper function as a workaround. No Production schema/data changes, no merge, and no deployment. PR #15 remains open and Draft.

## Rollback-only fleet RLS isolation checks — 2026-11-11

Extended `.github/tests/cross-fleet-integrity-e2e.sql` to execute selected table operations under PostgreSQL's `authenticated` role with synthetic JWT claim settings. The rollback-only checks assert that a Fleet A owner sees only Fleet A vehicles, tasks, trips, and memberships; can update a vehicle in Fleet A; cannot update a Fleet B vehicle; and cannot insert a vehicle into Fleet B. This exercises the database's actual RLS policies and role grants in the isolated Test database, rather than only inspecting policy definitions.

The fixture reuses the two synthetic identity rows already present in this rollback-only SQL suite; the fleet-creation trigger supplies the owner membership rows. The JWT claims are set locally for the SQL transaction. **This is not a signed JWT or live Supabase Auth E2E test** and does not prove end-to-end token issuance, Auth Admin lifecycle, or the full application API path. All test records and the temporary migration application are rolled back.

The first CI attempt detected duplicate membership rows because the fleet-creation trigger already creates each owner's membership. The fixture was corrected to reuse those rows. Commit `48eb0a05cd29674feb9497c69ccdeb3ac839c7c8` then passed both jobs in GitHub Actions run [43053603892](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43053603892): the database integration suite passed, and the validation job passed application/safety/workflow tests, production dependency audit, Next.js build, and concurrent smoke tests.

No Production schema or data was accessed or changed. PR #15 remains open and Draft; no merge or deployment. The next security milestone remains a disposable Supabase Auth Admin fixture with guaranteed cleanup before claiming live authenticated API E2E coverage.


## Live Auth fixture safety gate and cleanup hardening — 2026-11-11

Six follow-on validation stages were completed on the isolated test branch:

- Tightened the disposable-user cleanup selector to require the server-controlled app-metadata marker, the dedicated `trucksafe-ci-` prefix, and the exact `@example.com` fixture domain.
- Added negative tests for a wrong domain, missing/malformed email, altered marker, and prefix lookalikes.
- Added workflow-safety assertions that the post-run cleanup step is configured with `always()`, runs only when the dedicated Test Auth secrets and dependencies are available, and invokes the cleanup-only Auth Admin path.
- Added static checks that the current live fixture only reads `fleet_members`, expects zero memberships, and does not create fleet or membership rows.
- Expanded the Test Auth runbook with a six-part schema, trigger, API, isolation, cleanup, and preflight gate required before any positive-membership live fixture is attempted.
- Recorded the exact coverage boundary and prohibited shortcuts so mocked role checks and synthetic-claim SQL are not misreported as signed-token E2E.

No live Test database writes or fleet membership creation were performed in this change. No Production schema/data access, deployment, or merge. PR #15 remains open and Draft.


## Live signed-token role E2E — 2026-11-11

Read-only inspection of the dedicated Test database confirmed: `fleets`, `fleet_members`, and `drivers` were empty; all three had RLS enabled; fleet insertion is restricted by the existing owner policy; a database trigger creates the owner membership; and the role policy lets owners/managers see all membership rows while drivers see only their own. The existing schema and policies were not changed.

A Test-only live fixture has now been implemented to create marked owner, fleet_manager, and driver Auth identities; sign each in through Supabase Auth; create a uniquely named fleet and add the other two memberships through the Test service-role API (with the existing owner-membership trigger); and verify live PostgREST membership reads, ordinary API access, manager-only denial for driver, and membership visibility under RLS.

Cleanup deletes only uniquely marked fleets owned by marked fixture users, verifies fleet removal, then deletes only marked Auth users through Auth Admin API and asserts zero marked users remain. Cleanup-only mode can retry after interruption. The fixture hard-rejects any host except the exact dedicated Test project.

This code is awaiting CI execution. Do not claim live positive-membership E2E passed until the Auth integration job is green and its logs confirm fixture cleanup. No Production writes, no deployment, and no merge; PR #15 remains open and Draft.


## Live API route authorization and negative-path milestone — 2026-11-11

The latest live Test Auth run now creates four disposable signed Auth identities: owner, fleet_manager, driver, and an unassigned user with no fleet membership. It calls the actual exported POST handlers for `ptv-profile-check`, `ptv-routing-check`, and `truck-route` in-process with each signed JWT, plus a deliberately invalid bearer token.

Verified outcomes: owner/manager pass PTV authorization and stop at the missing-key 503; driver is denied manager-only PTV endpoints with 403; unassigned identity is denied with 403; invalid bearer is denied with 401. All three fleet roles reach the truck-route membership gate and then stop at the restriction-coverage safety gate with 503. Provider keys are removed and restriction coverage approval is false, so no PTV/HERE provider calls occur. Route responses are checked for no-store caching.

Run 43067605949 passed all three jobs. Live Auth logs confirm four fixture users were removed and the cleanup-only sweep found zero remaining marked users. Read-only Test database inspection confirms zero fleets, fixture memberships, and fixture drivers. The in-process route test is not deployed-server/browser E2E and does not test downstream vehicle/quota/provider logic. No Production changes, merge, or deployment; PR #15 remains open and Draft.


## Latest routing safety follow-up — 11 November 2026

The latest verified run is [GitHub Actions run 43076349149](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43076349149), on commit `bdb5eda0377db53045fe827a35dc00d9403c03d6`. All three jobs completed successfully:
- Validate: 167 tests passed, 0 failed; application smoke checks passed, including the explicit assertion that truck routing remains disabled without safety approval.
- Database integration: foreign-key, lifecycle, road-vehicle security, route quota, cross-fleet integrity/preflight and query-plan checks passed.
- Auth integration: five signed disposable Test identities (owner, fleet manager, driver, ambiguous multi-fleet, unassigned) passed PostgREST/RLS and actual route-handler authorization checks; invalid-token denial passed.

Additional changes in this follow-up:
- HERE route candidates whose decoded geometry leaves the currently supported Israel coordinate bounds are rejected. These coarse bounds are a defensive check, not a trusted national boundary or road-access proof.
- The routing UI now labels trip weight as a manually supplied current total and warns that it should come from a recent weighbridge reading or reliable cargo/vehicle records. The system does not measure actual axle-load distribution.
- The PTV profile and routing diagnostic endpoints now share the authenticated per-user provider-request quota. They check that a PTV key exists before consuming quota; quota errors or exhaustion stop the paid provider call.
- The route API now loads the fleet restriction catalogue in exact-count pages of 500 records, with a 5,000-record safety ceiling. Missing pages, query failures, changing row counts, and catalogues above the ceiling fail closed instead of silently treating a truncated result as complete. This verifies pagination completeness by row count; it is not a transactional snapshot or proof of source coverage.
- Regression tests for pagination, over-limit catalogues, changing counts and failed pages are included in CI.

After the Auth run, five marked disposable Test Auth users and their fleets were removed. A read-only check found 0 rows in Test `fleets`, `fleet_members`, and `drivers`. No Production database was queried or changed as part of this follow-up.

The branch head and PR #15 head both equal the commit above. PR #15 remains open and Draft, not merged. No deployment, Production migration, provider activation, or external data-source outreach occurred.

Remaining routing release blockers are unchanged: authoritative restriction records and geographic coverage, freshness/withdrawal guarantees, commercial rights, independent validation, and verified vehicle/axle-load semantics. The 5,000-row cap and paginated read must not be interpreted as nationwide coverage. Keep `TRUCK_RESTRICTION_COVERAGE_APPROVED` disabled.


## Verified source research and CI follow-up — 12 November 2026

The bridge-data review was extended against the Ministry's April 2026 height-obstacle guidelines and the live public data.gov.il grade-separation catalogue.

- The Ministry's 2026 guidelines distinguish measured physical clearance from posted/proposed clearance. They prescribe lane-by-lane survey points at ±1 cm, measurements on both sides of the obstacle, additional centre measurements for underpasses longer than 20 m, inclusion of hanging equipment, use of the lowest measured value per lane, periodic remeasurement, and immediate updates after relevant roadworks. This is a measurement/maintenance standard, not a geospatial inventory.
- The bridge GIS specification remains a candidate schema only. Its separate 1 m figure is spatial location accuracy, not clearance measurement accuracy. There is an internal inconsistency: the summary table defines Gavrit_Min and Gavrit_Max according to posted signs, while detailed field descriptions allow values from signage or measurement. No per-record field distinguishes those bases. The specification includes generic Source and D_Update fields but does not require measurement-specific method/date, vertical accuracy, supporting survey evidence, or a measured-clearance value for each lane. It therefore cannot be used to assume physical clearance.
- The public rail grade-separation dataset shows 618 records and a 30 June 2024 update date. It identifies a subset of rail/road crossings and related metadata but contains no height, weight, axle, width, length, lane, or direction restriction fields. It is not a national inventory of all road bridges. Its catalogue contact was corrected in the source registry to the currently published GOLDO@MOT.GOV.IL.
- The acquisition request now explicitly asks for lane-level survey records following the 2026 guideline and for confirmation whether a newer/expanded version of the rail/road inventory or a wider bridge inventory exists. The request remains a draft; no external contact was made.

The source-registry tests were updated for the new metadata. One CI run exposed a stale assertion after the rail dataset description was made more precise; the assertion was corrected. The subsequent run [43155283781](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43155283781) completed successfully: validation, Next.js build, dependency audit, isolated database tests, and signed Test Auth integration/cleanup all passed. The Auth cleanup reported zero remaining marked fixture users.

PR #15 remains open and Draft. No merge, deployment, Production database change, provider activation, or external authority contact occurred. Truck routing remains blocked pending authoritative, current, licensed and independently validated restriction data with known geographic coverage.


## Additional source discovery and evidence-chain hardening — 12 November 2026

The source inventory now contains 17 classified candidates/standards, with routing eligibility kept separate from discovery value:

- Added Tel Aviv-Yafo municipal roadworks layer 852 as a city-scoped temporary-event discovery candidate. Its fields include work type, lane-reduction description, start/end dates and times, and import date; no real-time SLA or complete coverage is established.
- Added Tel Aviv-Yafo municipal bridge/tunnel layer 550 as asset discovery only. It identifies structure type and street context but has no clearance, weight, width, lane, direction, or measurement evidence.
- Added Tel Aviv-Yafo Waze report layer 891 as secondary situational-awareness only. It includes incidents, roadworks, hazards, traffic jams and reported closure events, plus report confidence/reliability and update fields. These remain community reports, not official road-authority confirmation; missing reports do not imply an open road.
- All three layers are explicitly candidate-only and routing-ineligible. Their municipal coverage is not represented as national coverage, and none can independently approve a route.

- Added the Ministry's delegated area-signing-authority GIS catalogue, listed as updated 22 July 2026. It contains 231 area records and a YEARMONTH field; examples include 202303, 202312, 202403 and 202601. The catalogue refresh date is not proof that each individual delegation record is current.
- Added the Ministry's traffic-authority names/types/codes directory, last updated 28 February 2023. It is a stale starting list only and does not establish current authority over any specific road segment or bridge.
- These authority datasets support an enquiry/contact matrix only. The exact competent authority must be confirmed for each road segment or asset; neither dataset can create a restriction or approve a route.

The quarantine evidence workflow was hardened so each assessment report carries the exact candidate payload SHA-256 it evaluates. Human-review creation, review verification, and manifest generation now reject reports linked to another candidate. Regression tests cover cross-candidate report substitution. The checksum specification was also corrected: the digest is calculated over UTF-8 bytes of `JSON.stringify(parsedPayload)`; whitespace is discarded, object-key enumeration follows JavaScript serialization order (not key-order-independent canonical sorting), and duplicate keys follow `JSON.parse` last-value semantics. This is an integrity checksum, not a signature or raw-file byte hash.

Latest verified workflow: [GitHub Actions run 43157429358](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/43157429358). All three jobs passed:
- Validate, application tests, dependency audit, Next.js build and concurrent smoke tests.
- Rollback-only Test database integration.
- Signed Test Auth / local HTTP integration and cleanup; cleanup reported zero marked disposable Test Auth users remaining.

PR #15 remains open and Draft. No merge, deployment, Production database writes, provider activation, or external authority outreach occurred. Truck routing remains blocked until authoritative, current, licensed, independently validated restriction records and coverage are established.


## Heavy-vehicle registry discovery and axle-load boundary — 12 November 2026

The Ministry's public catalogue also lists a technical registry for active vehicles above 3.5 tonnes and vehicles without a model code, with catalogue metadata observed as updated 10 November 2026. Its visible schema includes gross weight, tare/self weight, trailer/load-related weight, axle count and axle/tire configuration, but also registration and chassis identifiers. The catalogue labels the licence "Other (Open)", which is not sufficient evidence of commercial reuse or redistribution permission.

The registry is classified as a candidate reference for human review of static vehicle specifications only. No data was downloaded or imported; registration/chassis identifiers must not be bulk-copied into the app, logs or analytics. Human-reviewed registration documents remain the current vehicle-profile approval basis. Static registry fields cannot establish actual trip weight or per-axle load distribution.

The current route API requires both user-entered current trip weight and a measured heaviest-axle load, validates their numeric bounds, and sends the two values to HERE as distinct vehicle parameters. The fleet restriction evaluator compares gross weight against verified `weight` restrictions; an axle-specific restriction type is currently unsupported and intentionally fails closed as `restriction_type_requires_manual_review`. Do not represent an axle-load limit as a gross-weight limit. Add explicit schema and evaluator support only after an independently verified authoritative axle-limit source and a separately tested migration are available.

The source review is documented in `docs/data-sourcing/israel-heavy-vehicle-registry-review.md`, and the weight limitation document now links to it. No production or Test database was changed, no provider was enabled, no authority was contacted, and no merge/deployment occurred.


## Enterprise adoption and migration — 12 November 2026

Established fleets must be able to adopt TruckSafe without manually re-entering drivers, vehicles, customers and operating records one at a time. This is a core product capability.

The target Migration Center will upload Excel/CSV or select a named supported connector; inspect sheets/columns; suggest and edit mappings; validate rows, duplicates and relationships; preview exact create/update/skip/reject counts; run a no-write dry run; require authorized approval; import bounded, dependency-ordered, idempotent batches; reconcile source/target totals; and provide a downloadable row-level report with safe retry/recovery.

Sequence: **Phase A** vehicles, drivers, customers and delivery locations with fleet-scoped source IDs; **Phase B** open/future tasks, schedules, stops and shipments after master data is resolved; **Phase C** selected maintenance, incident, trip and delivery history with provenance; **later** named ERP/TMS/API connectors only after API access, customer authorization, field semantics, licensing, security and support ownership are verified.

Security: one verified fleet per import; authorized roles only; ambiguous matches require human review; no silent overwrites; dry run writes nothing; retries are idempotent; cross-fleet references are rejected; files/staging/reports are private; logs exclude raw personal data. Never execute spreadsheet formulas/macros. Never infer truck dimensions, weights, licence eligibility, GPS, delivery proof or safety facts from missing/ambiguous spreadsheet data. Imported safety-critical values require the same verification as native values.

Enterprise adoption also needs a labelled synthetic demo fleet, role-based onboarding, customer-approved migration rehearsal, reconciliation report, data ownership/export/retention documentation, security/access-control evidence, support/escalation expectations and measurable pilot outcomes.

**Status:** product plan only. Migration Center, parsers, import APIs and connectors are not implemented. No customer data or Production schema/data has been changed.
