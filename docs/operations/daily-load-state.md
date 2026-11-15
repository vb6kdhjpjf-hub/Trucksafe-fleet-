# Daily load state — engineering contract

TruckSafe's daily work plan must keep one evolving load snapshot for the assigned truck/driver day, with an append-only operation ledger. Stops may load or unload cargo; the next route segment must use the latest accepted snapshot.

## Safety invariants

- Gross vehicle weight includes tare and cargo and must remain between the verified tare and registered gross limit.
- Every completed loading/unloading operation requires a measured resulting gross weight AND a measured resulting heaviest-axle load.
- Axle load is never estimated by distributing a gross-weight delta across axles.
- The measurement must identify a supported source (weighbridge ticket or certified onboard scale) and a non-empty measurement reference.
- Every operation carries an idempotency event ID and expected revision. Duplicate events and stale revisions are rejected.
- The database implementation must perform revision checking, event insertion, and snapshot update in one transaction while locking the daily plan row.
- A route segment is not eligible for a safety-ready status unless the current load and axle readings are verified and within limits.
- If the vehicle has no certified axle measurement capability at a stop, the system must request a weighbridge measurement or withhold route approval. It must not infer axle distribution.

## Delivery sequence

1. Domain rules and deterministic tests (this change).
2. Add fleet-scoped daily-plan, stop, and append-only load-event tables plus transactional RPC in the dedicated Test schema.
3. Test RLS, cross-fleet isolation, idempotency, revision races, and rollback behavior.
4. Integrate manager and driver screens, then require the verified current snapshot in each route request.
5. Only after review, consider production migration separately. No production schema or data is modified by this work.
