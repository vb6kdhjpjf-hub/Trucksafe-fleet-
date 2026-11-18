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
