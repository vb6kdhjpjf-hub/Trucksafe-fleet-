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


## Recovered pre-migration schema snapshot — 5 November 2026

A previously uploaded Library artifact was recovered: `trucksafe-schema-only.zip`, containing a 52,451-byte `schema.sql` (1,630 lines). The ZIP entry timestamp is 2026-11-05 08:08:16 UTC; the Library copy was created at 08:36 UTC.

Its provenance is now substantially clearer:
- GitHub Actions run `41991417805`, workflow `Supabase schema-only backup`, on `main`, was dispatched at 2026-11-05 08:02:02 UTC and completed successfully at 08:08:20 UTC.
- The successful workflow step was `supabase db dump --db-url="$SUPABASE_DB_URL" --file=schema.sql`; it explicitly exported schema only, no data, and uploaded the `trucksafe-schema-only` artifact.
- In the same earlier conversation, the user showed the Supabase Session Pooler username `postgres.jqebxlhhffwiebijiugx`, which identifies the Production project `jqebxlhhffwiebijiug`. The dump itself does not embed a project ref and the GitHub secret value is not inspectable, so the Production source attribution is strongly supported by the contemporaneous conversation but is not encoded cryptographically in the ZIP.
- The GitHub artifact retention was seven days and the original Actions artifact is now expired; the Library ZIP is the retained copy.

### Snapshot contents

The recovered SQL contains:
- 12 public base tables: `drivers`, `fleet_members`, `fleets`, `incidents`, `inspections`, `maintenance_records`, `profiles`, `road_restrictions`, `tasks`, `trip_locations`, `trips`, and `vehicles`.
- 41 public RLS policies.
- 10 public/private application functions.
- 12 public triggers. The custom `auth.users` profile trigger is not present in this dump and was handled separately by the later isolated restore workflow.
- No top-level data INSERT statements and no COPY data blocks. The four textual INSERT statements are inside dollar-quoted function bodies, not seed/data statements.
- SHA-256: `cf7d094dea68849d827478cd583824651f50f57b8a5e1fee0e8cf46b6bece838`.

Crucially, this snapshot **does create** `public.road_restrictions` and the other core fleet tables. Its `road_restrictions` definition is the earlier 18-column base form; the later geospatial, provenance, and lane-level measurement fields are absent, consistent with the first tracked road-restriction migrations being dated 8 November onward. It also predates `vehicle_special_equipment`, which is expected to be introduced by later migrations.

The September 2026 `Trucksafe-Fleet-V1.3.zip` was also recovered. Its `supabase/schema.sql` is only a small prototype schema for `trucks`, `drivers`, `trips`, and `alerts`; it is not the correct baseline for the current fleet application. The 5 November schema-only dump is the relevant candidate.

### Updated blocker status

The missing-base-schema blocker is **partially resolved**: a plausible pre-8-November schema baseline has been recovered, with a successful backup workflow run and contemporaneous Production-project connection evidence. It is not yet promoted into the tracked migration chain because the ZIP does not itself carry the source project ref and the entire 46-file migration chain has not yet been replayed against it.

Next safe validation: use this schema-only SQL in a disposable local Supabase stack, then apply the tracked migrations in order and record the first remaining incompatibility. Do not restore this snapshot to either hosted project, do not repair Test migration history, and do not modify Production. The separate Test history/version/name divergence still needs reconciliation after the local replay.


## Verified disposable local replay — 24 November 2026

The recovered 5 November schema-only snapshot was restored into a disposable local Supabase Postgres stack using pinned Supabase CLI 3.3.0. No hosted Production or Test connection string, access token, service-role key, or hosted database endpoint was supplied to the replay workflow.

The first replay identified two genuine chain defects, both corrected in the tested branch before the successful clean replay:

1. `20261110084244_add_road_restriction_location_and_verification.sql` added `empty_weight_kg` and then constrained it against `gross_weight_kg`, but did not create `gross_weight_kg`. The recovered 5 November snapshot lacks that column. The migration now adds `gross_weight_kg numeric` with `IF NOT EXISTS` before adding the constraint. The dedicated Test schema independently confirms the intended type is `numeric`.
2. `20261112130000_add_lane_level_bridge_clearance_evidence.sql` already creates three named constraints. `20261115050950_add_lane_level_bridge_clearance_evidence.sql` attempted to add the same three names again without dropping/replacing them. The later migration now drops those three earlier constraints before recreating them with its stronger definitions.

Successful final run: GitHub Actions run `45408928973` (`Temporary local Supabase schema replay`), completed successfully. It restored the snapshot, applied all 46 tracked migrations in order, and verified:
- 46 rows in `supabase_migrations.schema_migrations`;
- `public.road_restrictions` exists;
- `public.vehicle_special_equipment` exists;
- 25 public base tables;
- 57 public RLS policies.

The local database stack was stopped successfully with `supabase stop --no-backup`. The replay was isolated to an ephemeral GitHub-hosted runner and did not change either hosted Supabase project.

### What this proves — and what it does not

The recovered 5 November schema plus the corrected tracked migration chain now replays successfully in a clean local Postgres environment. The two migration defects above are fixed on the reproducibility PR branch.

This does **not** reconcile the separate 43-row hosted Test migration history, prove that Test and Production have identical schema, or authorize any remote schema change. Production was inactive/unavailable to read-only introspection during this check. The Test migration-history divergence remains a separate, read-only reconciliation task. No deployment or merge was performed.


## Read-only Test catalog and security audit — 25 November 2026

A further read-only inspection was performed against the dedicated Test project `yxxrgblpqzhnnyojbwcr`. No DDL, migration repair, data write, or deployment was performed.

### Current application objects

The Test project currently has 13 public base tables, all with RLS enabled:

```text
drivers
fleet_members
fleets
incidents
inspections
maintenance_records
profiles
road_restrictions
tasks
trip_locations
trips
vehicle_special_equipment
vehicles
```

It also has one private-schema base table, `private.truck_route_requests`. This confirms that the previously observed difference between 13 Test public tables and 25 tables in the successful local replay is real at the catalog level. The Test table inventory is the 12-table core baseline plus `vehicle_special_equipment`; it does not currently contain the additional public tables present after the full 46-migration local chain. Exact mapping of each missing table to its introducing migration remains to be completed before any remote repair is considered.

All 13 public tables have row-level security enabled. Test currently has 36 public policies, compared with 57 in the disposable local replay. There are also six Storage object policies and two private buckets:
- `incident-photos`: private, 5 MiB limit, JPEG/PNG/WebP.
- `vehicle-registrations`: private, 8 MiB limit, PDF/JPEG/PNG/WebP.

The Storage policies are scoped to authenticated users; vehicle-registration upload/read/delete checks the two-level fleet/vehicle UUID path and fleet owner/manager role. Both Storage delete policies also check that the object is not referenced through `private.storage_object_is_referenced`. These checks are observations of the current Test configuration, not a claim that the entire Storage configuration is identical to Production.

### Test-only reconciliation migration provenance

The exact repository artifact `.github/tests/test-db-migrations/20261110144502_reconcile_production_vehicle_and_road_safety_schema.sql` was fetched and inspected. Its header explicitly says it is Test-only and must not be placed under `supabase/migrations` or applied to Production.

The SQL assumes that `public.road_restrictions` and `public.vehicles` already exist. It adds road-restriction provenance/geometry/measurement fields and vehicle-registration fields, replaces constraints and triggers, installs private registration-review functions, and configures the two private Storage buckets and six policies. It does not create the core fleet tables. It is therefore not a bootstrap migration and must not be replayed as a baseline or promoted to Production.

### Security observations

The current Test security advisor reports two warnings:
- `public.finish_trip(uuid, uuid)`
- `public.start_trip_with_inspection(...)`

Both are `SECURITY DEFINER` functions executable by `authenticated`, and neither is executable by `anon`. Their bodies perform explicit authentication, fleet-membership, role/driver-assignment, and state checks. These appear to be intentional authenticated RPC entry points; the advisor warning should be retained for explicit security review, not “fixed” by blindly revoking execution and breaking trip workflows.

The private schema is not usable by `anon` (`USAGE=false`) and is usable by `authenticated`; its helper functions have explicit per-function grants. Public trigger/helper functions may show execute privileges because they are invoked by triggers or exposed as invoker functions, so privilege changes must be evaluated function-by-function, not by bulk revocation.

### Updated disposition

- Test migration history remains 43 rows versus 46 tracked migration files, with only four exact version+name matches and two duplicate-name groups, as recorded above.
- Test catalog now confirms 13 public tables / 36 public policies, versus 25 / 57 in the successful local replay.
- The Test-only reconciliation artifact is provenance evidence for a one-off Test schema alignment, not a reproducible migration baseline.
- No remote changes were made. Do not repair Test migration history, apply missing migrations, or deploy until the per-migration mapping and intended target schema are reviewed. Production remains outside this audit because it was not available for read-only introspection.
