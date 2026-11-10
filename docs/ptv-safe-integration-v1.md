# PTV safe integration branch

Status: isolated preparation only. This branch is based directly on the current `main` commit and is not connected to the active route handler.

## Scope added

- Pure PTV configuration gate. A key alone cannot enable provider calls.
- Pure PTV geocoding and routing request builders. They construct requests but do not perform network calls.
- Preliminary response safety assessment and GeoJSON-to-flexible-polyline adapter.
- Predefined vehicle-profile catalogue parser with explicit-region selection only.
- Truck vehicle profile validation and focused Node.js unit tests.
- Authenticated, server-side PTV Data API catalog diagnostic in Preview. It does not calculate routes or write to the database.

## Verified on 2026-11-10

- The Preview diagnostic successfully authenticated to PTV Data API and returned 22 predefined profiles, including 16 truck candidates.
- This confirms the Data API catalog request only. It does not verify a live Routing API request, Israel-specific restriction coverage, or route safety.
- PTV's official FAQ states that the Free Plan is for development/testing and integration only, not commercial/production rollout. The FAQ lists Routing API access in the Free Plan, with no additional transaction limit, but that does not grant production/commercial rights.
- PTV documentation says custom routing profiles are currently usable in Matrix Routing API and Route Optimization API V2, not directly in Routing API.
- The PTV catalog contains regional generic profiles. Do not treat Europe/IMEA/USA/Australia profiles as a verified Israel vehicle specification. Vehicle dimensions and legal weights must come from the actual vehicle registration and measurements.
- The Ministry of Transport request was resent to the alternate contact after the original address bounced. No reply was present in Gmail at the latest check on 2026-11-10.

## Deliberately not included

- No changes to `app/api/truck-route/route.js`.
- No PTV Routing API calls or route calculations.
- No PTV key exposure, credential logging, or browser-side credential use.
- No changes to Vercel Production, Supabase schema/data/RLS, billing, or Production deployment.
- No merge or pull request has been opened.
- No vehicle-profile migration has been applied.

## Required before integration

1. Obtain written PTV confirmation of commercial/production rights, applicable service plan, quotas/costs, and Routing API support for the intended Israel use case.
2. Verify the actual PTV Routing API response in a separately approved, minimal Preview-only test; validate the response schema, violation events, and geometry shape. Keep the API key server-side.
3. Confirm PTV road-data coverage and truck restriction quality for Israel, including height, weight, width, length, access, and time restrictions. Generic profile availability is not evidence of local road coverage.
4. Obtain authoritative Israeli bridge/underpass clearance and restriction data, including source authority, measurement date, direction/lane, uncertainty, and update process. Unverified third-party data remains candidate-only.
5. Resolve TruckSafe-to-PTV vehicle mapping. TruckSafe does not currently store verified empty vehicle weight separately from cargo/load weight; PTV's documented actual-weight model needs this split. Confirm axle-weight semantics before mapping.
6. Review geocoding precision and replace the current coarse bounding-box check with a trusted Israel boundary/road-access validation before routing.
7. Run `npm run test:ptv` in an isolated environment and inspect every result.
8. Integrate through a provider-neutral route adapter while preserving auth, tenant isolation, quota, input limits, and independent fleet restriction checks.
9. Keep routing disabled until all gates, tests, commercial rights, and local coverage checks pass.

## Safety note

The PTV adapter is experimental and must not be treated as proof that a route is safe. A clean provider response is only one input. TruckSafe must independently validate vehicle dimensions/weight, local restrictions, road geometry, and time windows. Missing or uncertain data must block route approval.

## Historical diagnostic note

An earlier temporary PTV catalog probe returned HTTP 401 before the credential configuration was corrected. That temporary probe endpoint was removed and its probe-token environment variable cleared. The authenticated Preview catalog diagnostic subsequently succeeded on 2026-11-10. The earlier 401 is historical and is not the current catalog-check result.
