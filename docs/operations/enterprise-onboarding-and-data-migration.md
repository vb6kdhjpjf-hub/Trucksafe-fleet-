# Enterprise onboarding and data migration

**Status:** CSV parsing, field mapping/row validation, and a browser-only CSV preview with read-only fleet identity preflight are implemented and CI-tested. XLSX support, private staging, durable jobs, server-side dry-run/commit APIs and customer records are not implemented yet.

## Product outcome
An established fleet can adopt TruckSafe without manually recreating drivers, vehicles, customers or operational records. CSV/Excel is the first path; named system connectors follow only after API access, authorization and field semantics are verified.

## Migration Center
1. Upload Excel/CSV; inspect sheets, headers, row counts, encoding and errors.
2. Suggest mappings; allow edits and reusable mapping profiles.
3. Validate rows, duplicates, warnings and unresolved relationships.
4. Preview exact create/update/skip/conflict/reject counts.
5. Dry-run with zero operational writes.
6. Require authorized fleet owner/manager approval.
7. Import bounded, dependency-ordered batches with durable progress and idempotent retries.
8. Reconcile source/target totals and provide a downloadable row-level report.
9. Retry failed batches safely; document compensation, never blindly delete records subsequently used or edited.

## Phased scope
- **A — master data:** vehicles, drivers, customers, delivery locations; preserve fleet-scoped external source IDs for safe re-import.
- **B — operational setup:** open tasks, future schedules, planned stops and shipments after master relationships resolve.
- **C — selected history:** maintenance, incidents, trips and delivery history with provenance; distinguish imported history from native events.
- **Later — named connectors:** specific ERP/TMS/customer systems after API access, customer authorization, field semantics, rate limits, licensing, security and support ownership are verified.
- Sensitive attachments require a separate private-storage migration path, validation, access controls and retention rules.

## Integrity and safety
Every import belongs to exactly one verified fleet. Enforce tenant scope in API and database writes. Never match on display name alone; ambiguous matches require human review. Preview updates; no silent overwrite. Preserve source system/ID, import job, source row/sheet, source timestamp and transformation version. Validate relationships; use bounded server-side batches and stable idempotency keys. Dry-run writes nothing. Keep personal data/document contents out of logs.

Never execute spreadsheet formulas or macros. Validate size, row count, encoding, dates/time zones, units, precision, identifiers and duplicate keys. Spreadsheet values do not prove truck safety or driver eligibility: missing/questionable dimensions, gross/tare/axle weights, licence data, registration approval, bridge clearance, restriction provenance, GPS or delivery proof remain unverified and require existing verification workflows.

## Implemented foundation
- `lib/enterprise-import-csv.mjs`: bounded CSV parser (20 MB, 100,000 data rows, 100 columns, 10,000 characters per field), BOM handling, comma/semicolon/tab detection, quoted values, strict malformed-quote handling and row-shape errors.
- `lib/enterprise-import-mapping.mjs`: Hebrew/English header suggestions and initial drivers/vehicles field validation. Ambiguous mappings are not auto-selected; status/date/number values are not guessed; duplicate identifiers inside the file require review; imported vehicle dimensions and weights are explicitly flagged for document verification.
- `lib/enterprise-import-conflicts.mjs`: normalized fleet-identity conflict detection for driver license numbers and vehicle registration numbers. The `/imports` page reads existing identifiers through the signed-in client in bounded 1,000-row pages, limited to 100,000 records; incomplete/failed preflight blocks the full preview. This remains a read-only browser check, not an authoritative server-side import constraint.
- Automated tests are included in CI. These functions only parse and validate in memory; the existing-identity check reads fleet-scoped records but does not upload files or write operational records.

## Target architecture
- Browser upload, inspection, mapping, preview and progress; no service-role credentials.
- Server API verifies signed session, exact fleet membership, role and request size.
- Versioned parser/normalizer; CSV first, vetted XLSX parser after dependency/security review.
- Durable import-job ledger, source checksum, mapping version, counts, cursor and idempotency keys.
- Private staging; no operational writes during preview.
- Server-side fleet-scoped commit engine with dependency ordering and conflict policy.
- Reconciliation report and safe metrics; logs contain safe IDs/error codes only.

Review schema, RLS, composite fleet foreign keys and Auth before implementation. Never bypass Supabase Auth or expose service-role secrets.

## Enterprise adoption package
Provide a labelled synthetic demo fleet, guided tour, role-based onboarding, customer-approved migration rehearsal, mapping/reconciliation report, data ownership/export/retention/backup documentation, security/access-control evidence, incident/escalation process, clear support expectations and measurable pilot outcomes. Do not claim universal one-click integrations, certifications, national routing coverage or enterprise readiness without evidence.

## Acceptance criteria
1. Private, bounded CSV/XLSX upload safely rejects malformed content.
2. Mapping profiles, validation and preview work.
3. Dry run causes zero operational writes.
4. Every row gets a deterministic outcome and reason.
5. Duplicate matching/external IDs are fleet-scoped.
6. Re-import creates no duplicates.
7. Unauthorized roles/cross-fleet references fail API and database tests.
8. Partial failures resume without duplicates or missing rows.
9. Source totals reconcile; report is downloadable.
10. Tests use synthetic Test data; Production cutover needs separate explicit approval.

## Delivery order
Inspect schema/policies; define canonical import model; implement/test CSV parser; review vetted XLSX dependency; build mapping/validation/dry-run; add job ledger/private staging; implement Phase A server-side import; add reconciliation/resume/audit; run synthetic E2E, security and performance tests; then plan a customer-specific migration rehearsal.

## Server-side import implementation contract (design only)

The next implementation step is a durable, private staging layer. This section records the security and recovery contract before any schema or operational write path is introduced; it does not mean staging or commit APIs exist today.

### Trust boundary
- The browser may upload a bounded source file and request preview/commit, but it never decides the actor, fleet, role, row outcome, or target record ID.
- Every request must validate the Supabase session with `auth.getUser()` and resolve current fleet membership from database-backed membership records. Reject missing, revoked, ambiguous, or non-manager membership; never authorize from user-editable metadata or a client-supplied role.
- Service-role credentials, if required for private staging, may exist only in server runtime configuration. They must never use a `NEXT_PUBLIC_` variable, enter browser bundles, logs, URLs, or error responses. A service-role write is permitted only after the route independently validates the signed user and current fleet role.
- Staging payloads and source files must live in a private schema/bucket with no public or anonymous access. Do not expose raw staged rows through the public Data API. Revoke default grants explicitly and verify schema exposure settings; RLS is additional protection, not a substitute for a private trust boundary.
- Keep the current preview read-only until the complete staging/authorization path and its tests are available.

### Durable job and row model
- Each job records an immutable source checksum, source filename (display-only), source size, fleet ID, initiating user ID, parser/mapping version, normalized mapping fingerprint, created/updated timestamps, revision, expiry, and aggregate counts.
- Each staged row records job ID, source row number, a stable row key, normalized payload, validation outcome, warning/error codes, and eventual target ID. Raw personal data must not be copied into application logs.
- Enforce fleet/job ownership with composite foreign keys or equivalent database constraints. Never accept a fleet ID, target ID, or actor ID as authoritative merely because it appears in a browser payload.
- The first write-enabled phase is insert-only for drivers and vehicles. Updates, merges, customer records, and operational history remain disabled until field-level conflict rules and explicit approval are designed.
- Imported vehicle measurements and driver licence details remain unverified evidence. They must not set registration verification, licence verification, or route-readiness flags.

### State, idempotency, and recovery
- Use a documented state machine: `uploaded → validating → ready → committing → completed`, with explicit `failed`, `partial_failed`, `cancelled`, and `expired` terminal/recovery states as appropriate. Reject invalid transitions and stale revisions.
- A fleet-scoped idempotency key is bound to the source checksum and mapping fingerprint. Reusing it with different content is a conflict, not a second import.
- Commit claims a job with a database lock/lease and processes bounded, dependency-ordered batches. Each batch has a stable idempotency key and persisted outcome before the next batch begins.
- A retry must resume from persisted row/batch outcomes; it must not create duplicate drivers or vehicles. If a batch outcome is uncertain, reconcile by the stable source identity before retrying.
- Never perform a blind compensating delete. Record row-level success, skip, conflict, and failure outcomes; preserve records that may already have been referenced or edited.
- Re-check current membership and role at commit time, not only at upload/preview time. Revoked or demoted users cannot continue a staged job.

### Required verification before enabling writes
- Signed live Test Auth coverage for owner/manager success, dispatcher/driver denial, ambiguous membership denial, revoked membership, role demotion, forged metadata, and cross-fleet job access.
- Test-only SQL coverage for RLS/grants, tenant-scoped foreign keys, state transitions, idempotency collisions, concurrent commit claims, batch retry, and expiry. All fixtures must roll back or be removed by guaranteed cleanup.
- Fault-injection tests for interrupted upload, interrupted validation, process termination during a batch, duplicate retry, and uncertain commit response.
- A reconciliation report must compare source rows with ready/review/rejected and committed/skipped/conflicted/failed outcomes. No green “complete” state unless counts reconcile.
- No migration is applied to either Production or Test as part of this design note. Schema changes must first be reviewed as additive migration files on the Draft branch and validated only against the dedicated Test project.
