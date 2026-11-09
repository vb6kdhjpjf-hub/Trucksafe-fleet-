# PTV Routing API integration readiness

Status: preparation only. This document does not enable routing and does not authorize provider requests.

## Verified API contract

- Routing endpoint: `GET https://api.myptv.com/routing/v1/routes`.
- Authenticate with the `apiKey` request header. Do not put the key in the URL or log request URLs.
- Supply at least two WGS84 waypoints as latitude,longitude.
- PTV's Geocoding & Places API provides `GET https://api.myptv.com/geocoding/v1/locations/by-text` with `searchText`; use the `apiKey` header and `countryFilter=IL`, then validate the returned country code and coordinate bounds before routing. Do not pass Israeli address text to HERE geocoding in the PTV-only path.
- The API supports vehicle parameters and routing options. Use the `EUR_TRAILER_TRUCK` profile only after verifying that it is suitable for the target region; the API documentation says regional profile choice matters.
- Request `POLYLINE`, `VIOLATION_EVENTS`, and `VIOLATION_EVENTS_POLYLINE` for safety-oriented evaluation. The latter includes the former.
- Request `ALTERNATIVE_ROUTES` only for a two-waypoint route; PTV documents up to three alternatives in addition to the optimal route.
- PTV's `violated` flag can be true when a prohibited road must be used. Violation events describe the reason and location. A route must not be returned as safe if it is marked violated or if required event/geometry data is missing or malformed.
- Violation reasons can include `VEHICLE_PROPERTY`, which covers restrictions such as weight or height, as well as `PROHIBITED`, `RESTRICTED_ACCESS`, and other classes. PTV warns that road-restriction coverage and modeling vary by region.
- PTV considers the date and time of travel when calculating routes and automatically considers vehicle-prohibited roads valid at that date/time. For a future departure, send `options[startTime]` in RFC 3339 format; do not combine it with `options[arrivalTime]`.

## Vehicle profile mapping notes

PTV's published predefined-profile example uses dimensions in centimeters and weights in kilograms. It exposes fields including `height`, `width`, `length`, `totalPermittedWeight`, `axleWeight`, and `numberOfAxles`. PTV defines actual vehicle weight as `emptyWeight + loadWeight`.

TruckSafe currently stores height, width, length, permitted gross weight, axle count, trailer count, and an axle-load field, plus a trip-time actual total weight. It does not currently store a separately verified empty vehicle weight and cargo/load weight. Do not silently invent that split or treat axle-load values as equivalent without checking PTV's exact field semantics. The vehicle profile schema must be reconciled before PTV requests are enabled.

## Existing TruckSafe constraints

- The current route handler is HERE-specific: HERE geocoding, HERE query format, HERE route sections/actions, and HERE notice semantics.
- TruckSafe independently checks fleet-entered road restrictions and fails closed when any relevant restriction cannot be verified.
- PTV integration must preserve authentication, fleet membership, saved vehicle profile validation, actual-weight validation, per-user route quota, bounded input, no-store responses, and the independent fleet-restriction check.
- PTV must remain behind separate explicit gates. The presence of `PTV_API_KEY` must never enable requests by itself.
- Do not reuse HERE approval flags or HERE credentials for PTV.

## Work required before enabling PTV

1. Confirm the exact PTV Vehicle schema and units for height, width, length, gross permitted weight, actual weight, axle count, and axle load. Do not assume HERE field names or unit suffixes transfer.
2. Confirm the route response schema for route polyline, legs, maneuver events, violation events, violation-event geometry, alternatives, warnings, and time-dependent restrictions.
3. Confirm the appropriate regional profile and map-data coverage for Israel, including real-world checks on known restricted roads.
4. Use a dedicated PTV geocoding flow or coordinates. Do not keep the HERE geocoder in the PTV path unless a separately approved, rotated HERE credential is available.
5. Implement a provider adapter that maps PTV results into the exact internal route shape only after schema verification.
6. Add unit tests for request serialization, response normalization, missing/malformed geometry, violations, alternatives, and fail-closed behavior.
7. Run automated tests in GitHub Actions. Real provider testing must be limited, explicitly approved, and isolated to Preview.
8. Do not enable the feature, merge, or deploy to Production until all tests and Israel coverage validation pass and the user explicitly approves.

## Billing and safety guardrails

- Keep `TRUCK_ROUTING_ENABLED=false` until a separate approval.
- Keep `TRUCK_ROUTING_PROVIDER` unchanged until the adapter and tests are ready.
- Keep `PTV_PROVIDER_USAGE_APPROVED=false` and `PTV_FREE_PLAN_CONFIRMED=false` until the account's actual free-tier terms and request quota have been confirmed.
- PTV's current FAQ says no payment details are needed to activate the free subscription, includes one API key, and explicitly limits free subscription use to testing/integration rather than commercial/productive operation. The FAQ currently lists the Routing API Free Plan as having no additional transaction limit, but API rate limits still apply and the subscription can return quota-exceeded errors; verify the account's usage monitor before any test batch.
- Never print, copy, or log `PTV_API_KEY`.
- No card, upgrade, paid subscription, Production environment change, merge, or deployment without explicit approval.
