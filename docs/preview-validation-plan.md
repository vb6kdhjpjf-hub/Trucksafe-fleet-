# Preview and release validation plan

Last reviewed: 2026-11-08

## Current gate

Do not enable a new Vercel Preview deployment for this branch yet.

Read-only account inspection found older READY Preview deployments from this feature branch (latest inspected READY commit: `0f5fcd8`); the current PR head is newer and has not been deployed. The most recent deployment record inspected was CANCELED. Do not use the older Preview URLs for routing tests.

The connected Vercel Preview environment currently uses the connected Supabase project's environment configuration. The geospatial road-restriction migration is intentionally not applied to that project, so the current API query for the new columns must fail closed with HTTP 503. A Preview against this database would not provide a valid routing integration test and could encourage testing against production data.

Read-only inspection also found a HERE credential configured for both Production and Preview, and the Preview branch feature switch was enabled. The credential had previously been exposed in chat, so it must be rotated before use. Older Preview builds do not contain the new safety gates and must not be used to test routing. No Production deployment or merge is permitted as part of this plan.

## Safe validation already automated

GitHub Actions performs:
- Node.js security regression tests.
- Production dependency audit (fail on high/critical).
- Exact dependency installation.
- Full Next.js production build.
- Pre-trip SQL integration tests in an isolated PostgreSQL 17 service.
- Geospatial migration application and verification-trigger/constraint tests in that isolated database.

Unit coverage includes:
- HERE Flexible Polyline 2D/3D decoding.
- HERE provider notice handling, including administrative-wide vehicle violations reported with informational severity.
- Route/restriction geofence matching.
- Vehicle dimensions and weight checks.
- Israeli time-zone windows and overnight windows.
- Missing/unverified provenance and incomplete restrictions.
- Explicit HERE parameter units (cm for dimensions; kg for weights).
- Conservative source-data candidate ingestion (point geometry only, no automatic verification).

## Preview prerequisites

Before creating a real Preview:
1. Create or select a dedicated non-production Supabase database/branch. Check and explicitly approve any hourly/monthly cost first.
2. Apply all migrations to that isolated database, including the geospatial restriction migration.
3. Configure Vercel Preview-only Supabase URL/publishable key and routing feature flags. Do not copy production service-role secrets into a browser-visible variable.
4. Use a HERE test key or an approved low-volume test plan. No live provider request should be sent until the owner confirms billing and terms.
5. Seed synthetic vehicles and synthetic road restrictions only. Never copy production personal or fleet data.
6. Test allowed routes, critical HERE notices, invalid/missing geometry, unverified nearby restrictions, verified conflicts, time-window crossings, and multi-fleet authorization.
7. Confirm logs contain no bearer tokens, API keys, addresses beyond operational need, or raw provider URLs containing secrets.

## Release gate

A release candidate requires:
- All GitHub Actions checks green on the exact PR head commit.
- Isolated database migration checks green.
- A dedicated Preview with isolated data and no production credentials.
- Human review of HERE notices and representative Israel truck routes.
- Documented source/licence/coverage approval for each external restriction feed.
- Explicit owner approval before enabling Preview, merging, applying production migrations, or deploying Production.

## HERE provider notice handling

The route API discards a route if any HERE notice has `severity=critical`, including future/unknown critical codes. It also discards a route for any notice whose code begins with `violated`, because HERE documents administrative-area-wide truck restriction violations as `info` notices even though they describe an actual vehicle restriction violation. Ordinary informational notices remain displayable. The request includes `instructions` because the client uses maneuver instruction text.

## HERE credential and paid-usage safety gates

The server-side routing configuration now requires all of the following before it returns a HERE API key to the route handler:
- `TRUCK_ROUTING_ENABLED=true`.
- `TRUCK_ROUTING_PROVIDER=here`.
- `HERE_API_KEY_ROTATED=true`, set only after the previously exposed credential has been revoked and replaced.
- `HERE_PROVIDER_USAGE_APPROVED=true`, set only after the owner explicitly approves provider terms, billing, and a low-volume test plan.
- A non-empty server-side `HERE_API_KEY`.

The two new approval variables are intentionally absent until those prerequisites are met. Do not add them, make HERE requests, or use older Preview builds before explicit owner approval.

## Isolated database baseline — current findings

A one-time schema-only export from the original Supabase project completed successfully. It contains no exported table rows or `COPY` data sections and was inspected locally; the SQL file is not committed to this repository.

The export includes the current application tables, functions, policies, indexes, constraints, and **15 application-table triggers** expressed as PostgreSQL 17 `CREATE OR REPLACE TRIGGER` statements. The only custom trigger missing from the export is the additional trigger on `auth.users`. A read-only catalog comparison against the original database confirmed 12 application tables, 17 application functions, 32 RLS policies, 15 triggers on application tables, and one additional custom trigger on `auth.users` (16 triggers total). The exact DDL for the missing `on_auth_user_created_profile` trigger and its associated function were retrieved read-only from the live catalog. No trigger was created or changed in Production.

The test-only restoration script at `supabase/test-baseline/restore_triggers.sql` now contains **only** the missing `auth.users` trigger. It is deliberately outside `supabase/migrations/` so it cannot be mistaken for a Production migration. Do not recreate the 15 application-table triggers: they are already included in the schema snapshot. Run the restoration script only after the reviewed baseline has created the referenced `public.handle_new_auth_user()` function.

The dedicated `TruckSafe Fleet Test` Supabase project is active and currently has no application tables or migrations. Its Supabase-managed schemas/extensions are initialized, and the four extensions referenced by the schema snapshot (`pg_stat_statements`, `pgcrypto`, `supabase_vault`, and `uuid-ossp`) are already installed. Do not apply the incomplete dump or the feature-branch incremental migrations to it until the complete baseline, including grants, RLS policies, default privileges, and the one missing auth trigger, has been reviewed and securely transferred. Do not copy production rows, auth users, storage objects, or secrets.

The production migration ledger was queried read-only and contains these 22 versions: `20261103110159` initial_trucksafe_fleet_schema; `20261103110210` fleet_owner_membership_and_profiles; `20261103110232` tighten_function_permissions_and_indexes; `20261103180500` link_maintenance_records_to_incidents; `20261103183205` sync_vehicle_status_on_trip_start; `20261103183342` restrict_start_trip_rpc_to_authenticated; `20261103183550` restrict_fleet_helper_rpc_execution; `20261103185020` index_vehicles_assigned_driver_fk; `20261103185629` fleet_road_restrictions_and_rls_tuning; `20261103185949` index_road_restrictions_created_by; `20261103190306` atomic_finish_trip_workflow; `20261103191613` split_manager_write_policies; `20261103191646` allow_incident_photo_owner_cleanup; `20261103191912` validate_active_driver_and_exact_pretrip_checklist; `20261103192326` allow_assigned_drivers_atomic_trip_updates; `20261103192402` merge_driver_and_manager_update_policies; `20261103193658` restrict_trip_actions_to_assigned_driver_or_manager; `20261106073450` pretrip_defect_reporting; `20261106075450` fix_driver_guard_private_role_helper; `20261106081844` add_demo_vehicle_trip_guard; `20261106090551` block_demo_vehicle_task_assignment; and `20261106092850` add_truck_vehicle_dimensions.

The feature branch currently contains only five migration files, and their version IDs are not a complete match for the production ledger (some timestamps differ and the fix_driver_guard_private_role_helper migration is absent). The new 20261108120000_add_geospatial_road_restrictions.sql migration is feature-only and is not in the production ledger or baseline snapshot. The isolated test baseline therefore needs to be treated as a reviewed schema snapshot rather than pretending the missing historical migration files have been recovered.

On current feature branch head `5cdb0a4b8af1310d7bded5a5ebf01e8b3c333170`, all four CI runs completed successfully: two Build/dependency-audit runs and two Pre-trip SQL integration runs. Each workflow type passed on the exact current head. The one-time export workflow was removed immediately after it started; its run completed successfully. PR #14 remains Draft and unmerged. No Vercel environment changes, HERE calls, production schema changes, or deployment were made during this export.

## Current Production security-advisor findings

A fresh read-only Supabase advisor check on 2026-11-08 reported three security warnings: `finish_trip` and `start_trip_with_inspection` are SECURITY DEFINER RPCs callable by `authenticated`, and leaked-password protection is disabled. The two RPC definitions were reviewed previously: they enforce authentication, fleet membership, and role/driver authorization in their function bodies; `anon` does not have EXECUTE. Do not remove SECURITY DEFINER or revoke authenticated execution without redesigning the RLS-dependent workflow and testing it. The leaked-password protection warning remains an open hardening item; enable it in Supabase Auth settings before production release. No Auth setting was changed.

The performance advisor reports 11 unused indexes (INFO only). These are not removed: low/zero observed usage alone is insufficient evidence that indexes are unnecessary, especially before real workload profiling. The Production health advisor returned no findings. The new isolated test project currently has no app tables or migrations and its security, performance, and health advisors return no findings because it is still empty; that is not evidence that the app schema is secure.

## Additional routing safety hardening

A code review found that a road restriction with only one time-of-day boundary (`valid_from` or `valid_until`) could previously be treated as active without a complete interval. The geometry evaluator now returns an unresolved result for partial time-of-day windows, which blocks route display; regression tests cover both one-sided cases. Complete windows, overnight windows, sub-minute windows, and invalid route durations remain covered.

The route API no longer logs raw exception messages from HERE/network failures. Since the provider key is placed in the server-side request URL, exception text could potentially contain a full URL; logs now retain only the safe processing stage and error class. A database-backed rolling quota now limits each authenticated user to 10 truck-route calculations in any 10-minute window. The quota is checked server-side before any geocoding or routing request; quota-check failures fail closed, and the private quota table is not readable by client roles. This is a per-user guard, not a global billing ceiling: before enabling paid provider requests, also configure an explicit provider/account spend or usage limit and monitor it.
