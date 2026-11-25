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


### Additional RPC exposure check

Four public invoker read functions currently have `EXECUTE` for `anon`: `get_active_trip_map_data`, `get_latest_trip_locations`, `get_trip_distance_summaries`, and `get_trip_history_data`. Their definitions query fleet trip/location tables directly and do not perform an explicit `auth.uid()` check inside the function body. However, they are `SECURITY INVOKER`, and the underlying table RLS policies are restricted to `authenticated`; this is not evidence of an RLS bypass or anonymous access to trip data. It is still a least-privilege hardening candidate: after checking frontend usage and automated tests, consider revoking `EXECUTE` from `anon` on these read RPCs. No grant was changed during this audit.


## Exact mapping of the 12 missing Test tables — 25 November 2026

The 12-table difference is now mapped to three tracked migrations. Each migration is absent by name from the 43-row Test history, and a direct read-only `to_regclass` check confirmed that every table below is absent from Test:

| Missing Test table | Introducing migration |
|---|---|
| `daily_work_plans` | `20261112140000_add_daily_work_and_load_ledger` |
| `daily_work_stops` | `20261112140000_add_daily_work_and_load_ledger` |
| `daily_load_events` | `20261112140000_add_daily_work_and_load_ledger` |
| `shipments` | `20261112150000_add_shipments_and_cargo_operations` |
| `shipment_lines` | `20261112150000_add_shipments_and_cargo_operations` |
| `shipment_stops` | `20261112150000_add_shipments_and_cargo_operations` |
| `shipment_stop_lines` | `20261112150000_add_shipments_and_cargo_operations` |
| `shipment_stop_events` | `20261112150000_add_shipments_and_cargo_operations` |
| `delivery_note_settings` | `20261112160000_add_delivery_notes_and_proof_of_delivery` |
| `delivery_proofs` | `20261112160000_add_delivery_notes_and_proof_of_delivery` |
| `delivery_notes` | `20261112160000_add_delivery_notes_and_proof_of_delivery` |
| `delivery_note_adjustments` | `20261112160000_add_delivery_notes_and_proof_of_delivery` |

Content inspection confirms these three files create exactly 12 public tables, enable RLS on them, and define 16 public policies plus two Storage object policies. This accounts exactly for the 12-table difference between Test (13 public tables) and the clean local replay (25 public tables). It also accounts for a substantial part of the policy-count gap; the remaining policy differences must be reconciled against the other missing or version-divergent migrations.

This is now a concrete, content-backed explanation for the missing business modules in Test: daily work/load ledger, shipments/cargo operations, and delivery notes/proof of delivery. It does **not** authorize applying the three migrations to hosted Test; the remaining version/name/content divergence and dependency ordering still need to be resolved first.


## Version/name reconciliation and duplicate-history analysis — 25 November 2026

The complete Test history was compared programmatically against all 46 tracked migration filenames on this branch. Results:

| Comparison | Count |
|---|---:|
| Test history rows | 43 |
| Tracked migration files | 46 |
| Exact version + name matches | 4 |
| Shared names with different versions | 21 |
| Distinct Test-only names not present in the tracked chain | 18 |
| Duplicate Test history rows beyond one row per name | 2 |

The four exact matches are:
- `20261110145233_add_truck_route_api_rate_limit`
- `20261115050950_add_lane_level_bridge_clearance_evidence`
- `20261115051108_harden_verified_bridge_clearance_not_null_guards`
- `20261115051529_require_complete_verified_bridge_measurements`

The 21 shared names whose versions differ are:
- `add_geospatial_road_restrictions`: Test `20261108193434`, repo `20261108120000`
- `add_verified_by_fk_indexes`: Test `20261112140904`, repo `20261111160000`
- `add_vehicle_fleet_composite_key`: Test `20261113102129`, repo `20261113100000`
- `add_vehicle_special_equipment_profiles`: Test `20261113102143`, repo `20261113101000`
- `harden_special_equipment_review_and_read_access`: Test `20261113102345`, repo `20261113102000`
- `invalidate_special_equipment_after_body_change`: Test `20261113102510`, repo `20261113103000`
- `guard_special_equipment_evidence_fields`: Test `20261113102636`, repo `20261113104000`
- `align_special_equipment_rpc_with_private_schema_pattern`: Test `20261113102744`, repo `20261113105000`
- `secure_body_change_evidence_invalidation_trigger`: Test `20261113103003`, repo `20261113106000`
- `revoke_public_execution_on_body_change_trigger`: Test `20261113103222`, repo `20261113107000`
- `require_low_loader_special_equipment_review`: Test `20261113103506`, repo `20261113108000`
- `enforce_complete_vehicle_working_dimensions`: Test `20261113104235`, repo `20261113109000`
- `enforce_single_active_trip_assignments`: Test `20261114192340`, repo `20261114130000`
- `prevent_driver_deactivation_during_active_trip`: Test `20261114194136` and `20261114194500`, repo `20261114141000`
- `enforce_vehicle_active_trip_status`: Test `20261114194351` and `20261114194429`, repo `20261114143000`
- `protect_referenced_private_evidence`: Test `20261115045157`, repo `20261115100000`
- `guard_vehicle_registration_insert_verification`: Test `20261115045203`, repo `20261115113000`
- `use_israel_local_date_for_trip_compliance`: Test `20261115045210`, repo `20261115120000`
- `index_vehicle_special_equipment_evidence_verifier`: Test `20261115050255`, repo `20261114150000`

### Duplicate groups: current catalog state

Test contains two rows each for:
- `prevent_driver_deactivation_during_active_trip`: `20261114194136`, `20261114194500`.
- `enforce_vehicle_active_trip_status`: `20261114194351`, `20261114194429`.

The tracked branch has one canonical file for each logical migration:
- `20261114141000_prevent_driver_deactivation_during_active_trip.sql`
- `20261114143000_enforce_vehicle_active_trip_status.sql`

A read-only inspection of current Test triggers confirms one active driver consistency trigger on `drivers`, one on `trips`, and one vehicle consistency trigger on `vehicles`, with the expected private trigger functions. This suggests the duplicate history rows do not currently manifest as duplicate triggers. It does **not** prove which historical SQL text was executed for each version: Supabase migration history stores version/name metadata, not the original SQL body. Do not delete or rewrite either history row based only on current trigger names.

### Test-only history entries

The 18 distinct Test history names not present in the tracked 46-file chain include earlier/alternate route quota and road-restriction hardening steps, a Test-only schema reconciliation artifact, and intermediate special-equipment/dispatch hardening attempts. Some are plausibly superseded by later tracked migrations; this must be established from SQL provenance and current object definitions before any history cleanup. The Test-only reconciliation entry `20261110144502` remains explicitly excluded from the production migration chain.

### Safe conclusion

The Test history is not a simple “46 files versus 43 rows” lag. It contains:
- timestamp/version drift for 21 shared migration names;
- two duplicated logical migration names;
- 18 Test-only historical names;
- and at least three tracked business-module migrations absent from Test, which account for all 12 missing public tables.

The database catalog currently has the expected final driver/vehicle active-trip trigger set, but metadata alone cannot establish full SQL-content equivalence. A reliable final reconciliation requires either the historical SQL artifacts for the 18 Test-only/renumbered entries, or a carefully scoped catalog-level diff against the disposable local replay. No history repair is justified yet.


### Verification of current active-trip guard implementation

The six current private helper functions used by the driver/vehicle consistency triggers were inspected in Test. Their definitions match the logic in the two canonical tracked migration files:
- `private.assert_driver_trip_status`
- `private.check_driver_state_after_driver_change`
- `private.check_driver_state_after_trip_change`
- `private.assert_vehicle_trip_status`
- `private.check_vehicle_state_after_trip_change`
- `private.check_vehicle_state_after_vehicle_change`

All six are `SECURITY DEFINER`, explicitly pin `search_path = ''`, and have no EXECUTE privilege for `anon` or `authenticated`. They are called by database triggers, so keeping them non-callable directly by API roles is the intended least-privilege shape. This current catalog-level result is reassuring: despite duplicate history metadata, the effective Test trigger/function implementation matches the canonical active-trip guard design. It still does not recover the historical SQL text for the duplicate migration rows.

### Enumerated Test-only historical names

The 18 distinct Test-only history names are:
- `harden_verified_road_restriction_immutability`
- `restrict_security_definer_function_execution`
- `block_verified_road_restriction_deletion`
- `add_truck_route_rate_limit`
- `make_truck_route_quota_invoker_scoped`
- `prevent_truck_route_quota_reset`
- `validate_truck_route_quota_timestamps`
- `validate_road_restriction_active_date_range`
- `add_route_quota_primary_key`
- `grant_authenticated_insert_for_route_quota`
- `revoke_broad_route_quota_insert_privilege`
- `reconcile_production_vehicle_and_road_safety_schema` (Test-only compatibility artifact)
- `secure_special_equipment_review_rpc_wrapper`
- `revoke_direct_execute_on_equipment_trigger`
- `enforce_fleet_consistent_dispatch_v2`
- `index_fleet_dispatch_foreign_keys`
- `revert_incomplete_dispatch_hardening_attempt`
- `restore_driver_active_trip_guard`

These entries should remain in the Test history unless a separate, evidence-backed history cleanup is designed. Their presence alone does not mean they are harmful: they may describe legitimate historical steps whose resulting state is now represented by later canonical migrations.


## Read-only catalog, RLS, RPC, Storage and advisor audit — 25 November 2026

Scope: hosted Test project only (`yxxrgblpqzhnnyojbwcr`). This was a catalog/metadata audit. No rows were read from application tables, no SQL writes were executed, and no remote configuration or grants were changed.

### Public tables and RLS

- Test currently has 13 public base tables; all 13 have RLS enabled.
- Test currently has 36 public RLS policies. Every policy targets `authenticated`; there are no `anon` policies.
- All 13 tables have explicit fleet-membership/role or self/assigned-driver predicates. INSERT policies use `WITH CHECK`; UPDATE policies have both `USING` and `WITH CHECK`.
- There are no public views or materialized views in the current Test catalog.
- The `private` schema is not usable by `anon`; `authenticated` has schema USAGE but no CREATE. Public and Storage schema CREATE is false for both API roles.
- `FORCE ROW LEVEL SECURITY` is not enabled on the public tables. This is not automatically a defect: the application uses explicit authenticated RLS policies and privileged server/database roles. Revisit only if direct table-owner access is part of the threat model.

### Important default-privilege hardening opportunity

The Test catalog currently grants `anon` default privileges on future objects created by `postgres` in `public`: table CRUD/other table privileges and function EXECUTE. Existing public tables also have table-level privileges for `anon`, but all 13 tables have RLS enabled and no `anon` policies, so the current catalog does not show an anonymous row-access path.

This is a least-privilege hardening opportunity, not evidence of a current data leak. Before changing it, confirm that the app does not intentionally use anonymous Data API access (current UI source review found no anonymous data workflow). A future migration should:
1. Revoke broad `anon` table privileges from existing application tables, while preserving any intentionally public endpoints.
2. Revoke default `anon` table privileges for future public tables.
3. Revoke default `anon` EXECUTE on future public functions, then explicitly grant only the RPCs that must be public.
4. Re-run local migration replay, application smoke tests, and the advisor suite.

Do not apply these revocations directly to hosted Test or Production as part of this read-only audit.

### RPC and SECURITY DEFINER review

- The only two SECURITY Advisor findings remain `public.finish_trip(uuid, uuid)` and `public.start_trip_with_inspection(...)`. Both are SECURITY DEFINER, callable by `authenticated` only (not `anon`), pin `search_path = ''`, and implement explicit identity/fleet/role/state validation. These are intentional privileged operations, not candidates for blind revocation.
- Trigger-only functions (`add_fleet_owner_membership`, `handle_new_auth_user`, guard functions, `set_updated_at`) were distinguished from callable RPCs by return type and trigger attachment.
- Four SECURITY INVOKER read RPCs currently have EXECUTE for `anon`: `get_active_trip_map_data`, `get_latest_trip_locations`, `get_trip_distance_summaries`, and `get_trip_history_data`. Their underlying trip/location tables have authenticated-only RLS policies, so the invoker functions do not bypass RLS. A repository source scan across the app's JS/TS files found no frontend call sites for these four functions. They are candidates for an explicit `REVOKE EXECUTE FROM anon` in a future tested migration, after checking any external integrations; no grants were changed now.
- The two Security Advisor warnings are therefore intentional authenticated RPCs; no unexplained SECURITY DEFINER public function was found in this audit.

### Storage policy review

Both application buckets remain private:
- `incident-photos`: 5 MiB; JPEG/PNG/WebP; one object currently present.
- `vehicle-registrations`: 8 MiB; PDF/JPEG/PNG/WebP; no objects currently present.

Six `storage.objects` policies all target `authenticated`:
- Incident photo upload checks fleet membership from the first path segment. Reads require a matching incident row, which is itself protected by incident RLS. Deletes require the uploader to own the object, fleet membership, and that the object is not referenced.
- Vehicle-registration upload/read/delete enforce a two-segment UUID path and owner/fleet-manager membership for the fleet. Deletes additionally reject referenced objects.
No anonymous Storage policies were found. No Storage grants or policies were changed.

### Advisor results and performance notes

- Security Advisor: exactly 2 warnings, the intentional authenticated SECURITY DEFINER trip RPCs above; no additional security lints.
- Health Advisor: no findings.
- Performance Advisor: 18 unused-index notices. Test application tables are empty or lightly populated, so these are not sufficient evidence to drop indexes. Some indexes support FK checks, fleet scoping, or expected future workloads. Keep them until representative traffic/query plans and production usage data justify a measured change.
- There are overlapping road-restriction fleet/active indexes, but no index was dropped or rewritten; verify query plans and write overhead under representative load before consolidating.

### Application/Test feature compatibility

The branch's UI contains calls to the following RPCs, but all are absent from the current Test database:
- `create_daily_work_plan`
- `activate_daily_work_plan`
- `record_daily_load_operation`
- `complete_delivery_document`
- `create_shipment`
- `record_shipment_stop_result`
- `update_delivery_note_settings`
- `add_delivery_note_adjustment`

This is consistent with the 12 missing public tables and the three absent migrations documented above. The daily-work and shipment/delivery-note screens therefore cannot work end-to-end against the current Test database until the migration-history divergence is resolved and the three module migrations are safely applied in a controlled, verified environment. No attempt was made to apply them.

### Current disposition

- No current evidence of anonymous row access through public RLS or Storage policies.
- Main hardening candidates: revoke unnecessary `anon` defaults/privileges and the four unused invoker RPC grants, only after integration review and local test coverage.
- Main functional blocker: Test is missing the daily-work/load, shipment/cargo, and delivery-note/proof modules and their RPCs.
- Performance notices are informational; no index changes justified.
- This remains a read-only audit. No hosted database mutation, migration repair, merge, or deployment was performed.
