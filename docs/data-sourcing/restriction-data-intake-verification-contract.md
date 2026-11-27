# Restriction Data Intake and Verification Contract

Date: 2026-11-17
Branch: `fix/physical-clearance-routing-gate`
Status: design contract only — no operational source approved

## Purpose and safety boundary

Define a controlled path from an external road/bridge information source to a candidate restriction record and, only after independent evidence review, to a verified record. This document does not authorize importing data, contacting authorities, changing a database, enabling a routing provider, or approving any road as safe.

The system must fail closed: missing, stale, conflicting, incomplete or untraceable information is unresolved. Absence of a restriction record is never proof that a road is unrestricted.

## Required lifecycle

1. **Source registration (administrative, not operational).** Record the publisher, legal authority/asset-owner relationship, canonical dataset/service URL, licence and permitted use, geographic coverage, known exclusions, update cadence, publication timestamp semantics, contact/escalation path, schema/version, and retrieval method. A portal or aggregator is not automatically the publisher or competent authority for every layer.
2. **Immutable raw capture (quarantine).** Preserve the original payload/file, retrieval timestamp, publisher-declared update timestamp, request parameters, response metadata, content hash, parser version and source identifier. Keep credentials out of snapshots and logs. Never overwrite an earlier capture.
3. **Schema and provenance validation.** Reject malformed coordinates, unsupported CRS, ambiguous units, missing identifiers, invalid dates, unknown enum values, incomplete geometries, duplicate/conflicting identifiers and records with no traceable source. Do not infer absent fields.
4. **Normalization to a candidate.** Convert units and coordinate systems only through explicit, tested transformations. Preserve original values and units alongside normalized values. Map direction, lane and road-segment identity only when the source explicitly supports that mapping; otherwise mark unresolved.
5. **Independent evidence review.** A qualified reviewer checks the source against current competent-authority/asset-owner records and the required physical/signage evidence. The person who imported a record must not be its sole verifier. Record reviewer identity, timestamp, evidence URLs/documents, decision and rationale.
6. **Verification and activation gate.** Only records satisfying every restriction-type-specific evidence rule may be marked verified. A database constraint is a final integrity barrier, not a substitute for human/authority validation. Activation requires a separate, explicit operational approval and coverage statement.
7. **Continuous revalidation and withdrawal.** Recheck on publisher updates and before the freshness deadline; detect deletions, changed geometry, changed values and withdrawn notices. Expired, conflicting or unconfirmed records become unresolved/disabled for routing, with full audit history retained.

## Minimum source registry fields

- Stable source ID; publisher and competent-authority/asset-owner role.
- Canonical URL, dataset/service/layer identifier and schema version.
- Licence, commercial-use permission, redistribution permission and derived-routing permission, each explicitly evidenced.
- Geographic coverage polygon/description, coverage date, known gaps and exclusions.
- Publication/update timestamp definition, observed retrieval timestamp, expected cadence and maximum permitted staleness.
- Stable source-record identifier and source revision/version where available.
- Parser/normalizer version and content hash for each immutable capture.
- Source status: `discovery_only`, `candidate_only`, `approved_for_ingestion`, `suspended`, or `retired`.
- Approval evidence, approver identity and review timestamp.

Unknown licence, unclear authority, unknown coverage, or no reliable update mechanism means the source remains discovery/candidate-only.

## Restriction record evidence contract

Every candidate must retain the raw source reference and a traceable road/asset identity. Geometry must identify the affected road segment and, where relevant, carriageway, direction and lane. Point-only approximations must not be silently treated as complete segment geometry.

Restriction-specific evidence:

- **Height:** structure identity; road segment; direction and lane; physical measurement and date; method, surveyor, accuracy and supporting survey document; coverage of both sides, lane center, left/right edges and hanging installations; passage-center measurement when required; posted clearance status and value separately from measured physical clearance. Use the most restrictive independently verified applicable limit.
- **Gross weight / axle load:** exact applicable gross/axle or axle-group limit, vehicle configuration applicability, direction/lane scope, authority/source evidence and effective dates. An overall gross-weight value cannot stand in for axle limits.
- **Width / length:** exact limit, applicable vehicle/combination definition, direction/lane scope, evidence and effective dates.
- **Time-window / temporary closure:** explicit local timezone, complete start/end dates and times, recurrence semantics, effective period, publication/update source and withdrawal/expiry behavior.
- **Other or unknown types:** unresolved/manual review until a dedicated evidence and enforcement contract exists.

Do not convert a posted sign value into a measured physical clearance, or vice versa. Contradictory sources are a conflict requiring review, not a reason to choose the more permissive value.

## Freshness, conflicts and fail-closed behavior

- Freshness is evaluated from the source's last successful authoritative check, not merely from the date a record was imported.
- A source update that cannot be parsed or reconciled must suspend affected records rather than preserve an old value as current.
- A missing feed, failed fetch, empty response, deleted feature, null limit, unknown unit, uncertain lane/direction, expired validity window or unresolved conflict must not be interpreted as unrestricted.
- Keep a bounded, documented freshness policy per source and restriction type. The current application verification check uses a 30-day maximum; this is a conservative software gate, not proof that every source is safe to check only monthly.
- Revalidation must consider source-wide withdrawals and coverage changes, not only records returned in the latest incremental update.

## Operational controls and audit

- Separate roles: source administrator, importer, evidence reviewer and operational approver.
- Least-privilege credentials; server-side secret storage only; no service-role or provider key in client code, repository, raw snapshots or logs.
- Idempotent imports keyed by source ID + stable source record ID + source revision/content hash.
- Stage all imports in quarantine; preview counts, changed/deleted records, invalid rows and coverage deltas before any promotion.
- Preserve append-only decision history: who changed what, when, why, prior/new values, evidence references and approval.
- Provide a reversible suspension/withdrawal mechanism and tested recovery procedure.
- Never bulk-promote candidates to verified. Never auto-approve based solely on a parser, GIS layer, community dataset or successful CI.
- Synthetic records may be used in tests only and must be visibly distinguishable from real-world evidence.

## Required test cases before implementation

1. Unknown or prohibited licence; non-authoritative publisher; missing coverage declaration.
2. Stale, future-dated, malformed or absent source timestamps.
3. CRS mismatch, invalid/out-of-country coordinates, partial geometry and unsupported units.
4. Duplicate IDs, changed IDs, deleted features, partial feed outage and empty feed.
5. Conflicting values across sources and source withdrawal/retraction.
6. Missing lane/direction/road identity and ambiguous vehicle applicability.
7. Height record with missing survey document, inaccurate measurement, incomplete lane coverage, or posted/measured value conflation.
8. Gross versus axle-load mismatch; incomplete width/length applicability.
9. Temporary restriction crossing midnight, daylight-saving transition, expiry and cancellation.
10. Re-import idempotency, audit immutability, least-privilege access and rollback/suspension behavior.
11. Prove that every unresolved case blocks route approval and that absence from a feed never yields an unrestricted result.

## Current decision

No source in the 2026-11-17 recheck is approved for operational ingestion or routing. Hazav remains a discovery portal; the road-signing authority dataset is a responsibility reference; the out-of-service bridge layer is stale and geographically limited; the 2026 height guidelines are a methodology reference; and the OSM-derived listing is an unverified human-review lead.

No records were imported and no database was changed while drafting this contract. Production remains untouched. PR #19 must remain OPEN and DRAFT; no merge, preview or deployment is authorized by this document.
