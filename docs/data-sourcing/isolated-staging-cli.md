# Isolated restriction-source staging

This local CLI preserves a source payload as an **unapproved candidate**. It is not a live importer and does not contact providers, Supabase, or any other database.

## Requirements

- Node.js 24 (matches the repository engine)
- A local JSON file containing one object or array
- An existing, dedicated quarantine directory
- Source identity and licence metadata

## Example

```sh
mkdir -p ./private-quarantine
node scripts/stage-restriction-source.mjs \
  --input ./source-export.json \
  --quarantine-dir ./private-quarantine \
  --source-id agency-dataset-id \
  --publisher "Publishing authority" \
  --dataset-name "Road restrictions export" \
  --dataset-version "2026-11" \
  --licence-reference "Documented licence or written permission reference"
```

The CLI rejects invalid JSON, primitive payloads, missing source/licence metadata, timezone-ambiguous timestamps, and files larger than 5 MiB. It hashes the exact original UTF-8 bytes, validates the envelope, then creates a content-addressed JSON file with exclusive-create semantics; an existing candidate is never overwritten. The quarantine directory must already exist.

Every generated record is marked `unreviewed` and `approved_for_routing: false`. Structural validation and a matching hash do **not** prove that road facts are accurate, authoritative, current, complete, or licensed. A human review and independent verification remain mandatory. The CLI does not import into a database, enable route coverage, or make a route safe.

## Separate assessment command

After staging a candidate, a reviewer can supply a JSON assessment file with the nine dimensions (`authority`, `geographic_coverage`, `truck_constraints`, `measurement_quality`, `temporal_validity`, `update_mechanism`, `licensing`, `reliability`, `independent_validation`). Each dimension uses `status` (`missing`, `partial`, or `evidenced`) and optional `evidence_refs`. Example:

```sh
node scripts/assess-staged-restriction-source.mjs \\
  --candidate ./private-quarantine/candidate-HASH.json \\
  --assessment ./review-assessment.json \\
  --output-dir ./private-quarantine
```

The command writes a separate content-addressed `.assessment.json` report and never edits the candidate. If no evidence is supplied, all nine dimensions remain blocking. Evidence references are pointers for human review, not proof of truth. Even a complete dossier always has `approved_for_routing: false`. The command does not contact networks or databases.
