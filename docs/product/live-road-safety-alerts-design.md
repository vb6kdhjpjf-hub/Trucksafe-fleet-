# Live road-safety alerts — product and security design

Status: proposal only. This document does not enable a live feed, provider, deployment, database write, or user-facing alert.

## Product decision

A Waze-like live alert layer is technically feasible as a separate capability from truck route calculation. It should improve driver awareness without implying that crowdsourced reports are authoritative or that a road is safe when no alert exists.

The feature must be split into two classes:

1. **Operational safety events** — suitable for driver alerts after validation: crashes, stopped vehicles, debris, dangerous road conditions, flooding, fire, weather hazards, road works, lane closures, road closures, temporary height/weight/width restrictions, diversions, and official traffic-control instructions.
2. **Law-enforcement presence** — do not publish precise live positions of police patrols, checkpoints, speed traps, or enforcement activity, and do not provide alerts designed to help drivers evade enforcement. If an official authority publishes a road closure, lane closure, or traffic-control instruction involving police, display the road impact and required safe action, not a tactical police-location marker.

## Feasibility and dependencies

The user experience is feasible: map markers, spoken warnings, distance-to-event alerts, event details, report confirmation, and an incident timeline. Reliable real-time coverage is the hard part, not rendering the map.

Potential inputs, subject to source and licensing review:
- Official authority feeds for closures, works, emergency events, weather, and traffic control.
- Licensed traffic-data providers with explicit rights for display, redistribution, retention, and commercial use.
- Driver-submitted reports for immediate hazards, with abuse controls and confidence labels.
- Fleet-dispatcher reports for a company's own vehicles and operations.

Do not assume that a public GIS portal, an OSM-derived listing, or a map provider's ordinary routing API constitutes a complete authoritative live feed. No source is approved by this proposal.

## Event lifecycle and trust model

Every event should have a stable event ID and type; affected point or road segment; direction and lane when known; observed, received, expiry, and last-confirmed timestamps; source class and provenance; confidence and verification status as separate fields; severity and safe instruction; and an append-only moderation history.

Suggested states: reported, corroborating, verified, expired, rejected, withdrawn.

A driver report is an unverified observation, not a fact. A provisional hazard notice may be shown briefly only after anti-abuse and plausibility checks; it must never create or remove a legal truck restriction. High-impact events should require independent corroboration or an authoritative source before being labelled verified.

Expiry must be automatic and conservative. Events without a valid expiry or current confirmation must not remain live indefinitely. Contradictory reports should lower confidence and trigger review rather than silently choosing one.

## Driver experience

- Voice-first, brief alerts with configurable volume and quiet hours; no requirement to touch the screen while moving.
- Alert only when relevant to vehicle direction, road segment, route corridor, and estimated arrival time.
- Suppress duplicates and stale events; use distance/time thresholds and severity-based prioritization.
- Clearly distinguish official/verified, corroborated, and unverified reports.
- Never state that a road is clear merely because no report exists.
- Allow a driver to confirm, dismiss, or report an event only when safely stopped or through hands-free interaction.
- Keep navigation and alerts available independently; loss of the alert feed must not make the route engine appear safer or more certain.

## Truck-specific safety integration

Alerts must be evaluated against the saved, verified truck profile and current trip: vehicle height, width, length, gross weight, axle configuration/load where supported; direction and lane applicability; effective start/end times and local time zone; route progress and estimated arrival.

An event with incomplete dimensions, uncertain lane/direction, stale timing, or unsupported restriction type must be labelled unresolved and must not be treated as clearance evidence. Legal restrictions remain subject to the existing fail-closed restriction gate and independent verification process.

## Security, privacy, and abuse prevention

- Authenticate every write/report and resolve fleet membership server-side using the established resolveFleetApiAccess pattern; never trust a client-supplied reporter or reviewer ID.
- Separate driver reports, dispatcher reports, source ingestion, moderation, and legal-restriction approval permissions.
- Rate-limit per authenticated user/device/fleet; apply duplicate clustering, spam detection, replay protection, and audit logging.
- Do not expose private fleet locations, driver identities, vehicle registration data, or trip histories to other fleets.
- Minimize location retention; request foreground location only while the user enables the feature or an active trip requires it. Document consent, purpose, retention, and deletion.
- Do not place secret provider keys in the browser or logs.
- Treat event text and external feed payloads as untrusted input; validate schemas, lengths, coordinates, URLs, and timestamps.

## Proposed architecture (not implemented)

1. **Adapters** — one isolated adapter per approved official/licensed source; each records source terms, update cadence, coverage, and outage behavior.
2. **Ingestion quarantine** — preserve raw payload and hash, validate provenance/schema, normalize to a canonical event, and reject malformed or out-of-area data.
3. **Event service** — server-side authenticated writes, deduplication, confidence calculation, expiry, and append-only moderation history.
4. **Read API / subscription** — authenticated, fleet-safe read path with bounded geographic/time queries; use polling initially or a supported realtime channel only after authorization and load tests.
5. **Client alert engine** — local route relevance, deduplication, spoken alert throttling, and graceful offline behavior.
6. **Operations** — source freshness dashboards, feed lag, false-positive/withdrawal rates, moderation queue, abuse signals, and kill switch per source.

Start with a read-only pilot for a small, approved geographic area and a small set of hazard categories. Do not call it nationwide or real-time until measured source coverage, latency, uptime, and licensing have been independently established.

## Release gates

Before any live pilot: approved source contracts/licences and coverage map; documented event taxonomy and expiry policy; authenticated role model and real signed-session Test integration; RLS and cross-fleet isolation tests; anti-spam, spoofing, replay, stale-event, and conflicting-report tests; location-consent and retention review; voice/UI distraction review; operational monitoring, moderation and emergency disable switch; and explicit user approval for any external provider, paid service, database migration, or deployment.

Current repository status: existing API routes use resolveFleetApiAccess and bearer-token validation. On 2026-11-17, the PR-triggered validation run passed app/safety tests, build, concurrent smoke tests, and isolated Test database rollback tests. The same-head push run also passed real signed-session Auth integration against the dedicated Test project, including role and membership checks over a local HTTP server. These tests validate the existing Auth path, not a live road-event endpoint. A separate pure lifecycle-policy helper and synthetic tests have since been added; they are not wired to an API, database, source adapter, or map feed. No live road events are ingested or published. Existing provider and restriction-coverage gates remain unchanged.