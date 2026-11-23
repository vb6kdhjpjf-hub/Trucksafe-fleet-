# Route assessment and atomic trip-start contract

Status: implementation specification; not an operational routing approval. No provider is selected, enabled, or called by this document.

## Safety boundary

A provider route is not proof of truck safety. The current provider and nationwide restriction-coverage gates remain closed. Until both are independently approved, the system must not create an assessment in an operationally approvable state and must not permit a trip-start operation that claims route approval.

This contract is deliberately separate from the planned-route adapter contract. It defines how a future, approved route assessment becomes bound to one trip-start transaction.

## Proposed data model

Use a non-exposed `private` schema table, provisionally `private.route_assessments`. Confirm the repository's actual schema, naming conventions, grants, and migration history before writing a migration. Do not create this table directly in a hosted database.

Minimum fields:

- `id uuid primary key`
- `fleet_id`, `task_id`, `driver_id`, `vehicle_id` (all required and fleet-bound)
- `trailer_ids uuid[]` in canonical, stable order; empty only when the verified vehicle profile establishes no trailer
- `status` constrained to `draft`, `evaluated`, `approved_for_trip`, `consumed`, `rejected`, `expired`, `invalidated`, `superseded`
- `snapshot_version`, `snapshot jsonb`, `snapshot_sha256`
- `provider_id`, `provider_route_id`, `route_fetched_at`, `route_geometry_sha256`
- `restriction_catalogue_version`, `restriction_catalogue_sha256`, `restriction_evaluated_at`
- `evaluated_at`, `approved_at`, `expires_at`, `consumed_at`
- `consumed_trip_id` with a unique constraint when non-null
- `created_by`, `created_at`, `updated_at`
- stable machine-readable `reason_codes` and a bounded human-readable diagnostic field

Keep the table outside exposed schemas. Revoke default access; expose only narrowly scoped authenticated RPC wrappers after reviewing the existing fleet authorization helpers. Do not grant clients direct INSERT/UPDATE/DELETE. A SECURITY DEFINER implementation must live in the private schema, use an empty search_path, explicitly require `auth.uid()`, validate fleet membership and role, and have EXECUTE revoked from PUBLIC/anon. A public wrapper, if required, should be SECURITY INVOKER and must not bypass authorization.

## Snapshot contract

The snapshot is immutable once evaluated. Canonical serialization must be deterministic (stable key ordering, normalized units, normalized UUIDs, explicit null semantics, no locale-dependent formatting). Hash the exact canonical UTF-8 bytes with SHA-256 and store both the canonical snapshot and digest.

At minimum bind:

1. Fleet, task, assigned driver, vehicle and ordered trailer identities.
2. Driver licence evidence references, class decision, expiry, decision-rule version and reviewer/source provenance. A free-text `license_class` alone is not legal evidence.
3. Vehicle registration verification identity and document digest, registered dimensions, permitted gross/axle limits and profile version.
4. Per-trip measured gross weight and heaviest axle weight, units, measurement timestamp, source/device, operator and verification status. Never derive axle load by dividing gross weight by axle count.
5. Origin and destination coordinates/addresses, coordinate reference system, route direction, route identity, provider and route geometry digest.
6. Restriction catalogue version/digest, each applicable restriction evidence reference, source authority, verification/expiry timestamps and coverage scope.
7. Provider approval ID/version, licence scope and geographic coverage approval ID/version.
8. Assessment algorithm version, rule-set version, evaluation time, expiry and reason codes.

Do not store secrets or unnecessary personal information in the snapshot. Evidence references should point to existing private evidence records, not duplicate document bytes.

Any material input change creates a new assessment and marks prior unconsumed assessments invalidated or superseded. Never mutate an evaluated snapshot in place.

## State machine

- `draft -> evaluated`: the evaluator has a complete, internally consistent input snapshot.
- `evaluated -> approved_for_trip`: permitted only when every legal, vehicle, trailer, measured-load, provider, route-freshness and restriction-coverage gate is positively satisfied.
- `approved_for_trip -> consumed`: only inside the same database transaction that creates the trip and its successful pre-trip inspection.
- `evaluated -> rejected|expired|invalidated|superseded`
- `approved_for_trip -> expired|invalidated|superseded`
- Terminal states cannot be reopened. A new evaluation creates a new row.

The current closed provider/coverage gates mean no current assessment can transition to `approved_for_trip`. `evaluated` is never authorization.

## Atomic trip-start transaction

The existing `public.start_trip_with_inspection` currently validates task, driver, vehicle, registration evidence, documents and checklist, then creates the trip. It does not accept an assessment ID or bind measured weights and route evidence. A future version must:

1. Require an assessment ID and a client-generated idempotency key. Reject legacy calls that omit the assessment once this contract is enabled.
2. Authenticate with `auth.uid()`; validate active fleet membership and the existing role/linked-driver rules.
3. Lock records in one documented global order used by every writer: task -> driver -> vehicle -> trailer rows sorted by UUID -> assessment. Reconcile this order with `finish_trip` and all mutation paths before implementation; never introduce a reverse-order lock path.
4. Re-read task assignment, driver status/licence evidence, vehicle status/registration/profile, trailer combination and all evidence after locks are held.
5. Recompute the canonical current-input digest and compare it with the assessment snapshot digest. Recheck route and catalogue freshness independently. Reject if any input changed or any evidence is missing, expired, unverified or outside the approved scope.
6. Require `status = 'approved_for_trip'`, `expires_at > now()`, no prior consumption and exact fleet/task/driver/vehicle/trailer binding.
7. Validate the complete checklist. A failed checklist records the inspection/incident and creates no trip; it must not consume the assessment.
8. In the same transaction, conditionally consume the assessment, create the trip linked to assessment ID and snapshot digest, create the passed inspection, update task and vehicle status, and persist the idempotency result. Any error rolls back every write.
9. On retry with the same idempotency key, return the original trip result only to the same authorized actor and only if the stored request digest matches. A different request with the same key is rejected.

The conditional consume must affect exactly one row, e.g. an UPDATE guarded by ID, fleet, status and unconsumed state with `RETURNING`; zero rows means rejection. A unique constraint must prevent one assessment from linking to multiple trips.

## Concurrency and uniqueness

The repository already contains migration `20261114130000_enforce_single_active_trip_assignments.sql`, which preflights and creates partial unique indexes for one active trip per driver, vehicle and task. Preserve and test these constraints; do not add redundant indexes. The current `start_trip_with_inspection` also checks for both `planned` and `active` trips for a task, but the existing unique task index covers only `active`. Before changing this behavior, inspect all trip creation/status-transition paths and confirm whether `planned` trips are a valid concurrent state or whether the active-only invariant is intentional. Add or adjust database-enforced uniqueness only if the verified business invariant requires it, with a legacy-data preflight and rollback-only concurrency tests. The existing partial indexes make concurrent duplicate active trips fail safely, but they do not by themselves make route-assessment consumption idempotent or serialize mutations against trip start. Do not rely on client-side disabled buttons.

## Invalidation requirements

A material change to any of the following must invalidate all affected unconsumed assessments in the same transaction as the change, or be detected by mandatory digest revalidation at trip start (prefer both where safe):

- task assignment, fleet, origin or destination;
- driver identity, active status, licence class/evidence/expiry or legal compatibility decision;
- vehicle identity, registration verification/document, dimensions, permitted limits, status or profile;
- trailer identity/order, tractor-trailer compatibility evidence or configuration;
- measured gross/axle weights, units, source or measurement time;
- route geometry, route identity, provider, fetched time or recalculation;
- restriction catalogue version, restriction evidence, source validity, coverage or approval;
- provider licence/approval or routing algorithm/ruleset version.

A route detour or recalculation is a new assessment, not an update to the old geometry. Route freshness and restriction-catalogue freshness are separate clocks.

## Required verification before any implementation is considered complete

### SQL rollback-only integration
- Missing assessment ID; wrong fleet/task/driver/vehicle; wrong or reordered trailers.
- Each non-approved, terminal, expired, stale, invalidated, superseded and consumed state.
- Snapshot tampering and digest mismatch.
- Changed task/driver/vehicle/trailer/evidence/weight/route/provider/catalogue/ruleset after evaluation.
- Trailer count > 0 with no separately verified combination.
- Failed checklist does not consume; successful checklist consumes exactly once.
- Concurrent starts for one task and one vehicle; concurrent mutation vs start; idempotent retry and key reuse with a different payload.
- Verify all failure cases leave no partial trip, inspection, status update or consumed assessment.

### Real Auth HTTP integration
Use actual Supabase Auth-issued signed sessions and the actual RPC boundary. Cover owner, fleet_manager, dispatcher, safety_manager, linked assigned driver, unassigned driver, unrelated fleet member, revoked membership, invalid/expired token and forged user_metadata role claims. Do not treat transaction-local JWT claim tests as real Auth E2E.

### Operational gates
- Provider approval and licensing are independently verified.
- Current, licensed, authoritative restriction coverage is independently demonstrated for the declared geography and vehicle classes.
- Restriction source freshness and outage behavior fail closed.
- Legal licence-class and vehicle/trailer compatibility rules are verified against authoritative current sources and encoded as versioned decisions.
- Security review, least-privilege grants, advisors and CI all pass.

## Safe implementation sequence

1. Complete a read-only inventory of all trip creation and mutation paths, the existing active-trip partial unique indexes (driver/vehicle/task), whether planned trips require a separate invariant, trigger lock behavior, and current status values.
2. Design the schema and function replacement against that inventory; generate any migration using the repository's pinned Supabase CLI via `supabase migration new`, not a hand-invented migration filename.
3. Implement only on a dedicated draft branch/PR. No hosted schema changes.
4. Run SQL tests in rollback-only disposable PostgreSQL/Test CI and real Auth HTTP integration using dedicated Test fixtures. Never use Production for tests.
5. Review advisors, grants, RLS, lock ordering, deadlock behavior and rollback guarantees.
6. Keep the operational provider/coverage gate closed until independently approved. Do not deploy, merge or release as part of this work.

## Explicit non-goals

This contract does not choose a provider, import road restrictions, certify nationwide coverage, estimate axle loads, legalize an unverified trailer combination, create Auth users outside the Auth Admin API, or authorize a Production/Test schema mutation.


## Verified repository lock and status inventory (23 November 2026)

The following facts were verified by reading the candidate migrations and rollback-only SQL tests on PR #19's head. They are not a claim that any migration has been applied to a hosted database.

- `start_trip_with_inspection` locks task -> driver -> vehicle. It validates task status as `pending|assigned`, checks driver active/licence expiry, checks vehicle `available|assigned`, verifies vehicle document dates and registration evidence, rejects open safety incidents, then writes vehicle `on_trip`, an `active` trip, a passed inspection and task `in_progress` in one transaction.
- Failed pre-trip checklist writes a failed inspection and safety incident and returns NULL; it creates no trip and leaves the vehicle/task transition untouched.
- `finish_trip` reads trip parent IDs without a row lock, then locks task -> driver -> trip -> vehicle and revalidates the trip's task/driver IDs before completion.
- Task assignment trigger runs on task INSERT/assignment UPDATE and locks driver -> vehicle after the task row is being written. It checks active driver, nonexpired licence date, same-fleet assignment, non-demo vehicle and vehicle status `available|assigned`.
- Deferred constraint triggers enforce driver remains `active` while an active trip exists and vehicle remains `on_trip` exactly while an active trip exists. These guards also lock the driver or vehicle row at deferred-check time.
- Three partial unique indexes enforce at most one `active` trip per driver, vehicle and task. The trip-start RPC additionally rejects any existing `planned|active` trip for the task, but its unique task index is active-only. No separate planned-trip writer was established in this read-only review.
- The current trip-start RPC has no assessment ID, route geometry, measured gross/axle weight, trailer-combination ID or driver/vehicle licence-class decision input.

### Consequences for implementation

1. Preserve the existing task -> driver -> vehicle parent lock order. The new trailer rows must be locked in stable UUID order after vehicle; assessment lock must be placed consistently and must not introduce a cycle with any deferred trigger or writer.
2. `finish_trip` currently locks task -> driver -> trip -> vehicle, not task -> driver -> vehicle -> trip. A replacement trip-start/finish protocol must be reviewed as a pair; do not casually add a trip lock before vehicle or reverse that order.
3. Deferred driver/vehicle guards run at transaction end and participate in locking. Include them in deadlock tests; do not assume only explicit `FOR UPDATE` statements matter.
4. Keep the active-only unique indexes. Before adding a planned-trip uniqueness constraint, inventory all planned-trip creation, cancellation and transition paths, verify legacy rows and define exactly which statuses reserve a driver/vehicle/task.
5. Add two-session concurrency tests (not just sequential duplicate inserts) for same-task, same-driver and same-vehicle trip starts; concurrent task reassignment; driver deactivation; vehicle status changes; finish-vs-start; trailer/evidence mutation vs start; and assessment double-consumption. Run them only against disposable PostgreSQL/Test with rollback/cleanup guarantees.
6. Test failed inspection separately: it must create an auditable failed inspection/incident but must not consume a route assessment or create a trip. A subsequent corrected inspection must use a still-valid assessment only if its immutable snapshot still matches.



## Current application integration and CI boundary (23 November 2026)

A further read-only pass inspected `app/api/truck-route/route.js`, `app/tasks/page.js`, `.github/workflows/isolated-validation.yml`, `.github/workflows/build.yml`, `package.json`, and the rollback-only SQL runner.

- The route handler independently checks the provider-approval and restriction-coverage environment gates before HERE calls. It validates the saved vehicle profile, actual gross/axle weights, documents, special equipment, quota and the fleet restriction catalogue. It returns route geometry as section polylines and reports `scope: fleet_catalogue_only`; it does not persist a route assessment or return a durable assessment identifier.
- The task UI's `confirmPreTrip()` calls `start_trip_with_inspection` directly. It does not call the route handler, submit an assessment ID, or bind the trip to a route geometry/restriction snapshot. This is the exact integration seam that must change before a route can be a trip-start prerequisite.
- The current route endpoint is fail-closed while provider/coverage approvals are false, but the separate trip-start RPC can still start a trip without a route assessment. This contract must not be misread as proof that every trip is currently route-validated.
- `package.json` does not pin the Supabase CLI as a project dependency, and `supabase/config.toml` is absent at the reviewed base commit. The repository currently has no checked-in CLI project configuration from which to safely run `supabase migration new`; do not install an unpinned latest CLI or hand-create a timestamped migration as a substitute.
- The existing `isolated-validation.yml` workflow runs database integration only when all four dedicated Test secrets exist and checks the database URI against the Test project ref while explicitly rejecting Production. The SQL runner creates disposable Auth identities through Auth Admin API, runs each SQL fixture, and rolls back each fixture transaction; synthetic SQL JWT claim tests are explicitly not real Auth E2E.
- The workflow's `pull_request.branches` filter currently lists `main`, `feat/ptv-safe-integration-v1`, and `test/isolated-e2e-ci`, but not PR #23's base branch `fix/physical-clearance-routing-gate`. Its push filter does not include the docs branch either. Therefore the absence of CI runs for this documentation-only PR is explained by workflow trigger configuration, not by a passing validation. Do not claim CI passed.

### Safe implementation gate

Before a schema migration can be generated, establish a repository-pinned CLI/configuration path and prove it targets local/disposable Test only. Then inventory every trip-start caller and route recalculation path, design a paired start/finish lock protocol, and add a rollback-only migration test plus two-session concurrency tests. Do not add an assessment table or replace the RPC until those prerequisites are satisfied. Production remains untouched.


## CI trigger deployment boundary

The workflow branch-filter change in this PR is declarative only until the updated workflow file exists on the target branch. GitHub evaluates the `pull_request` workflow definition from the base branch, not from this PR's head. Therefore this PR cannot cause its own new trigger to execute, and the absence of a run is not a pass or a failure. The change enables subsequent pull requests targeting `fix/physical-clearance-routing-gate` after the workflow definition is present there. Do not merge this draft solely to obtain a CI run; keep it open until the normal review and integration sequence permits it.
