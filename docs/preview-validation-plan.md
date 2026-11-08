# Preview and release validation plan

Last reviewed: 2026-11-08

## Current gate

Do not enable a Vercel Preview deployment for this branch yet.

The connected Vercel Preview environment currently uses the connected Supabase project's environment configuration. The geospatial road-restriction migration is intentionally not applied to that project, so the current API query for the new columns must fail closed with HTTP 503. Enabling a Preview now would not provide a valid routing integration test and could encourage testing against production data.

Vercel Preview auto-deployments remain disabled. No Production deployment or merge is permitted as part of this plan.

## Safe validation already automated

GitHub Actions performs:
- Node.js security regression tests.
- Production dependency audit (fail on high/critical).
- Exact dependency installation.
- Full Next.js production build.
- Pre-trip SQL integration tests in an isolated PostgreSQL 17 service.
- Geospatial migration application and verification-trigger/constraint tests in that isolated database.

Unit coverage includes:
- HERE Flexible Polyline 2D/3D decoding.
- Route/restriction geofence matching.
- Vehicle dimensions and weight checks.
- Israeli time-zone windows and overnight windows.
- Missing/unverified provenance and incomplete restrictions.
- Explicit HERE parameter units (cm for dimensions; kg for weights).
- Conservative source-data candidate ingestion (point geometry only, no automatic verification).

## Preview prerequisites

Before creating a real Preview:
1. Create or select a dedicated non-production Supabase database/branch. Check and explicitly approve any hourly/monthly cost first.
2. Apply all migrations to that isolated database, including the geospatial restriction migration.
3. Configure Vercel Preview-only Supabase URL/publishable key and routing feature flags. Do not copy production service-role secrets into a browser-visible variable.
4. Use a HERE test key or an approved low-volume test plan. No live provider request should be sent until the owner confirms billing and terms.
5. Seed synthetic vehicles and synthetic road restrictions only. Never copy production personal or fleet data.
6. Test allowed routes, critical HERE notices, invalid/missing geometry, unverified nearby restrictions, verified conflicts, time-window crossings, and multi-fleet authorization.
7. Confirm logs contain no bearer tokens, API keys, addresses beyond operational need, or raw provider URLs containing secrets.

## Release gate

A release candidate requires:
- All GitHub Actions checks green on the exact PR head commit.
- Isolated database migration checks green.
- A dedicated Preview with isolated data and no production credentials.
- Human review of HERE notices and representative Israel truck routes.
- Documented source/licence/coverage approval for each external restriction feed.
- Explicit owner approval before enabling Preview, merging, applying production migrations, or deploying Production.
