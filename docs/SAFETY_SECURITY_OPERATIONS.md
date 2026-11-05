# TruckSafe Fleet — Safety, Security & Operations

## 1. Purpose and safety boundary
TruckSafe Fleet supports fleet administration and safety workflows. It is not a certified vehicle inspection device, a substitute for a qualified safety officer, an official road authority, or a guarantee that a route is legal or safe.

Drivers and fleet operators remain responsible for physical inspections, valid licences and vehicle documents, load securing, legal dimensions/weights, signs, closures, police instructions and current road conditions.

## 2. Pre-trip lifecycle
1. A task must have a driver and vehicle assigned.
2. The assigned driver or an authorized fleet manager completes all seven checklist items.
3. Every item must be answered. A failed item requires a written defect description.
4. A failed inspection is retained, a high-severity incident is opened, and the vehicle is locked out from starting another trip while the incident remains open or under investigation.
5. A successful inspection and trip start are performed atomically.
6. Trip completion updates the trip, task and vehicle state atomically.
7. Recorded expired licence, test, insurance or registration dates are hard stops. Missing driver licence expiry or vehicle test/insurance/registration dates are hard stops; fleet management must enter and verify these dates before a trip can start.

## 3. Authorization model
The controls below describe the proposed PR migration and become effective in production only after that migration is separately reviewed and approved.
- Public client access uses the Supabase publishable/legacy anon key only; never place service-role or secret keys in browser code.
- Exposed public tables must retain RLS.
- Fleet membership is an authorization boundary. Client-side membership writes are disabled; membership changes require a future validated server-side invitation/administration flow.
- Direct trip and inspection writes are disabled for authenticated clients. Trip lifecycle writes must go through the validated RPCs.
- Task status updates are manager/dispatcher-only; drivers use the trip RPC lifecycle. Only the trip RPCs can set `in_progress` or `completed`; tasks cannot be deleted through the client, and assigned tasks require both a driver and a vehicle.
- Driver identity/licence and vehicle compliance records can be created or changed only by owners/fleet managers; dispatchers can assign work but cannot change those safety-critical records.
- Drivers can read only their own driver profile, assigned vehicles/tasks, own trips/GPS, and related incidents/maintenance. Dispatch, fleet management and safety roles retain the fleet-wide operational view; ordinary drivers cannot browse other members' records.
- Incident creation requires a fleet membership, the authenticated reporter identity, and initial status `open`.
- An incident cannot move to `resolved` or `closed` without non-empty treatment notes. The database stamps the resolver and time; reopening clears the previous resolution metadata, so the vehicle lockout cannot be released by a status-only update.
- The private membership helper functions use an empty search_path; privileged trip RPCs use explicit identity/assignment/role checks and an empty search_path.

## 4. GPS limitations
Browser geolocation is not guaranteed to run when a tab is backgrounded, the browser is closed, the device is locked, battery optimization suspends the app, or permission is revoked. A missing or stale point must never be interpreted as proof that a driver stopped, arrived, or is safe.

GPS coordinates and speed are client-reported telemetry and are not tamper-proof. Database constraints reject out-of-range coordinates, negative speeds and invalid headings, but these checks do not prove that the device is at the reported location.

The live dashboard/map use batched, RLS-preserving database reads. The map and history screens show at most 500 recent GPS points per trip. Trip distance reports use a Haversine estimate between saved GPS points (straight-line segments), not road distance or certified odometer data. Do not use them as sole evidence for legal, disciplinary, emergency or insurance decisions.

## 5. Truck routing limitations
The HERE routing provider is not configured in the current environment. The route API requires both an approved provider key and the explicit `TRUCK_ROUTING_ENABLED=true` switch. Do not enable it until server-side per-user/fleet rate limiting, usage budgets, route-restriction coverage and operational validation are implemented and tested. Fleet-entered road restriction records are not yet automatically incorporated into route calculations.

A successful provider response or a route with no notices is not a guarantee that every bridge, road restriction, time-window closure, work zone, weight limit or local rule has been considered. Verify current official information before departure and during the trip.

## 6. Operational and release controls
- Do not apply production migrations until a full data-inclusive database backup (roles, schema and data) is generated, encrypted, retained outside the repository, and its restore procedure is validated. A schema-only dump is useful for review but is not a complete backup.
- Run the isolated PostgreSQL migration/lifecycle/RLS tests and application build against the exact PR head.
- Review the PR diff, migration, RLS policies, function grants, deployment commit and runtime health before release.
- Apply migrations and deploy production only after explicit release approval.
- Preserve the production Vercel preview/SSO protection. Do not bypass deployment quota or activate paid plans without approval.


### 6.1 Full backup requirements (Free plan)
The current project is on Supabase Free, which does not include automatic daily database backups. Supabase recommends manual logical exports with the CLI.

A complete database backup must include all three logical components:
1. Custom roles: `supabase db dump --db-url="$SUPABASE_DB_URL" --file=roles.sql --role-only`
2. Schema: `supabase db dump --db-url="$SUPABASE_DB_URL" --file=schema.sql`
3. Data: `supabase db dump --db-url="$SUPABASE_DB_URL" --file=data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"`

Operational requirements:
- Run from a trusted workstation or controlled runner. Supply the database URL through a protected environment variable or secret manager; never paste it into chat, commit it, or print it in logs.
- Set restrictive file permissions before exporting (for example, `umask 077`). Encrypt the backup files before transferring or storing them off-device. Keep the decryption key separately from the backup.
- Never upload plaintext `data.sql`, roles, connection strings, or customer data as a GitHub Actions artifact.
- Supabase Storage object files are not included in a Postgres database dump; export and protect those objects separately if the project stores user files.
- Record file sizes and SHA-256 checksums. Keep at least one encrypted copy outside the repository.
- Validate restoration into a disposable local Supabase/Postgres environment before any production migration. A successful dump alone does not prove that restoration works.
- Do not treat the existing schema-only artifact as a full backup. Do not apply the production migration until the complete backup and restore validation are finished.

## 7. Current known readiness gaps
- Production trip RPCs were observed using an obsolete helper reference; the proposed PR migration repairs them but has not been applied.
- A schema-only backup artifact was successfully generated and inspected on 2026-11-05. It contains the current schema, policies, functions and triggers, but no table data; it is not sufficient for disaster recovery. The artifact expires after one day.
- Supabase Auth leaked-password protection is disabled (Security Advisor warning); enable only after explicit approval.
- Performance Advisor reports 15 unused-index candidates. Do not drop them without query-plan evidence and review.
- Vercel currently has no new preview deployment for the latest PR head due deployment quota/rate limits.
- The truck-routing provider key is not configured.
- Background GPS tracking and tamper-resistant telemetry are not implemented.
- Driver licence class/vehicle-category eligibility and the authenticity of manually entered document dates are not verified against Ministry of Transport or insurer systems.

## 8. Go-live checklist
- [ ] Successful schema-only backup artifact reviewed and stored safely.
- [ ] PR branch synchronized with main and exact-head CI passes.
- [ ] Full Supabase migration test passes against a faithful schema baseline.
- [ ] Security Advisor findings reviewed and accepted/remediated.
- [ ] Driver/manager acceptance tests completed on mobile and desktop.
- [ ] Expired/missing compliance data, failed inspections, incident lockout and repair/release workflow tested.
- [ ] GPS freshness and tracking limitations clearly communicated.
- [ ] Truck route provider and restriction coverage validated before enabling routing.
- [ ] Production migration and deployment separately approved and verified.
