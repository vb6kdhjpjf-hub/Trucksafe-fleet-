# Daily work plans and load ledger

TruckSafe now has a database design for one ordered daily plan per truck/driver, with multiple pickup and unloading stops. The plan holds a versioned current-load snapshot; each completed stop appends one measured event and advances the revision in a single database transaction.

## Important safety boundary

A cargo quantity entered by a dispatcher or driver is not itself a scale reading. The operation RPC requires a recent measured gross weight and measured heaviest-axle load, plus a measurement source and reference. It checks that the measured gross weight matches the expected load delta, the gross limit is respected, and the axle limit is respected. It never estimates axle distribution.

A stop can be completed only once. Event keys are unique per plan, stale revisions are rejected, and the plan row is locked while the event and snapshot are updated. This prevents duplicate taps and concurrent updates from applying the same load change twice.

## Access model

- Owner, fleet manager and dispatcher can create and manage plans and stops.
- Safety managers can read plan and event history.
- The assigned driver can read the plan and submit a measured completion for its stops.
- Load events are client read-only. Inserts are possible only through the SECURITY DEFINER RPC, which checks authenticated fleet membership and assignment.
- Composite fleet foreign keys prevent linking plans/stops/events across fleets.

## Current status

The migration and rollback-only integration test are on the isolated development branch. The CI test runner applies the migration only inside a transaction against the dedicated Test database and rolls it back. No production schema has been changed, no production data was copied, and no deployment was made.

The driver and dispatcher screens are not yet wired to these tables. That is the next integration stage, after the Test database migration and concurrency/security tests pass.

## Manager workflow and registration binding

The manager screen creates the plan and its ordered stops through the `create_daily_work_plan` RPC in one database transaction. If any stop or validation fails, the plan is not partially created.

The RPC reads the selected driver and vehicle from the same fleet and requires an active driver and an available/assigned vehicle. It also requires the vehicle's registration review status to be `verified`, and compares the submitted weight fields against the verified vehicle profile (`empty_weight_kg`, `gross_weight_kg`, and `weight_per_axle_kg`). A client cannot substitute its own limits. The UI therefore offers only vehicles with a verified registration and complete weight profile.

A manager records a recent initial weighbridge or certified onboard scale reading before creating the plan. The plan starts as `planned`; an authorized manager explicitly activates it. Drivers see only plans assigned to them through fleet-scoped RLS. At each active stop they submit the actual quantity, measured gross weight, measured heaviest-axle load, source, and measurement reference. The server checks the revision and all registered limits before completing the stop.

This feature is an operational ledger, not a substitute for official vehicle registration, certified scale calibration, load securing, driver judgement, or legally approved navigation. If vehicle registration data or axle limits are missing or unverified, planning is blocked rather than guessing.

Activation is also performed through a server-side RPC, not a direct browser update. It rechecks that the driver remains active, the vehicle remains available, and the registration approval and weight profile have not changed. Every later load event repeats the vehicle-profile check while locking the vehicle row. If approval is withdrawn or a registered weight changes, the operation fails closed until the vehicle is reviewed again.
