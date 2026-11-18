# Restriction Quarantine Storage Architecture

Date: 2026-11-17
Branch: `fix/physical-clearance-routing-gate`
Status: architecture proposal only — no schema or database changes

## Decision

Keep the current local, private-filesystem quarantine workflow as the only implemented intake path for now. Do not add an online importer or database staging tables until source licensing, authority, coverage, and security requirements are approved.

The existing tools stage an immutable JSON envelope in a private directory, hash the payload, produce a separate evidence assessment report, and verify a separate human-review event. They explicitly keep routing approval false and do not write to Supabase. This is the correct safety boundary for discovery-stage sources.

## Why not store candidates in public.road_restrictions?

`public.road_restrictions` is part of the operational restriction catalogue. Putting unverified source payloads there would mix discovery data with operational records and increase the risk of accidental consumption by route evaluation. A candidate is not a restriction and must not be represented as one.

The current public table's verified-height constraints protect a narrow integrity boundary; they do not provide a complete source registry, immutable raw archive, reviewer workflow, licence approval or ingestion audit system. Do not overload those columns to represent source intake state.

## Future database design — only after separate approval

If online multi-user intake becomes necessary, use a dedicated non-exposed schema such as `restriction_intake`, with no Data API exposure and no grants to `anon` or `authenticated`. Prefer a server-side worker with narrowly scoped credentials and explicit authorization. Do not use a SECURITY DEFINER function as a shortcut.

Proposed logical entities:

### `restriction_intake.sources`
One row per publisher/dataset/layer and versioned source contract:
- immutable source UUID and canonical publisher identity;
- dataset/service/layer identifiers and schema version;
- authority/asset-owner status and evidence references;
- licence and commercial/derived-routing permission evidence;
- declared coverage, exclusions, cadence and freshness policy;
- source lifecycle state (discovery, candidate, approved-for-ingestion, suspended, retired);
- approver, approval timestamp and decision rationale.

A portal is not the source if the layer is published by another organization. Store both portal and actual publisher where distinct.

### `restriction_intake.captures`
One immutable row per retrieval:
- source UUID and source revision;
- retrieved-at timestamp and publisher-declared updated-at timestamp;
- request parameters with secrets removed;
- response status/content type/byte count;
- SHA-256 of exact raw bytes;
- parser and normalizer versions;
- immutable object-storage reference to the raw bytes;
- capture status and failure details.

Never store raw credentials or unrestricted payloads in logs. Object storage must be private, encrypted, size-limited, retention-controlled and inaccessible to browser clients. A hash alone is not a substitute for retaining the evidence bytes where retention is legally permitted.

### `restriction_intake.candidates`
One normalized candidate per source record/revision:
- source and capture foreign keys;
- stable source-record ID and source revision;
- original values/units and normalized values/units;
- geometry plus explicit CRS;
- road segment, direction, lane and vehicle applicability;
- candidate restriction type and validity window;
- validation result and blocking errors;
- candidate content hash;
- state limited to unreviewed, needs-evidence, rejected, accepted-for-pilot or withdrawn.

Candidates must not have a field named or interpreted as route approval. Acceptance for a pilot is not production authorization.

### `restriction_intake.evidence`
Evidence references attached to a candidate:
- evidence category, issuing authority/publisher and URL/document reference;
- document/content hash and capture timestamp;
- evidence effective date and expiry/recheck date;
- lane/direction/vehicle applicability;
- reviewer notes and conflict links.

Private evidence files remain in private object storage. Never expose sensitive survey documents through public buckets or public URLs.

### `restriction_intake.review_events`
Append-only human decision ledger:
- candidate hash and evidence dossier hash;
- reviewer identity from authenticated server-side identity, not caller-supplied text;
- review timestamp, decision, notes and evidence references;
- prior event hash and current event hash for tamper-evident chaining.

The database must reject UPDATE/DELETE for ordinary application roles. Corrections are new events that supersede earlier decisions. A text field claiming a reviewer name is not proof of reviewer identity.

## Security and isolation requirements

- Keep the schema out of Supabase exposed schemas and disable Data API exposure for it.
- Grant no direct table access to `anon` or `authenticated`; all access through a narrowly scoped server-side service boundary.
- If RLS is enabled as defense in depth, do not assume RLS alone hides a table from the Data API; exposure and grants must also be checked.
- No service-role/secret key in browser bundles, `NEXT_PUBLIC_*` variables, repository files, candidate payloads or logs.
- Enforce tenant/fleet scoping for any future user-facing review UI; authentication alone is not authorization.
- Separate importer, reviewer and operational approver permissions. Importer cannot approve their own evidence.
- Require immutable captures, idempotency keys, append-only audit history, bounded payload sizes, rate limits and malware/content-type checks for uploaded evidence.
- Retain a complete withdrawal/suspension trail. Never delete evidence needed to explain a previously made route decision, subject to approved retention policy.
- Keep all source data outside route evaluation until a separate promotion process explicitly creates a validated operational restriction record.

## Promotion boundary

There must be no automatic SQL trigger, background job or direct table mapping from a candidate to `public.road_restrictions`.

A future promotion service must independently verify:
1. approved source and permitted commercial/derived use;
2. source coverage and currentness;
3. candidate and evidence hashes;
4. restriction-specific technical completeness;
5. independent reviewer decision and separation of duties;
6. absence of unresolved conflicts or withdrawals;
7. an explicit, separately recorded operational approval.

Promotion must create a new operational record with complete provenance and audit linkage. It must not silently mutate a prior verified record. Changes to the restriction, geometry, lane, direction, evidence or applicability must invalidate verification until re-reviewed.

## Acceptance tests required before implementation

- Non-exposed schema cannot be read via anon/authenticated Data API.
- No direct grants to browser roles; server-only boundary enforces tenant scope.
- Importer cannot approve own candidate; reviewer identity is taken from authenticated context.
- Raw capture is immutable, hash-verifiable, size-limited and idempotent.
- Duplicate, changed, deleted and withdrawn source records are reconciled without treating missing records as unrestricted.
- Candidate rows cannot be consumed by route evaluation.
- Review events are append-only and tamper-evident.
- No candidate is promoted when source authority, licence, coverage, freshness, evidence or applicability is unknown.
- Promotion is explicit, audited, reversible by suspension and separately authorized.
- All tests use synthetic fixtures and rollback-only database tests.

## Current implementation status

Implemented: private local quarantine staging, SHA-256 payload envelope, separate evidence assessment report, human-review event verification, private-directory and no-follow file checks, and tests for malformed input, symlinks, file-size limits, private permissions, immutable output and explicit unapproved status.

Not implemented: online intake API, database quarantine schema, object-storage workflow, multi-user reviewer UI, or promotion service.

No database schema/data was changed. Supabase Production and Test were not modified for this architecture note. PR #19 remains OPEN and DRAFT; no merge, deployment, preview or provider activation is authorized.
