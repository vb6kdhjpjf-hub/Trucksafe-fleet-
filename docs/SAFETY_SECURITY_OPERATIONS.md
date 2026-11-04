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
- Task status updates are manager/dispatcher-only; drivers use the trip RPC lifecycle.
- Driver identity/licence and vehicle compliance records can be created or changed only by owners/fleet managers; dispatchers can assign work but cannot change those safety-critical records.
- Incident creation requires a fleet membership, the authenticated reporter identity, and initial status `open`.
- The private membership helper functions use an empty search_path; privileged trip RPCs use explicit identity/assignment/role checks and an empty search_path.

## 4. GPS limitations
Browser geolocation is not guaranteed to run when a tab is backgrounded, the browser is closed, the device is locked, battery optimization suspends the app, or permission is revoked. A missing or stale point must never be interpreted as proof that a driver stopped, arrived, or is safe.

GPS coordinates and speed are client-reported telemetry and are not tamper-proof. Database constraints reject out-of-range coordinates, negative speeds and invalid headings, but these checks do not prove that the device is at the reported location.

The live dashboard/map use batched, RLS-preserving database reads. The map and history screens show at most 500 recent GPS points per trip. Trip distance reports use a Haversine estimate between saved GPS points (straight-line segments), not road distance or certified odometer data. Do not use them as sole evidence for legal, disciplinary, emergency or insurance decisions.

## 5. Truck routing limitations
The HERE routing provider is not configured in the current environment. The route API requires both an approved provider key and the explicit `TRUCK_ROUTING_ENABLED=true` switch. Do not enable it until server-side per-user/fleet rate limiting, usage budgets, route-restriction coverage and operational validation are implemented and tested. Fleet-entered road restriction records are not yet automatically incorporated into route calculations.

A successful provider response or a route with no notices is not a guarantee that every bridge, road restriction, time-window closure, work zone, weight limit or local rule has been considered. Verify current official information before departure and during the trip.

## 6. Operational and release controls
- Do not apply production migrations until a schema-only backup is successfully generated, reviewed and retained.
- Run the isolated PostgreSQL migration/lifecycle/RLS tests and application build against the exact PR head.
- Review the PR diff, migration, RLS policies, function grants, deployment commit and runtime health before release.
- Apply migrations and deploy production only after explicit release approval.
- Preserve the production Vercel preview/SSO protection. Do not bypass deployment quota or activate paid plans without approval.

## 7. Current known readiness gaps
- Production trip RPCs were observed using an obsolete helper reference; the proposed PR migration repairs them but has not been applied.
- The schema-only backup workflow currently reaches the Supabase pooler but fails password authentication; no backup artifact exists yet.
- Supabase Auth leaked-password protection is disabled (Security Advisor warning); enable only after explicit approval.
- Performance Advisor reports 16 unused-index candidates. Do not drop them without query-plan evidence and review.
- Vercel currently has no new preview deployment for the latest PR head due deployment quota/rate limits.
- The truck-routing provider key is not configured.
- Background GPS tracking and tamper-resistant telemetry are not implemented.

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
