# Isolated restriction-source staging

This local CLI preserves a source payload as an **unapproved candidate**. It is not a live importer and does not contact providers, Supabase, or any other database.

## Requirements

- Node.js 24 (matches the repository engine)
- A local JSON file containing one object or array
- An existing, dedicated quarantine directory
- Source identity and licence metadata

## Example

\`\`\`sh
mkdir -p ./private-quarantine
node scripts/stage-restriction-source.mjs \
  --input ./source-export.json \
  --quarantine-dir ./private-quarantine \
  --source-id agency-dataset-id \
  --publisher "Publishing authority" \
  --dataset-name "Road restrictions export" \
  --dataset-version "2026-11" \
  --licence-reference "Documented licence or written permission reference"
\`\`\`

The CLI rejects invalid JSON, primitive payloads, missing source/licence metadata, timezone-ambiguous timestamps, and files larger than 5 MiB. It hashes the canonical JSON serialization of the parsed payload (so the stored payload can be re-verified after the envelope is written), validates the envelope, then creates a content-addressed JSON file with exclusive-create semantics; an existing candidate is never overwritten. The quarantine directory must already exist.

Every generated record is marked \`unreviewed\` and \`approved_for_routing: false\`. Structural validation and a matching hash do **not** prove that road facts are accurate, authoritative, current, complete, or licensed. A human review and independent verification remain mandatory. The CLI does not import into a database, enable route coverage, or make a route safe.

## Separate assessment command

After staging a candidate, a reviewer can supply a JSON assessment file with the nine dimensions (\`authority\`, \`geographic_coverage\`, \`truck_constraints\`, \`measurement_quality\`, \`temporal_validity\`, \`update_mechanism\`, \`licensing\`, \`reliability\`, \`independent_validation\`). Each dimension uses \`status\` (\`missing\`, \`partial\`, or \`evidenced\`) and optional \`evidence_refs\`. Example:

\`\`\`sh
node scripts/assess-staged-restriction-source.mjs \
  --candidate ./private-quarantine/candidate-HASH.json \
  --assessment ./review-assessment.json \
  --output-dir ./private-quarantine
\`\`\`

The command writes a separate content-addressed \`.assessment.json\` report and never edits the candidate. If no evidence is supplied, all nine dimensions remain blocking. Evidence references are pointers for human review, not proof of truth. Even a complete dossier always has \`approved_for_routing: false\`. The command does not contact networks or databases.

## Append-only human review event

A separate human review event can be recorded after an assessment report exists. It requires an explicit reviewer identifier and one of three decisions: \`accepted_for_pilot\`, \`rejected\`, or \`needs_more_evidence\`.

\`\`\`sh
node scripts/record-restriction-source-review.mjs \
  --candidate ./private-quarantine/candidate-HASH.json \
  --assessment-report ./private-quarantine/candidate-HASH.assessment.json \
  --output-dir ./private-quarantine \
  --reviewer "reviewer-id" \
  --decision needs_more_evidence \
  --notes "Describe remaining verification work"
\`\`\`

The command writes a separate file under \`reviews/\` using exclusive-create semantics and mode \`0600\`. It links the candidate payload hash and exact assessment-report byte hash, includes evidence references, and hashes the canonical event content. It never edits the candidate or assessment report, accepts no routing-approval decision, and does not add an \`approved_for_routing\` field. This is an audit record of a human decision only; it does not verify evidence, enable routing, contact networks, or access a database. The reviewer identifier is supplied by the human operator and is not independently authenticated by this local CLI.

## Verify a recorded human review event

To verify that the candidate and assessment report still match a recorded review event, run:

\`\`\`sh
node scripts/verify-restriction-source-review.mjs \
  --candidate ./private-quarantine/candidate-HASH.json \
  --assessment-report ./private-quarantine/candidate-HASH.assessment.json \
  --event ./private-quarantine/reviews/review-EVENT_HASH.json
\`\`\`

The verifier checks the candidate payload hash, exact assessment-report byte hash, event schema, timestamp, decision, and event integrity hash. It rejects changed inputs, malformed records, and unexpected fields. It is an offline integrity check only: it does not authenticate the human reviewer, prove evidence is true, or authorize routing.

Review events also copy the candidate's source identity (source ID, publisher, dataset name/version, licence reference, candidate schema version, and retrieval timestamp). The verifier requires exact equality with the current candidate, in addition to the content hashes. This makes a changed publisher/version/metadata invalidate an older review record. These fields are provenance labels supplied in the staged candidate, not independent proof of publisher identity or licence validity.

## Build an immutable source-history manifest

After staging and review, create a point-in-time index of the quarantine directory:

\`\`\`sh
node scripts/build-restriction-source-manifest.mjs \
  --quarantine-dir ./private-quarantine
\`\`\`

The builder scans only content-addressed candidate, assessment, and review filenames. It recomputes each stored payload hash, validates the complete nine-dimension assessment report, and records the exact assessment-report SHA-256. It verifies every linked review against the exact candidate and report, records missing or invalid assessments, pending reviews, invalid/stale review links, repeated valid reviews for the same candidate/report, and orphaned events. The manifest is written under a content-addressed filename with exclusive-create semantics and mode \`0600\`; it never overwrites an earlier manifest or modifies source records. A manifest integrity hash detects later edits.

This is an offline audit index, not a live source registry. Repeated reviews are flagged for human reconciliation, not treated as additional approval. Invalid or stale links remain visible as integrity failures. The manifest always states \`approved_for_routing: false\`; it does not authenticate reviewers, validate evidence truth, establish national coverage, access a network/database, or enable routing.
