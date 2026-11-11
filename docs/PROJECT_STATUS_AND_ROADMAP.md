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


## Synthetic query-plan and performance regression checks

A rollback-only CI test now creates two temporary benchmark relations with 100,000 synthetic rows each. It checks the PostgreSQL plans for two common fleet operations: filtering tasks by fleet and status, and loading the latest location history for a trip. The runner asserts that the expected composite indexes are actually used, that each limited query returns 100 rows, and that PostgreSQL reports an execution time.

Latest observed isolated CI measurements on the dedicated Test project's PostgreSQL instance:
- Fleet/status task query: `idx_trucksafe_perf_tasks_fleet_status` used; 100 rows returned in 2.922 ms.
- Trip location history query: `idx_trucksafe_perf_locations_trip_recorded` used; 100 rows returned in 0.175 ms.

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
