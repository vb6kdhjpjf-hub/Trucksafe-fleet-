# PTV safe integration branch

Status: isolated preparation only. This branch is based directly on the current `main` commit and is not connected to the active route handler.

## Scope added

- Pure PTV configuration gate. A key alone cannot enable provider calls.
- Pure PTV geocoding and routing request builders. They construct requests but do not perform network calls.
- Preliminary response safety assessment and GeoJSON-to-flexible-polyline adapter.
- Predefined vehicle-profile catalogue parser with explicit-region selection only.
- Truck vehicle profile validation and focused Node.js unit tests.

## Deliberately not included

- No changes to `app/api/truck-route/route.js`.
- No PTV network calls, API-key reads, or credential logging.
- No changes to Vercel, Supabase, production environment variables, billing, or deployment.
- No merge or pull request has been opened.
- No vehicle-profile migration has been applied.

## Required before integration

1. Verify the actual PTV standard Routing API profile catalogue and confirm an appropriate truck profile for Israel.
2. Confirm live PTV response fields, violation events, and geometry shape with a small explicitly approved test. The API key must remain server-side.
3. Confirm Israel restriction-data coverage against known height-, weight-, access-, and time-restricted roads.
4. Resolve TruckSafe-to-PTV vehicle mapping. TruckSafe does not currently store verified empty vehicle weight separately from cargo/load weight; PTV's documented actual-weight model needs this split. Confirm axle-weight semantics before mapping.
5. Review geocoding precision and replace the current coarse bounding-box check with a trusted Israel boundary/road-access validation before routing.
6. Run `npm run test:ptv` in an isolated environment and inspect every result.
7. Integrate through a provider-neutral route adapter while preserving auth, tenant isolation, quota, input limits, and independent fleet restriction checks.
8. Keep routing disabled until all gates, tests, and coverage checks pass.

## Safety note

The PTV adapter is experimental and must not be treated as proof that a route is safe. A clean provider response is only one input. TruckSafe must independently validate vehicle dimensions/weight, local restrictions, road geometry, and time windows. Missing or uncertain data must block route approval.


Temporary PTV catalog probe: completed one authentication check and removed the probe endpoint. The configured PTV credential was rejected with HTTP 401; no route calls were made. The probe token environment variable is cleared.
