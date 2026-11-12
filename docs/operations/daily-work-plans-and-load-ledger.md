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
