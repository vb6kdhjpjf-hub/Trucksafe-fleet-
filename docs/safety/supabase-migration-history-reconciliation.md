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


## Follow-up review: migration privilege intent and CI — 25 November 2026

### Feature-module migration grants verified

Reviewed the SQL grant/revoke statements in all three missing feature-module migrations:
- Daily work/load migration revokes table privileges from `anon` and `authenticated`, then grants `SELECT` to `authenticated`; its three write RPCs explicitly revoke `PUBLIC`/`anon` and grant EXECUTE only to `authenticated`.
- Shipments/cargo migration applies the same table privilege pattern to all five tables and explicitly restricts both write RPCs to `authenticated`.
- Delivery notes/proof migration applies the same table privilege pattern to all four tables and explicitly restricts its three write RPCs to `authenticated`.

This is consistent with the intended architecture: browser roles cannot write directly to these tables; authenticated users read through RLS and mutations pass through guarded SECURITY DEFINER RPCs. The absent modules are therefore not only missing schema objects; their migrations also contain important privilege boundaries. Do not recreate the tables manually or apply only a subset of the three migrations.

### Default privileges are inherited baseline grants

The broad `anon` default ACLs observed in Test are not explicitly established by any of the 46 tracked application migrations reviewed. They are baseline/default project privileges. The feature-module migrations explicitly revoke `anon` table privileges and explicitly grant the necessary authenticated access, showing that the project has already used object-specific least-privilege controls.

A future hardening migration could set safer defaults for objects created by the migration owner, but this must be evaluated against the complete Production schema and every public RPC/API contract before adoption. No global default-privilege change is included in this PR. Existing anonymous EXECUTE on the four invoker read RPCs also remains unchanged pending confirmation that no external consumer depends on them.

### Validation workflow status

Both isolated validation workflows for the latest documentation commit completed successfully:
- Run `45646342218`: success.
- Run `45646357167`: success.

These runs validate the current PR branch workflows; they are not a live Auth end-to-end test and do not validate a deployment against hosted Production. The previously documented live Auth integration remains skipped under the existing PR policy.

### Next safe gate

Before any hosted Test migration:
1. Obtain a complete, reachable Production schema/catalog snapshot and compare its existing objects and privileges against the disposable local replay.
2. Resolve the divergent Test migration ledger with evidence for each Test-only and duplicate entry; do not delete or rewrite ledger rows speculatively.
3. Verify all 46 migrations from a clean disposable replay and run application smoke tests.
4. Prepare a Test-only, reversible rollout plan for the three missing feature modules, including preflight object/constraint checks and post-migration RLS/RPC/Storage verification.
5. Only after explicit approval, apply the controlled plan to Test. Production remains out of scope.

No hosted database changes, grants, migrations, merge, or deployment were performed in this follow-up.


## Feature-module SQL dependency and rollout preflight — 25 November 2026

The three missing module migrations were reviewed beyond their grants, including function authorization, foreign-key dependencies, storage behavior, and partial-rollout hazards.

### Daily work and load ledger

- Depends on existing `public.fleets`, `public.drivers`, `public.vehicles`, `auth.users`, `private.has_fleet_role`, and verified vehicle-registration fields including `registration_verification_status`, `empty_weight_kg`, `gross_weight_kg`, and `weight_per_axle_kg`.
- Adds unique fleet-scoped vehicle/driver keys or indexes needed by its composite foreign keys. Confirm existing equivalent constraints/indexes and duplicates before rollout; do not assume an `IF NOT EXISTS` index is equivalent to a named unique constraint required by later migrations.
- The create/activate/record RPCs authenticate the caller and check fleet roles or assigned-driver identity. The plan creation additionally requires an active driver, available vehicle, verified registration, matching vehicle weight limits, and recent referenced initial gross/axle measurements.
- Table writes are deliberately routed through RPCs; direct table privileges are revoked. The load ledger is append-only by design.

### Shipments and cargo operations

- Depends on `public.fleets`, `public.drivers`, `public.vehicles`, `auth.users`, and `private.has_fleet_role`; it also ensures fleet-scoped driver/vehicle unique keys exist for composite foreign keys.
- Shipment creation is restricted to owner/fleet-manager/dispatcher roles and validates active driver/available vehicle, line quantities, stop allocations, and allocation totals.
- Stop-result recording checks either the authorized fleet role or the identity of the assigned driver, locks the shipment/stop rows, and records idempotent events.
- The five tables expose authenticated SELECT through RLS; direct writes are revoked and mutations use the two authenticated-only RPCs.

### Delivery notes and proof of delivery

- Depends on the shipment tables and their fleet-scoped foreign keys, `public.fleets`, `public.drivers`, `auth.users`, `private.has_fleet_role`, and Supabase Storage (`storage.buckets` and `storage.objects`).
- Creates a private bucket named `delivery-proof-private` with a 10 MiB limit and PNG/JPEG/WebP allowlist. It uses `ON CONFLICT(id) DO UPDATE` to force those settings if that bucket ID already exists. This is a real configuration write, not a harmless no-op. Before applying, verify the bucket does not already contain objects or an intentionally different configuration; preserve/backup any existing object data and confirm the target settings are approved.
- Adds two Storage policies for fleet/assigned-driver scoped upload and read. The object path must have four segments, with fleet, shipment, and stop IDs in the first three positions. Verify no existing policy names collide and that the intended path format matches the client uploader.
- Delivery proof requires uploaded objects in that bucket, a completed stop, and either a recipient signature or an owner/manager-authorized documented exception. Issued proofs, notes, and adjustments are protected by immutable-record triggers; corrections/cancellations are append-only.
- The migration's bucket upsert and policy creation need explicit preflight. Do not re-run the migration partially or manually create objects/policies to bypass migration history.

### Rollout implications

1. Confirm the complete prerequisite schema and helper-function signatures on the target DB before executing any of the three migrations.
2. Check all named constraints/indexes and all policy/bucket names for collisions. For `delivery-proof-private`, inspect bucket configuration and object inventory before allowing the migration's upsert to run.
3. Verify Storage API/client path construction uses `<fleet UUID>/<shipment UUID>/<stop UUID>/<filename>`; test upload, read, and unauthorized cross-fleet denial in a disposable environment.
4. Apply the three migrations only in a transaction-capable, backed-up Test rollout after resolving the ledger divergence. Verify all 12 tables, 16 public RLS policies, two Storage policies, bucket privacy/limits, eight authenticated-only RPC grants, and trigger immutability after application.
5. Test the daily-work, shipment, and delivery-note flows using at least two fleets and separate manager/dispatcher/driver accounts. Include cross-fleet IDs, unassigned drivers, replayed idempotency keys, invalid measurements, and storage path substitution.
6. Do not infer that successful SQL application alone proves the UI flows work. The app integration and Storage upload/read paths must be exercised end-to-end.

This review is static SQL analysis of the tracked branch files, not execution against a hosted DB. It does not resolve Test's migration ledger or certify Production compatibility. No hosted DB, Storage bucket, policy, grant, or migration was changed.


## Read-only Production recovery and catalog preflight — 25 November 2026

Production project `jqebxlhhffwiebijiugx` was restored from its paused state and subsequently accepted a read-only SQL connection. This section records catalog metadata only; no application rows were read and no schema, grants, Auth settings, Storage configuration, or migration history were changed.

### Current Production baseline

- Project connection is available; a read-only `current_database()/current_user()/now()` probe succeeded.
- Production has 12 public base tables: the same 12-table core baseline named in the recovered 5 November schema-only snapshot.
- All 12 public base tables have RLS enabled; zero public base tables were found with RLS disabled.
- Production migration history currently contains 35 rows. This is distinct from Test's 43 rows and the repository's 46 tracked migration files; counts alone do not establish migration equivalence.
- Production currently lacks `public.vehicle_special_equipment` and the daily-work, shipments/cargo, and delivery-note/proof module tables. No attempt was made to add them.
- Read-only prerequisite inspection confirms the core `drivers`, `vehicles`, `tasks`, `fleets`, and `fleet_members` relations contain expected identity/fleet keys and the current truck dimensions, registration verification, and assignment fields used by later feature migrations. This is a preflight observation, not approval to apply those migrations.

### Production security advisor

The Security Advisor reports:
- Two authenticated-callable SECURITY DEFINER RPCs: `public.finish_trip(uuid, uuid)` and `public.start_trip_with_inspection(...)`.
- One Auth warning: leaked-password protection is disabled.

The two RPCs are intended trip lifecycle entry points. Earlier read-only function-body inspection in Test showed explicit identity, fleet, role/assignment, and state checks with a pinned empty search_path; do not infer Production's exact function body from Test. Production RPC definitions and grants must be checked independently before any security change. Do not blindly revoke EXECUTE from authenticated users because that would break the trip workflow.

Leaked-password protection is a dashboard/Auth configuration item. It was not changed during this database-only audit; enabling it should be scheduled with an Auth configuration review and a sign-in/password-reset regression test.

### Performance advisor

Production reports two unindexed foreign keys:
- `road_restrictions.road_restrictions_verified_by_fkey`
- `vehicles.vehicles_registration_verified_by_fkey`

It also reports 35 unused-index notices. These are informational on a database with limited/unknown representative workload. No index was dropped or added. Before adding the two FK indexes, inspect exact existing index definitions and expected write/read workload; before removing unused indexes, collect representative query plans and usage over a meaningful active period.

### Disposition and next gate

Production is reachable again, but its 35-row migration history is not yet reconciled with the 46-file tracked chain. The 5 November schema-only snapshot remains the recovered core baseline candidate; its content matches the current 12-table core inventory, but it does not encode a cryptographic project ref. The missing feature modules are not present in Production and must not be applied as an unreviewed batch.

Next safe work is a read-only object-level comparison of Production against the disposable local 46-migration replay, including table/column/constraint/index/policy/function/trigger/Storage differences and exact migration-name/version mapping. Keep both hosted projects unchanged until the diff and a reversible Test-only rollout plan are reviewed. No hosted schema/data mutation, Auth setting change, grant change, migration, merge, or deployment was performed in this audit.


### Production migration-ledger comparison — read-only, 25 November 2026

A direct metadata comparison was completed between the 35 Production migration-history rows and the 46 SQL files in `chore/reproducible-supabase-local-env`:

| Item | Production | Tracked branch |
|---|---:|---:|
| Rows/files | 35 | 46 |
| Exact version + name matches | 6 | 6 |
| Shared logical names | 10 | 10 |

The comparison found 24 distinct Production history names not represented by a tracked migration filename, and 36 tracked migration names absent from Production history. Thus Production is not simply eleven migrations behind the branch. Its ledger represents a materially different historical chain, including earlier bootstrap/core fleet steps and several differently named/renumbered road-safety and trip-workflow steps.

The Production catalog currently has 12 public base tables, 32 public RLS policies, 22 public/private application functions, 17 public triggers, 98 public constraints, and two private Storage buckets. The two buckets are:
- `incident-photos`: private, 5 MiB limit, JPEG/PNG/WebP.
- `vehicle-registrations`: private, 8 MiB limit, PDF/JPEG/PNG/WebP.

This reinforces the safe disposition: do not use the repository's 46-file chain as an automatic catch-up migration against Production, and do not rewrite the Production ledger to match filenames. The next reconciliation must map the 24 Production-only names to their original SQL/provenance and compare effective catalog objects against the local replay. All queries were read-only; no hosted changes were made.


### Production RLS, Storage and privileged RPC review — read-only, 25 November 2026

Further Production catalog inspection confirmed:
- All 32 public RLS policies target roles other than `anon`; no public `anon` policies were found.
- No Storage object policies target `anon`.
- Both Production buckets are private and retain the existing limits/allowlists recorded above.
- The two Security Advisor SECURITY DEFINER RPCs, `finish_trip` and `start_trip_with_inspection`, both pin `search_path = ''`, deny EXECUTE to `anon`, and grant EXECUTE to `authenticated`.
- Read-only inspection of both Production function bodies confirms explicit `auth.uid()` checks, active fleet membership, fleet/driver or manager authorization, task/vehicle association, and trip-state validation. The start-trip function additionally validates the complete seven-item checklist and compliance dates before creating a trip. These are intended privileged transaction boundaries; retain them and do not bulk-revoke authenticated EXECUTE.
- The two other public functions with apparent `anon` EXECUTE are trigger-returning functions (`guard_road_restriction_verification`, `set_updated_at`), not application RPC entry points. No anonymous public RLS or Storage policy path was identified in this check.

The Auth advisor's leaked-password-protection warning remains the only clear user-facing Auth hardening item. No Auth settings were changed; enablement should be coordinated with an Auth regression check. All checks above were read-only.


### Test environment and latest CI confirmation — 25 November 2026

The dedicated Test project `yxxrgblpqzhnnyojbwcr` is also `ACTIVE_HEALTHY`. Its current public catalog contains 13 tables (all with RLS enabled), including `vehicle_special_equipment`; Production currently has 12 and does not contain that table. This confirms that the Test environment has a newer feature slice, but does not make its full schema or migration ledger a safe source for direct Production catch-up.

Test Security Advisor continues to flag only the two expected authenticated SECURITY DEFINER trip RPCs, and Test Health Advisor is clean. These warnings are intentional review prompts for privileged RPCs, not instructions to remove the authenticated entry points. The function-body and privilege review documented above remains the basis for retaining them pending explicit product/API review.

Latest CI for commit `343dcd745e5ae0acd5f4fecc60508c0c44366d0a` completed successfully (run `45658092082`):
- `validate`: passed dependency install, production dependency audit, app/safety/workflow tests, Next.js build, and isolated concurrent smoke tests.
- `database-integration`: passed target validation against the dedicated Test project, rollback-only database integration tests, and fixture cleanup.
- `auth-integration`: skipped by workflow policy; no live Auth end-to-end pass is claimed.

This is useful evidence for the application and rollback-only database tests on Test, but it does not validate the Production migration path, external routing provider integration, or live Auth flows. Production and Test remain unchanged by this validation.


## Cross-environment object-level drift review — 25 November 2026

A read-only comparison of the current Production and Test catalogs was completed for public columns, constraints, triggers, and functions. This is a targeted object inventory, not a complete schema dump/diff.

### Confirmed Test-only feature additions

The Test project contains a more advanced safety/compliance slice than Production:

1. **Special-equipment profiles**
   - Test-only table `public.vehicle_special_equipment` with fleet/vehicle-scoped travel and working dimensions, axle configuration, evidence status, and supporting document paths.
   - Four authenticated RLS policies: fleet-member SELECT; owner/fleet-manager INSERT, UPDATE, DELETE.
   - Review RPC `review_vehicle_special_equipment` delegates to a private SECURITY DEFINER helper. The helper pins an empty search_path, requires an authenticated reviewer with owner/fleet-manager role, validates vehicle registration evidence, body-type/equipment-kind match, bounded travel/working dimensions, and private-storage evidence before changing verification status.
   - Test-only triggers invalidate evidence when relevant vehicle classification changes and guard evidence fields.
2. **Vehicle classification**
   - Test adds `vehicles.body_type` and its validation constraint, not present in Production.
3. **Road restriction evidence model**
   - Test adds `structure_id`, `road_segment_id`, `lane_id`, passage length, posted-clearance status/value, surveyor, and measurement coverage fields, plus stricter evidence/coverage constraints. These are absent from Production.
4. **Trip-state consistency**
   - Test adds driver/trip/vehicle state-consistency triggers and constraints that are absent from Production.
5. **Route quota**
   - Test adds `consume_truck_route_quota()`, an authenticated-only invoker RPC with pinned empty search_path and per-user advisory-lock serialization over the rolling 10-minute request window. Its backing quota table is in the private schema.

### Security and behavior notes

- Test's public special-equipment policies are scoped to `authenticated`; the table has RLS enabled. No anonymous policy was observed.
- The public review RPC is SECURITY INVOKER, denies anon EXECUTE, and permits authenticated EXECUTE. Its private helper is SECURITY DEFINER but resides in the non-exposed `private` schema, pins an empty search_path, and performs explicit identity/role/evidence checks.
- The registration-review helper follows the same public-invoker/private-definer pattern.
- The two trip lifecycle SECURITY DEFINER RPCs remain authenticated-only and pin an empty search_path. Their warnings are expected advisor prompts; do not remove their authenticated grants without replacing the workflow.
- These findings are a static catalog/function-body review. They do not replace tests for Storage upload/read, cross-fleet denial, evidence invalidation, or real authenticated browser flows.

### Recommended staged rollout plan (not executed)

1. Preserve Production as-is; do not replay the 46-file branch migration chain into it.
2. Recover provenance and intended ordering for the Test-only feature migrations; reconcile against the 35-row Production ledger and the historical 5 November schema baseline.
3. Build a fresh disposable local database from the intended migration chain and run all schema replay, RLS, RPC, trigger, and rollback-only integration tests.
4. On Test only, after explicit rollout approval, apply a reviewed migration set in a maintenance window; immediately run catalog checks, RLS/advisor checks, Storage evidence tests, and cross-fleet negative tests.
5. Only after Test acceptance, prepare a separate Production change plan with exact SQL, preflight counts, backups, rollback strategy, and an explicit maintenance/approval gate. Do not use a blind migration-history repair.
6. Before real fleet use, complete live Auth E2E, password leaked-protection configuration review, provider/routing integration, and verified road-restriction data sourcing. No nationwide safe-routing claim is supportable until authoritative restriction data is available and maintained.

No hosted database, Auth, Storage, grants, or application data was changed during this review. No merge or deployment was performed.


## Latest CI and advisor recheck — 25 November 2026

- Commit `bcbdca6670bb6948613ae1fd1fdc93df13cee806` was validated by isolated workflow run `45658818481`: `validate` passed and `database-integration` passed; `auth-integration` was skipped by the workflow's deliberate branch/secret policy. This is a successful app/build/safety + rollback-only Test DB run, not a live Auth E2E pass.
- Both Production and Test remain `ACTIVE_HEALTHY`; latest Health Advisor results are empty for both projects.
- Latest Security Advisor:
  - Production: two intentional authenticated SECURITY DEFINER trip lifecycle RPC warnings, plus leaked-password protection disabled.
  - Test: the same two trip lifecycle RPC warnings. The private verification helpers are not exposed as anon-callable RPCs.
- Latest Performance Advisor:
  - Production: two unindexed FK findings on `road_restrictions.verified_by` and `vehicles.registration_verified_by`; 35 unused-index notices.
  - Test: no unindexed-FK finding (the corresponding reviewer indexes exist); 18 unused-index notices.
- Do not remove the trip lifecycle SECURITY DEFINER grants: the app's atomic start/finish workflow depends on those RPCs and their bodies contain explicit authorization/state checks. Keep leaked-password protection as a dashboard-level security action requiring a dedicated Auth regression window.
- Unused-index notices are not deletion recommendations for an almost-empty/new environment. Re-evaluate after meaningful workload and query-plan evidence.
- No database changes, Auth changes, merge, or deployment were performed.
