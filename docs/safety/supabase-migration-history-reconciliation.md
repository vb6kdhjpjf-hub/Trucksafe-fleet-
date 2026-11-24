# Supabase migration-history reconciliation audit

Read-only comparison performed 24 November 2026 against the dedicated Test project `yxxrgblpqzhnnyojbwcr` and repository branch `docs/route-assessment-atomic-trip-start`.

## Scope and safety

- Queried only the dedicated Test project's `supabase_migrations.schema_migrations` metadata and `information_schema`.
- Read the repository's tracked `supabase/migrations/` filenames.
- Did not inspect or change Production.
- Did not write to Test, repair migration history, or export application data.

## Exact comparison

| Item | Repository branch | Test migration history |
|---|---:|---:|
| Migration files / history rows | 46 | 43 |
| Unique migration names | 44 | 41 |
| Duplicate names | 2 | 2 |
| Exact version + name matches | 4 | 4 |
| Unique names appearing in both | 23 | 23 |

Only four Test history rows match a tracked migration on both version and name:
- `20261110145233_add_truck_route_api_rate_limit`
- `20261115050950_add_lane_level_bridge_clearance_evidence`
- `20261115051108_harden_verified_bridge_clearance_not_null_guards`
- `20261115051529_require_complete_verified_bridge_measurements`

Of the 25 Test history rows whose names also appear in the branch, 21 have a different version from the tracked file. The history also contains duplicate names for `enforce_vehicle_active_trip_status` and `prevent_driver_deactivation_during_active_trip`, each recorded twice.

## Test history names not represented by a tracked file in this branch

```text
20261108193824 harden_verified_road_restriction_immutability
20261108194008 restrict_security_definer_function_execution
20261108194426 block_verified_road_restriction_deletion
20261108195016 add_truck_route_rate_limit
20261108195304 make_truck_route_quota_invoker_scoped
20261108195705 prevent_truck_route_quota_reset
20261108195817 validate_truck_route_quota_timestamps
20261108200740 validate_road_restriction_active_date_range
20261108201143 add_route_quota_primary_key
20261110071212 grant_authenticated_insert_for_route_quota
20261110071325 revoke_broad_route_quota_insert_privilege
20261110144502 reconcile_production_vehicle_and_road_safety_schema
20261113102448 secure_special_equipment_review_rpc_wrapper
20261113103253 revoke_direct_execute_on_equipment_trigger
20261114191919 enforce_fleet_consistent_dispatch_v2
20261114191938 index_fleet_dispatch_foreign_keys
20261114192052 revert_incomplete_dispatch_hardening_attempt
20261114194459 restore_driver_active_trip_guard
```

## Tracked migration files absent from Test history by name

```text
20261110084244_add_road_restriction_location_and_verification.sql
20261110084522_add_restriction_review_timestamp_and_note.sql
20261110090024_guard_road_restriction_verification.sql
20261110091500_guard_road_restriction_verification.sql
20261110092200_invalidate_verification_after_restriction_edits.sql
20261110093000_add_measured_and_posted_height_clearance_evidence.sql
20261110093100_include_height_measurement_evidence_in_review_guard.sql
20261110110000_add_vehicle_registration_verification.sql
20261110130040_secure_vehicle_registration_review_rpc.sql
20261110130634_harden_vehicle_registration_review_authorization_order.sql
20261110131201_require_existing_private_registration_document_for_review.sql
20261110170000_guard_vehicle_registration_insert.sql
20261111162000_enforce_fleet_scoped_foreign_keys.sql
20261111180000_maintenance_incident_vehicle_match.sql
20261112140000_add_daily_work_and_load_ledger.sql
20261112150000_add_shipments_and_cargo_operations.sql
20261112160000_add_delivery_notes_and_proof_of_delivery.sql
20261114145000_lock_driver_before_trip_completion.sql
20261117165300_harden_verified_bridge_country_and_verifier.sql
20261118190000_harden_shipment_driver_membership.sql
20261118193000_require_verified_vehicle_registration_for_trip.sql
20261118194500_guard_task_assignment_eligibility.sql
```

## Baseline finding

The first tracked migration, `20261108120000_add_geospatial_road_restrictions.sql`, alters `public.road_restrictions`; it does not create that table. A clean local stack therefore cannot replay the tracked chain from zero. Test currently has `public.road_restrictions` and the core fleet tables, but their authoritative pre-migration DDL is not present in the tracked migration directory.

The untracked Test history entry `20261110144502_reconcile_production_vehicle_and_road_safety_schema` is a material lead to investigate, but its presence in Test history alone does not establish that its statements are the original baseline or that they are safe to recreate. Likewise, a schema-only snapshot from the current post-migration Test database must not be relabeled as the pre-migration baseline.

## Required next evidence

1. Locate an authoritative schema-only backup or original bootstrap SQL from before the first road-safety migration, with its creation date and source project identified.
2. Obtain the full original SQL for the Test-only reconciliation entry and determine its provenance; do not blindly replay it.
3. Reconcile each migration by both version and content, including the duplicate-name records, and identify which tracked files were renamed, rewritten, superseded, or never applied to Test.
4. Compare the candidate baseline and migration chain against the intended Test schema using a disposable local stack. Keep Test rollback-only and Production untouched until the mapping is reviewed.

Until these steps are complete, do not run a clean reset as a release gate, repair remote migration history, synthesize a baseline from the current Test schema, or add route-assessment schema migrations.


## Additional provenance check: Test-only reconciliation entry

The Test history contains `20261110144502_reconcile_production_vehicle_and_road_safety_schema`, which is not tracked in this branch. Its recorded SQL was inspected read-only. It explicitly describes itself as a Test-only reconciliation against the then-deployed Production schema. It alters pre-existing `public.road_restrictions` and `public.vehicles`, replaces constraints and triggers, and creates/updates Storage buckets and policies. It does **not** create `public.road_restrictions`, `public.vehicles`, or the core fleet tables. Therefore it is not the missing bootstrap baseline; it is a later reconciliation that assumes those tables already existed.

This makes the original pre-migration bootstrap DDL (or an authoritative schema-only backup from before the first road-safety migration) the remaining source needed to make a trustworthy clean local replay possible. The recorded reconciliation SQL is useful provenance evidence, but must not be promoted into a baseline or replayed as a substitute.


## Historical branch check

The repository's earlier tracked migration branches were also inspected read-only:
- `feat/pretrip-defect-reporting` contains only `20261104113000_pretrip_defect_reporting.sql`.
- `feat/truck-vehicle-routing-profile` contains that migration plus demo-vehicle and truck-profile migrations before the road-restriction migrations.
- The earliest pre-trip migration replaces `public.start_trip_with_inspection` and references existing `public.tasks`, `public.drivers`, `public.vehicles`, and `public.incidents`; it does not create those core tables.
- The truck-profile migrations likewise alter existing vehicle/task structures rather than creating the fleet bootstrap schema.

This confirms the missing core schema is not simply omitted from the current PR stack: the earliest historical migration branches inspected also assume that the application database had already been bootstrapped outside the tracked migration chain.


## Test-only reconciliation artifact in the repository

The branch also contains `.github/tests/test-db-migrations/20261110144502_reconcile_production_vehicle_and_road_safety_schema.sql`. Its header explicitly says it was applied only to the dedicated Test project, must not be placed under `supabase/migrations` or applied to Production, and is retained for audit/repeatability. Its SQL begins by altering the already-existing `public.road_restrictions` and `public.vehicles` tables. This independently confirms that the reconciliation entry is a Test-only compatibility migration, not the missing initial schema bootstrap.
