# Enterprise onboarding and data migration

**Status:** blueprint only; implementation has not started.

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
