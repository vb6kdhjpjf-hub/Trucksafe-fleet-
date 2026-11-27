# Planned-route adapter contract (draft)

Status: design and local validation only. No routing provider is selected, enabled, or called by this contract.

## Purpose

Provide a narrow boundary between a future, explicitly approved routing adapter and the road-event proximity calculation. A route supplied to the proximity function must be a planned route, not a GPS breadcrumb history, map viewport, or reconstructed path.

## Required route envelope

The adapter must normalize provider output into:

- `kind: "planned_route"`
- `coordinateOrder: "origin_to_destination"`
- `providerId`: stable provider identifier
- `routeId`: provider or adapter route identifier
- `fetchedAt`: ISO-8601 timestamp for when this route was retrieved
- `coordinates`: ordered WGS84 points, each within the supported Israel bounds

The current pure helper rejects missing provider/route identity, unknown direction, invalid timestamps, timestamps more than 30 seconds in the future, and routes older than 15 minutes. The 15-minute threshold is a conservative prototype guard, not a provider SLA or a guarantee that a route remains valid.

## Adapter responsibilities before emitting the envelope

1. Obtain the route only through a provider that has separately passed product, legal, licensing, security, cost, and coverage approval.
2. Preserve provider route order; never infer origin/destination direction from geometry.
3. Reject provider errors, partial responses, malformed polylines, unsupported coordinate reference systems, and routes outside the supported geography.
4. Preserve route identity and retrieval time. Refresh after material origin/destination changes or route recalculation.
5. Do not convert historical GPS tracks into planned routes.
6. Do not infer ETA from straight-line distance or from this proximity helper.
7. Keep truck profile constraints and legal road restrictions as a separate fail-closed routing gate. A route returned by a provider is not thereby proven truck-safe.

## Road-event matching behavior

- Event proximity is measured against the route geometry, not a straight line to the truck.
- The event's along-route position is meaningful only relative to the explicit origin-to-destination ordering.
- Ahead/behind is returned only when a valid route-progress distance is supplied.
- Ambiguous matches (for example, a self-crossing route or closely spaced parallel legs) are rejected rather than guessed.
- A route-corridor match is not proof that the event blocks the lane, applies to the vehicle, or remains current. Event verification, expiry, directionality, and vehicle applicability remain separate checks.
- No event found does not mean the road is clear.

## Release gates

Before any live provider integration: explicit provider selection and approval; license and permitted-use review; current coverage evidence; server-side secret handling; authenticated access; quota/cost controls; observability and outage behavior; tests against representative route fixtures; and a separate review of truck restriction compatibility.

No provider integration, API call, database write, migration, production configuration, deployment, or release is authorized by this document.
