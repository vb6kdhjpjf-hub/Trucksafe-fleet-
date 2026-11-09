# PTV Routing API integration readiness

Status: preparation only. This document does not enable routing and does not authorize provider requests.

## Verified API contract

- Routing endpoint: `GET https://api.myptv.com/routing/v1/routes`.
- Authenticate with the `ApiKey` request header. Do not put the key in the URL or log request URLs.
- Supply at least two WGS84 waypoints as latitude,longitude.
- The simple routing response is a root object with `distance` (meters), `travelTime` (seconds), and `violated` (boolean); it is not a HERE-style `routes[]` array.
- The response can additionally contain `events`. PTV documents them as chronologically ordered and each event has basic location/progress fields such as latitude, longitude, distanceFromStart and travelTimeFromStart, plus event-specific data.
- Request `POLYLINE`, `LEGS`, `MANEUVER_EVENTS`, `VIOLATION_EVENTS`, and `VIOLATION_EVENTS_POLYLINE` for safety-oriented evaluation. `VIOLATION_EVENTS_POLYLINE` automatically includes `VIOLATION_EVENTS`; `LEGS_POLYLINE` automatically includes `LEGS`.
- Request `ALTERNATIVE_ROUTES` only for a two-waypoint route; PTV documents up to three alternatives in addition to the optimal route and warns that additional calculations degrade performance.
- PTV's route-level and leg-level `violated` flags must be treated as unsafe. Violation events identify location and reason. A route must not be returned as safe if it is marked violated or if required event/geometry data is missing or malformed.
- Violation types include `PROHIBITED`, `RESTRICTED_ACCESS`, and `VEHICLE_PROPERTY`; the latter includes weight/height restrictions. PTV warns that restriction data and modeling vary worldwide.
- PTV's Geocoding & Places API provides `GET https://api.myptv.com/geocoding/v1/locations/by-text` with `searchText`; use the `ApiKey` header and `countryFilter=IL`. The response envelope is `{ locations: [...] }`; each record may include `referencePosition`, optional `roadAccessPosition`, `address.countryCodeIsoAlpha2`, and `formattedAddress`. Prefer road-access coordinates for routing and validate the country and coordinates before routing.
- Country filters use ISO 3166-1 alpha-2 codes. Geocoding records are ordered by matching score; score ranges from 0 to 100. Do not infer that a city-level match is a precise delivery entrance.
- PTV's published vehicle-profile example uses dimensions in centimeters and weights in kilograms. Fields include `height`, `width`, `length`, `totalPermittedWeight`, `axleWeight`, `numberOfAxles`, `emptyWeight`, and `loadWeight`. PTV defines actual weight as `emptyWeight + loadWeight`.
- PTV supports time-dependent truck restrictions. The selected departure time must be explicit for future trips; verify the exact `options[startTime]` request shape and timezone handling before implementation.

## Vehicle profile mapping notes

TruckSafe currently stores height, width, length, permitted gross weight, axle count, trailer count, and an axle-load field, plus a trip-time actual total weight. It does not currently store a separately verified empty vehicle weight and cargo/load weight. Do not silently invent that split or treat axle-load values as equivalent without checking PTV's exact field semantics. The vehicle profile schema must be reconciled before PTV requests are enabled.

## Existing TruckSafe constraints

- The current route handler is HERE-specific: HERE geocoding, HERE query format, HERE route sections/actions, and HERE notice semantics.
- TruckSafe independently checks fleet-entered road restrictions and fails closed when any relevant restriction cannot be verified.
- PTV integration must preserve authentication, fleet membership, saved vehicle profile validation, actual-weight validation, per-user route quota, bounded input, no-store responses, and the independent fleet-restriction check.
- PTV must remain behind separate explicit gates. The presence of `PTV_API_KEY` must never enable requests by itself.
- Do not reuse HERE approval flags or HERE credentials for PTV.

## Work required before enabling PTV

1. Confirm the exact PTV Vehicle schema and units for height, width, length, gross permitted weight, actual weight, axle count, and axle load. Do not assume HERE field names or unit suffixes transfer.
2. Confirm the exact response schema for polyline encoding/format, legs, maneuver events, violation events, violation-event geometry, alternatives, and warnings. The public quick-start confirms the root response and violation/event behavior but does not provide enough geometry detail to safely normalize route shape.
3. Retrieve the actual predefined vehicle-profile list from `GET https://api.myptv.com/data/v1/vehicle-profiles/predefined` using the PTV key only as a server-side header. Do not assume the standard Routing API catalogue contains an IMEA truck profile: the published standard profile documentation describes regional predefined profiles and warns about American-vs-non-American mismatches, while IMEA-specific OSM profiles belong to the separate OSM API and are not interchangeable. Confirm the exact supported standard profile and baseline attributes for Israel from the live catalogue and PTV support before choosing. Then confirm map-data coverage for Israel with real-world checks on known restricted roads. Do not call this endpoint until test API usage has been explicitly approved.
4. Use a dedicated PTV geocoding flow or coordinates. Do not keep the HERE geocoder in the PTV path unless a separately approved, rotated HERE credential is available.
5. Implement a provider adapter that maps PTV results into the exact internal route shape only after schema verification.
6. Add unit tests for request serialization, response normalization, missing/malformed geometry, violations, alternatives, and fail-closed behavior.
7. Run automated tests in GitHub Actions. Real provider testing must be limited, explicitly approved, and isolated to Preview.
8. Do not enable the feature, merge, or deploy to Production until all tests and Israel coverage validation pass and the user explicitly approves.

## Billing and safety guardrails

- Keep `TRUCK_ROUTING_ENABLED=false` until a separate approval.
- Keep `TRUCK_ROUTING_PROVIDER` unchanged until the adapter and tests are ready.
- Keep `PTV_PROVIDER_USAGE_APPROVED=false` and `PTV_FREE_PLAN_CONFIRMED=false` until the account's actual free-tier terms and request quota have been confirmed.
- PTV documents regional vehicle-profile families, including IMEA profiles for the Middle East. The exact identifier and vehicle defaults must be read from the Data API, not inferred from naming conventions.
- PTV's free subscription is intended for testing/integration rather than commercial/productive operation. API rate limits apply; verify the account's usage monitor before any test batch.
- Never print, copy, or log `PTV_API_KEY`.
- No card, upgrade, paid subscription, Production environment change, merge, or deployment without explicit approval.
