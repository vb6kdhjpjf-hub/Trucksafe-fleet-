# Driver licence verification and vehicle compatibility — design

**Status:** design only; not an executable legal decision or database migration.  
**Reviewed:** 18 November 2026  
**Scope:** Israeli driver-licence evidence, vehicle classification, and assignment-time compatibility.

## Current Test-schema findings

Read-only inspection of the dedicated Supabase Test project found:

- `public.drivers` stores one free-text `license_class` and one `license_expires_at` date per driver. It does not preserve separate class entitlements, issue dates, evidence, or a verification history.
- `public.vehicles` stores routing dimensions and weights, axle count, trailer count, body type, empty weight, and registration-document verification fields. These are useful vehicle facts, but they do not encode all legal vehicle classifications or special entitlement evidence.
- No dedicated driver-licence evidence/history table or trailer-entity table was found in the inspected public schema.
- The private `vehicle-registrations` Storage bucket accepts PDF/JPEG/PNG/WebP up to 8 MiB. Its current policies restrict read/upload/delete to fleet owners and managers and require a fleet/vehicle UUID path.
- Driver and vehicle profile writes are manager-only under the inspected RLS policies. Driver self-view is restricted to the linked user; vehicle self-view is tied to assignment/task relationships.

These observations are from the dedicated Test project only. Production was not queried or changed.

## Safety principles

1. A free-text class label is not proof of a legal entitlement.
2. Missing, stale, ambiguous, or unverified evidence must produce `manual_review` or a fail-closed assignment result, never an inferred approval.
3. Preserve the source document, original issue date, renewal/upgrade history, and the identity/time/note of the reviewer. Do not overwrite history when a licence is renewed or a new class is added.
4. Keep driver eligibility separate from road/route restrictions. A legally eligible driver does not make a route safe for a particular vehicle.
5. Do not automate recently announced regulatory exceptions until the original Official Gazette text and all required vehicle-registration annotations/authority approvals are verified.
6. Do not treat secondary reporting or a Ministry press release as a substitute for the operative Gazette text.
7. Do not claim that this design is a legal opinion. Final legal rules require review by a qualified Israeli transport-law professional and authoritative source validation.

## Proposed data model (not yet implemented)

### Driver licence records

Use a separate row per driver and licence class, scoped to the same fleet:

- identity: `id`, `fleet_id`, `driver_id`, `license_class`
- dates: `issued_at`, `expires_at`, optional `superseded_at`
- evidence: private `document_path`, upload timestamp, document checksum, source/issuing authority
- review: `verification_status` (`pending`, `verified`, `rejected`), reviewer user id, verified timestamp, mandatory review note
- legal context: entitlement/legacy notes and the rule/source version used for review

Enforce fleet consistency with composite foreign keys where supported by the existing schema pattern. Keep a separate append-only review-event history for rejections, corrections, renewals, and re-verification; do not rely solely on mutable status fields.

### Vehicle and trailer facts

The existing vehicle profile already carries several useful measurements. Before adding columns, map each required fact to its authoritative registration source and distinguish:
- legal registration category and vehicle use/type;
- maximum permitted gross weight, tare/empty weight, permitted payload, and axle configuration;
- propulsion type and zero-emission evidence, where relevant;
- passenger capacity and special vehicle classifications, where relevant;
- each trailer as its own registered object, including its class, gross weight, axle count, dimensions, and registration evidence;
- registration annotations and explicit Licensing Authority approvals.

A trailer count alone is not enough to evaluate trailer combinations or class-specific entitlements. Do not infer trailer permissions from the tractor unit's licence category.

### Decision record

For each driver + vehicle (+ trailer combination) assignment evaluation, store or emit an auditable decision:

- outcome: `allowed`, `denied`, or `manual_review`
- stable reason codes, not only free text
- rule-set version and source references
- timestamp and reviewer/automation identity
- immutable snapshot of the facts used in the decision

Unknown or conflicting inputs must result in `manual_review`. Do not collapse unknown into denied in the audit record, even if assignment is blocked operationally.

## Decision workflow

1. Confirm the driver is active and the relevant licence record is current.
2. Confirm the relevant class has verified evidence and a preserved issue date.
3. Confirm vehicle and every trailer classification and registration evidence are current and verified.
4. Apply only rules whose operative legal text and effective date have been checked against the Official Gazette.
5. For exceptions, require every condition and supporting registration annotation/authority approval; otherwise return `manual_review`.
6. Re-evaluate at assignment save and again at the server-side trip-start boundary. UI checks are advisory only.
7. Record the rule version, input snapshot, and reason codes. Re-evaluate when any material driver, vehicle, trailer, or rule input changes.

## Current product behaviour and gap

The current product's active-driver and expiry checks are useful baseline controls, and trip-start has server-side checks for active driver, licence expiry, vehicle legal-document dates, and verified vehicle-registration evidence. The current free-text `license_class` field is not sufficient for automatic class-to-vehicle matching. Until the data model and primary legal sources are ready, the UI and assignment flow must continue to require manual class/combination verification and must not display an automatic legal-compatibility approval.

## Preconditions before implementation

- Obtain and archive the exact Official Gazette publication and verify the operative wording, effective date, transitional provisions, and amendments.
- Have the rule matrix reviewed by an Israeli transport-law specialist.
- Confirm required document types, retention periods, privacy/access controls, and reviewer roles.
- Design the schema against the current migration history and RLS conventions; do not assume the proposed field names are already present.
- Add rollback-only Test integration coverage for cross-fleet isolation, evidence lifecycle, renewals, trailer combinations, missing/ambiguous inputs, and every decision outcome.
- Verify all authorization paths with real authenticated sessions. Do not use fake JWT claims as real Auth E2E.
- Keep Production untouched until a separately approved release process.

## Explicit non-goals

This design does not certify any driver, vehicle, trailer, road, bridge, or route. It does not enable automated legal approval, does not import national restriction data, and does not authorize deployment or merge.


## Access-control design review — 18 November 2026

A second read-only review of the dedicated Test project's current policies confirms the following implementation constraints:

- Driver records are readable by fleet owners, fleet managers, dispatchers, and safety managers; a linked driver can read their own driver row. Driver insert, update, and delete are limited to fleet owners and fleet managers.
- Vehicle registration evidence is stored in a private bucket. Its current read, upload, and delete policies are limited to fleet owners and fleet managers and require a two-segment `fleet_id/vehicle_id` object path.
- Task visibility is restricted to fleet operational roles and the driver linked to the assigned task. These task policies are not an appropriate shortcut for exposing licence documents.
- The Test project's current security advisor reports two signed-in-callable SECURITY DEFINER RPCs: `start_trip_with_inspection` and `finish_trip`. These are existing trip lifecycle endpoints and must be reviewed as intentional privileged entry points; do not revoke or weaken them without a separate call-path and real-Auth review.

### Required controls for a future driver-licence evidence feature

1. Use a dedicated **private** Storage bucket; do not reuse the vehicle-registration bucket or any public bucket.
2. Scope every object path to fleet, driver, and immutable evidence-record identifiers. Validate UUID path segments before casting them in policies.
3. Allow document read, upload, and deletion only to the fleet roles explicitly responsible for licence verification. A driver's ability to view their own driver profile must not automatically grant access to the underlying document.
4. Prefer short-lived signed URLs generated only after a server-side authorization check. Never persist public URLs or expose service-role credentials.
5. Keep evidence metadata and append-only review events in separate relational records. A document replacement must not overwrite prior verification history.
6. Enable RLS and grant only the table privileges required by the application. Since Supabase's Data API exposure defaults changed in 2026, explicitly review Data API exposure and SQL grants rather than assuming a new `public` table is automatically exposed.
7. Test manager access, unrelated-fleet denial, driver self-access denial to manager-only evidence, invalid path denial, and signed-URL authorization with real Auth sessions.

### Verification boundary

This review inspected policies in the dedicated Test project only. It made no schema, Storage, Auth, or data changes. The proposed bucket, tables, policies, signed-URL flow, and review-event model remain design work until the full access matrix and rollback-only integration tests are ready.


## Implementation contract — access matrix, lifecycle, and acceptance gates

This section turns the design into an implementation contract. It remains documentation only; it creates no tables, buckets, policies, or application routes.

### Role-to-capability matrix

| Capability | Owner | Fleet manager | Safety manager | Dispatcher | Linked driver | Other fleet / unassigned |
|---|---:|---:|---:|---:|---:|---:|
| Read ordinary driver profile | Yes | Yes | Yes | Yes | Own profile only | No |
| Read licence metadata (not document) | Yes | Yes | Yes | No by default | Own metadata only | No |
| Upload licence evidence | Yes | Yes | Yes | No | No | No |
| Read/download licence evidence | Yes | Yes | Yes | No | No | No |
| Mark evidence verified/rejected | Yes | Yes | Yes | No | No | No |
| Append a review event | Yes | Yes | Yes | No | No | No |
| Directly delete evidence/history | No | No | No | No | No | No |
| Manage trailer master records | Yes | Yes | Read | Read | Assigned-combination summary only | No |
| Approve legal compatibility | Qualified manual reviewer only | Qualified manual reviewer only | Qualified manual reviewer only | No | No | No |

The exact reviewer roles must be confirmed against the actual role enum and product ownership before migration. Membership must be resolved from current database membership rows, not user-editable metadata or stale client state. Ambiguous membership or role must fail closed.

### Evidence lifecycle

1. A manager/reviewer creates a pending evidence record and uploads the source document to the dedicated private bucket.
2. The server validates authenticated identity, active fleet membership, role, driver-to-fleet relationship, evidence-record ID, MIME type, file size, and object path. Client-supplied fleet/driver IDs are never sufficient authorization.
3. Metadata records object path, cryptographic checksum, upload time, source/issuer, document dates, and uploader. No public URL is stored.
4. A reviewer records a separate immutable review event with outcome, reviewer, timestamp, mandatory reason/note, and source/rule version.
5. Renewal or replacement creates a new evidence record and review event. The prior record is superseded, not overwritten or physically deleted.
6. Document viewing requires a fresh server-side authorization check. A short-lived signed URL is created only after that check and is never written to logs, analytics, or persistent records.
7. Retention, legal hold, and erasure rules must be approved before production use. Append-only history does not override applicable privacy or deletion law.

### Trailer entity and combination model

A trailer must be an independently identified, fleet-scoped registered asset, not a boolean or count on a tractor. The future model must account for:
- trailer identity, registration number, registration class/use, make/model, and active/maintenance/retired status;
- permitted gross weight, tare, payload, axle count, dimensions, and applicable coupling/combination characteristics;
- current registration evidence, verification status, reviewer, dates, and source;
- tractor-to-trailer combination records with effective dates and order/position for multi-trailer combinations where legally relevant;
- assignment/trip snapshots so later trailer edits cannot rewrite the historical combination used by a completed trip.

First map fields to the actual registration document and authoritative rules; do not assume every field is legally required for every trailer type. A trailer with missing, stale, unverified, or conflicting facts remains unavailable for automatic compatibility approval. The existing trailer-count routing gate must continue blocking routing until the full combination is verified.

### Decision and invalidation rules

- Persist outcome (allowed, denied, manual_review), stable reason codes, ruleset version, effective date, source references, input snapshot hash, and decision time.
- manual_review blocks assignment/trip start operationally; it is not an allowed state.
- Any change to driver class/expiry/evidence, vehicle classification/weights, trailer facts/evidence, combination membership, or active ruleset invalidates the previous compatibility result.
- Re-check eligibility at assignment save and again in the server-side trip-start transaction. UI-only checks never authorize a trip.
- The assignment guard proposed in PR #19 checks eligibility at assignment write time; it does not prevent a later driver/vehicle status change from making the assignment stale. Trip-start revalidation remains mandatory.

### Required automated test matrix before schema implementation is accepted

**Relational integrity**
- Driver, vehicle, trailer, evidence, reviewer, and combination IDs cannot cross fleet boundaries.
- A combination cannot reference a retired, missing, or foreign-fleet trailer.
- Effective-date ranges cannot create simultaneously active contradictory combinations.
- Replacing evidence creates a new immutable record and preserves prior audit history.

**RLS and Data API**
- RLS is enabled before any Data API grant is added.
- Explicit grants expose only required tables and operations; no broad anon grants.
- Owner/manager/safety reviewer can read permitted evidence; dispatcher, linked driver, unrelated fleet, and unassigned user cannot read document objects or mint signed URLs.
- A linked driver may read only the approved metadata projection for their own record; profile access does not imply evidence access.
- UPDATE policies include both USING and WITH CHECK; cross-fleet reassignment is rejected.
- Views use security_invoker=true where supported, or remain outside exposed schemas with access explicitly revoked.
- Storage policies separately test download, upload, update, and delete; upsert is disabled unless all required privileges are intentionally granted.
- Public URLs and service-role keys are absent from browser bundles, responses, and logs.

**Real Auth and HTTP**
- Repeat the matrix with real signed Test Auth sessions for owner, fleet manager, safety manager, dispatcher, linked driver, unrelated-fleet manager, unassigned user, and invalid/expired token.
- Test actual server HTTP endpoints and signed-URL minting, not only helpers or mocked claims.
- Verify role demotion and membership removal at sensitive endpoints, accounting for token freshness and server-side membership lookups.
- Verify cleanup of all uniquely marked synthetic Auth users, fleets, files, and records after success and failure.

**Lifecycle and regression**
- Pending → verified/rejected → superseded/renewed transitions are auditable and cannot be silently overwritten.
- Expiry at Israel local midnight is tested at the date boundary.
- Every supported trailer-combination boundary is tested; unsupported or unknown combinations fail closed.
- Trip start re-checks the exact driver + tractor + trailer combination and current evidence.
- Existing trip lifecycle RPCs are regression-tested before any permission or implementation changes.

### Delivery sequence and release gates

1. **Source gate:** obtain the original Official Gazette file 12573, page 408; verify operative text, effective date, transitional rules, and later amendments. Obtain qualified Israeli transport-law review. Until then, all new 15 November 2026 exceptions remain manual review.
2. **Schema gate:** map the existing schema and migrations; create a proposed migration only after the access matrix, retention policy, and source-backed field map are approved.
3. **Test gate:** add rollback-only SQL tests and real-Auth HTTP tests against the dedicated Test project. No persistent Test migration and no Production writes.
4. **Security gate:** verify RLS, explicit grants/Data API exposure, Storage policies, signed URLs, and run Supabase Security Advisors. Review the two existing trip lifecycle SECURITY DEFINER RPCs separately without weakening their current behavior.
5. **Product gate:** implement reviewer workflow and trailer management with clear manual-review states; preserve routing fail-closed behavior for unverified combinations.
6. **Release gate:** separate explicit approval is required for any Production migration, merge, or deployment. None is authorized by this design.

### Supabase platform and documentation checks

The Supabase changelog confirms that, from 30 October 2026, newly created public tables on existing projects are no longer automatically exposed through the Data API; explicit grants, RLS, and policies must be reviewed together. Supabase Storage documentation confirms private buckets enforce RLS for downloads and allow limited-time signed URLs; public buckets bypass access control for object retrieval.

References:
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/security/access-control

The dedicated Test project's Security Advisor was re-run on 18 November 2026. It still reports exactly two signed-in-callable SECURITY DEFINER functions: public.start_trip_with_inspection and public.finish_trip. They are existing trip lifecycle entry points and remain unchanged pending a dedicated review of their authorization contract and all callers. No schema, Storage, Auth, or data changes were made by this review.

## Verified Test role boundary and required permission delta — 18 November 2026

A focused read-only inspection of the current Test project's membership constraint, driver policies, and Storage policies clarifies an important distinction between the **proposed target matrix above** and permissions that exist today:

| Existing capability | Owner | Fleet manager | Safety manager | Dispatcher | Linked driver |
|---|---:|---:|---:|---:|---:|
| Read driver profile | Yes | Yes | Yes | Yes | Own row only |
| Insert/update/delete driver profile | Yes | Yes | No | No | No |
| Read vehicle-registration documents | Yes | Yes | No | No | No |
| Upload vehicle-registration documents | Yes | Yes | No | No | No |
| Delete vehicle-registration documents | Yes, subject to reference guard | Yes, subject to reference guard | No | No | No |

The fleet_members.role CHECK constraint currently accepts exactly: owner, fleet_manager, dispatcher, safety_manager, and driver. The private.has_fleet_role helper checks the current fleet_members row for auth.uid(); it does not authorize from user-editable profile metadata.

**Implementation consequence:** the target matrix above intentionally proposes Safety Manager as a licence-evidence reviewer, but this is **not a permission already granted by the current schema**. A future implementation must make an explicit, separately tested authorization change before Safety Managers can read, upload, or review licence evidence. Do not silently broaden the existing vehicle-registration bucket policies as a shortcut. The dedicated licence-evidence bucket must have its own reviewed policies and tests.

The Test project had no persistent fleet-membership rows at the time of this read-only check (the role list query returned no rows); accepted role values were verified from the table CHECK constraint, and actual access policy expressions were inspected separately. This check made no database, Storage, Auth, or data changes.

### Mandatory authorization delta tests

Before enabling the proposed Safety Manager reviewer capability, prove with real signed Test Auth sessions that:
- Owner and Fleet Manager can perform only the intended licence-evidence operations within their own fleet.
- Safety Manager can perform only the explicitly approved evidence-review operations; cannot edit driver identity/profile fields or manage unrelated vehicle-registration files unless separately authorized.
- Dispatcher can see only the approved operational projection and cannot read, upload, delete, or mint a signed URL for licence evidence.
- Linked Driver can see only their own approved metadata projection and cannot read the underlying document or mint a signed URL.
- Other-fleet and unassigned users are denied at both Storage and server HTTP boundaries.
- Demotion/removal from membership takes effect at the sensitive server-side authorization boundary, not merely after a client refresh.

Until these tests pass, implement no UI affordance that implies Safety Manager or any other role already has licence-document access.

## Application authorization boundary review — 18 November 2026

Read-only inspection of the current application code on `fix/physical-clearance-routing-gate` confirms:

- `resolveFleetWorkspace` first verifies the authenticated user through Supabase Auth `getUser()`, requires the returned user ID to match the caller, and then resolves membership from `fleet_members`. It fails closed for no membership, multiple memberships, lookup errors, or unsupported roles. The application does not rely on a user-editable role claim for workspace selection.
- The Drivers page exposes create, edit, and status-change controls only to `owner` and `fleet_manager`. Safety managers and dispatchers can read the ordinary driver list under the existing database policy but cannot use those UI mutation paths.
- The driver form currently stores one free-text `license_class` and one expiry date. The UI explicitly warns that these are registration-only values and that document verification and legal driver/vehicle/trailer compatibility are not automated.
- The Special Equipment page also limits its management and review UI to `owner` and `fleet_manager`; it obtains signed document URLs only after the workspace role check. The existing database RLS and RPC policies remain the actual security boundary; client-side checks are not authorization by themselves.
- Task assignment UI permits `owner`, `fleet_manager`, and `dispatcher` to manage assignments. Its local driver eligibility check only tests active status and a valid non-expired date; the database assignment trigger and trip-start checks remain authoritative. Neither layer currently validates licence class against the vehicle or trailer combination.

### Consequence for the licence-evidence feature

The proposed matrix's Safety Manager upload/read/review capability is not implemented in the current application or Storage policies. It must not be exposed by adding UI controls alone or by broadening the existing vehicle-registration bucket. Implement it only after the dedicated private bucket, server-side authorization path, append-only review history, retention/privacy rules, and real-Auth role tests are designed together. Until then, the application must continue to describe licence class as unverified and require manual verification before dispatch.

This was a source-code review only. No application code, database schema, Storage policy, Auth user, or production resource was changed.
