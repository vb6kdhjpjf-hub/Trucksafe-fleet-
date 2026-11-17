# Live road-event contract (design only)

Status: inactive design artifact. No application endpoint, database table, subscription, source adapter, or alert has been enabled.

## Separation from existing fleet incidents

The existing `incidents` feature records incidents within an individual fleet. It is not a public, cross-fleet road-event feed. Do not expose that table to other fleets or repurpose it as a shared traffic feed. Road events require a separate trust boundary, retention policy, source provenance, and read authorization.

## Event taxonomy

Allowed operational categories for the first pilot:
- `crash`
- `road_hazard` (debris, stopped vehicle, animal, dangerous surface)
- `weather_hazard` (flooding, strong wind, visibility, fire)
- `roadworks`
- `lane_closure`
- `road_closure`
- `temporary_truck_restriction`
- `traffic_control` (officially published safe movement instruction)

Do not add police-presence, checkpoint, speed-trap, patrol, or enforcement-location event types. Where an official notice describes an enforcement-related road closure or traffic-control instruction, publish only the affected road impact and safe action.

## Canonical event envelope

Each event must validate against `road-event.schema.json`. The canonical payload includes:
- immutable event ID and event type;
- point or bounded road-segment geometry, with country and direction/lane metadata where known;
- observed, received, expiry, and last-confirmed timestamps;
- source class and source reference, separated from reporter identity;
- verification state and confidence as distinct concepts;
- severity and concise driver-safe instruction;
- lifecycle state and schema version.

Reporter/reviewer identity is never accepted from a client payload as authoritative. The server derives actor identity from a validated Supabase Auth session and the fleet membership/role gate. Public event reads must not expose actor identity, private fleet IDs, driver IDs, vehicle registrations, or raw trip traces.

## Lifecycle and publication rules

1. `reported`: received from a driver or dispatcher; unverified.
2. `corroborating`: deduplication and independent reports/source checks are in progress.
3. `verified`: authoritative or independently corroborated under a documented category-specific policy.
4. `expired`: expiry reached or source freshness exceeded.
5. `rejected`: invalid, abusive, duplicate, or unsupported.
6. `withdrawn`: retracted by source/moderator, with append-only audit history.

Only `verified` events may be presented as verified. `reported` and `corroborating` events, if later enabled for a pilot, must be visibly labelled provisional, geographically bounded, short-lived, rate-limited, and never treated as legal restriction evidence. Missing expiry, malformed geometry, stale confirmation, or conflicting high-impact reports fail closed: do not present the event as verified.

Events must not assert that a road is clear when no event is present. Expiry removes an event from active alert results but does not erase its audit history.

## Trust and source rules

- `official_authority`: only a source whose authority, scope, terms, update cadence, and data rights have been reviewed.
- `licensed_provider`: only under a contract permitting the intended commercial display, redistribution, caching, and retention.
- `fleet_dispatcher`: scoped to the submitting fleet unless a separately approved sharing arrangement exists.
- `driver_report`: unverified observation; one report is not proof.

An event source is not approved merely because it is publicly accessible. No source is approved by this contract. Source-specific coverage, latency, licence, and reliability must be measured before any live pilot.

## Truck relevance

Alert matching must use route direction, road segment, lane when known, event validity interval, route ETA, and the vehicle's verified dimensions and mass. If applicability is uncertain, show an uncertainty notice or suppress the alert according to severity policy; never convert uncertainty into a safe-route decision. A live report must never add, modify, or deactivate a row in `public.road_restrictions`.

## Security and privacy

- All report writes require a real authenticated session and server-side fleet membership/role resolution using the existing `resolveFleetApiAccess` pattern.
- Separate driver/dispatcher reporting, source ingestion, moderation, and legal-restriction verification permissions.
- Enforce per-user/device/fleet quotas, idempotency, duplicate clustering, abuse detection, and append-only moderation audit.
- Keep cross-fleet reads limited to approved public road-event fields; private fleet-origin reports remain private unless explicitly consented and reviewed.
- Minimize location precision and retention to what is necessary; obtain clear foreground-location consent and provide a visible off switch.
- Never log access tokens, exact driver GPS trails, or provider secrets.

## Safe implementation sequence

1. Add pure schema validation and lifecycle/unit tests using synthetic fixtures only.
2. Review the data model, source licensing, retention, and privacy before proposing any migration.
3. Build authenticated Test-only API/RLS integration using real signed Test Auth identities; do not use synthetic claims as proof of real Auth.
4. Add a read-only map overlay with synthetic events and explicit demo labels.
5. Only after separate approvals, integrate one approved source in a bounded pilot area with monitoring and a kill switch.

Release gates include security review, cross-fleet isolation, stale/duplicate/conflict tests, accessibility and driver-distraction review, source outage handling, and explicit approval for any paid provider, migration, or deployment.