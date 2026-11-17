# Human Review Identity and Separation-of-Duties Security Assessment

Date: 2026-11-17
Scope: local restriction-source staging, assessment, review-event recording and verification
Status: security assessment; no authentication or database changes

## Executive finding

The current review-event workflow provides useful integrity controls, but it does **not** authenticate a reviewer or enforce separation of duties.

`scripts/record-restriction-source-review.mjs` accepts a caller-supplied `--reviewer` string. The exported `createHumanReviewEvent` function likewise accepts a caller-supplied `reviewer` value. The verifier checks that the field is present and that the event hash/provenance links are internally consistent. Neither operation proves who operated the tool, whether that person is authorized, or whether the reviewer is independent of the source importer.

Consequently, the current event is a tamper-evident record of a claimed reviewer identifier, not an authenticated approval. The local filesystem workflow is suitable for controlled offline evidence preparation and audit fixtures only. It must not be represented as an enforced multi-user approval system.

## What the current controls do establish

- Candidate payloads have SHA-256 integrity checks and remain explicitly unapproved.
- Assessment reports are separately hashed and bound to a candidate payload hash.
- Review events bind candidate, assessment, source provenance and a decision.
- Event schema disallows an `approved_for_routing` field and the verifier always returns `approved_for_routing: false`.
- Output files use exclusive creation and private-directory/file permissions.
- Symlink/no-follow protections are used for inputs.
- Decisions are constrained to `accepted_for_pilot`, `rejected` or `needs_more_evidence`.

These controls protect structure, integrity and accidental overwrite. They do not provide identity, authorization, independence or operational approval.

## Required controls before a real multi-user review workflow

1. **Authenticated identity:** derive reviewer identity exclusively from a verified server-side session/token. Never accept reviewer identity from a request body, CLI flag, browser field or caller-controlled metadata.
2. **Authorization:** resolve the authenticated principal against a server-side role/permission registry for the specific source, dataset and review action. Authentication alone is insufficient.
3. **Separation of duties:** record the importer principal on the capture and reject review when the reviewer principal equals the importer principal. Where risk warrants, require a second independent operational approver after evidence review.
4. **Server-controlled time:** assign review timestamps on the server. Do not let clients choose the authoritative timestamp.
5. **Append-only audit:** persist review events through a server-only boundary with append-only permissions, immutable event history and tamper-evident linkage. Corrections must supersede prior events rather than rewrite them.
6. **Evidence binding:** server-side code must fetch and hash the stored candidate and evidence dossier; it must not trust client-supplied hashes or evidence references as proof.
7. **No routing privilege:** reviewer and intake roles must not be able to create, update or activate operational restriction rows. A separate promotion/operations permission is required.
8. **Abuse controls:** rate-limit review endpoints, validate CSRF/origin where cookie sessions are used, log security events without secrets, and test cross-tenant and privilege-escalation attempts.

## Required authorization matrix

| Actor | Capture source data | Assess evidence | Record review | Operational promotion |
| --- | --- | --- | --- | --- |
| Intake operator | Yes | No | No | No |
| Evidence reviewer | No | Yes | Yes, only if not importer | No |
| Operational approver | No | Read-only | Separate approval event | Explicitly, after all gates |
| Anonymous/browser public role | No | No | No | No |

A single person must not be able to bypass the required independent review by changing a submitted reviewer label.

## Safe interim operating rule

- Continue to use the local scripts only for synthetic fixtures, offline candidate preparation and internal evidence organization.
- Treat `reviewer` as an asserted label, not a verified identity.
- Treat `accepted_for_pilot` as a workflow decision only; it is not source authority approval, production approval or permission to route.
- Do not connect the local review event to Supabase, the operational restriction catalogue or route selection.
- Do not claim that importer/reviewer separation is currently technically enforced.

## Acceptance tests for a future authenticated implementation

- Caller cannot impersonate another reviewer by changing request fields, headers or CLI arguments.
- Unauthenticated and unauthorized principals are rejected server-side.
- Importer cannot review their own capture, even when using a different display name.
- Cross-tenant candidate/evidence identifiers cannot be read or reviewed.
- Client-supplied reviewer IDs and timestamps are ignored or rejected.
- Reviewer cannot mutate operational restriction tables or invoke promotion.
- Operational promotion requires a distinct permission and separate audit event.
- Event history is append-only; tampering, replay, duplicate submission and concurrent review conflicts are detected.
- All tests use synthetic identities/data in isolated environments.

## Current disposition

This is a documented gap, not a production incident. No authentication was bypassed, no reviewer identity was verified, no database schema/data was changed and no operational restriction was promoted. Supabase Production remains untouched. PR #19 must remain open and Draft; no merge, deployment, preview or routing-provider activation.
