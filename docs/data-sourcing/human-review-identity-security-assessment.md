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
- Treat `reviewer` as an asserted label, not a verified identity. Review events now explicitly carry `reviewer_identity_status: "unverified_assertion"` and `reviewer_identity_verified: false`. Their `reviewed_at` value is also caller-supplied, so events carry `reviewed_at_status: "caller_asserted"` and `reviewed_at_verified: false`. The verifier rejects events that claim either identity or time is verified, and the audit manifest preserves both statuses.
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


## Implementation boundary and next-stage design (2026-11-18)

A read-only inspection of the dedicated Supabase Test schema confirmed that the existing `public.fleet_members` roles (`owner`, `fleet_manager`, `dispatcher`, `safety_manager`, `driver`) are fleet-operational roles. They are not a global source-governance permission model and must not be reused to grant authority over restriction-source evidence. The current source review workflow also has no server endpoint or persisted source-review role registry.

The authenticated implementation should therefore be a separate, global governance boundary rather than an extension of fleet membership:

1. **Principal authentication:** a server route receives the user's access token and validates it with Supabase Auth `getUser(token)`. The authenticated user ID returned by Auth is the only identity used for authorization and audit fields. Request body, URL parameters, display name, `user_metadata`, and caller-provided headers are never identity sources.
2. **Live permission lookup:** a private, server-managed role registry grants scoped capabilities such as `source_intake`, `evidence_review`, and `operational_approval`. Look up permissions on each sensitive operation so revocation is not dependent on a stale JWT `app_metadata` claim. Do not reuse `fleet_members`.
3. **Separate records:** persist source captures with server-assigned `imported_by`; persist evidence assessments separately; persist review decisions as append-only events with server-assigned `reviewed_by` and `reviewed_at`; persist operational approval as a distinct event. Store content hashes calculated by the server after fetching stored evidence.
4. **Separation checks:** reject a review if the authenticated reviewer is the importer, regardless of any display label. Require a different authorized principal for operational approval. Enforce the invariant in the transaction/database boundary as well as the API route, not only in UI code.
5. **No direct client access:** keep role assignments, candidate evidence, and audit writes in a non-exposed schema with no `anon` or ordinary `authenticated` table grants. Expose only narrowly scoped server operations; no browser service-role key and no general-purpose client write path.
6. **No implicit routing activation:** even an approved evidence-review event does not create or verify a road restriction and cannot enable route use. Operational promotion remains a separately authorized process with its own source-quality, geometry, freshness, licensing, and validation gates.

### Required bootstrap and release gates

- An authorized system owner must explicitly designate the initial intake, reviewer, and approver principals using their real Supabase Auth user IDs. Do not infer these identities from the repository owner, fleet owner, email display name, or the current chat account.
- The owner must confirm who may administer this global permission registry and how access is revoked.
- The implementation must be reviewed against current Supabase documentation and changelog before any schema/API feature is added. The changelog index fetch returned an unsupported Markdown content type during this review; the relevant current Auth/RLS documentation was searched, but the changelog scan remains outstanding.
- Create and test the schema only through rollback-only CI against the dedicated Test project. Do not apply a persistent migration to Test or Production as part of this work.
- Add live integration tests with distinct synthetic Auth users for intake, reviewer, approver, unauthenticated, revoked, and cross-fleet principals. Tests must prove self-review denial, reviewer cannot promote, approver must be independent, role revocation takes effect immediately, and audit events cannot be edited/deleted through client access.
- Do not enable this workflow or describe the roles as enforced until the server route, database boundary, identity bootstrap, and all integration tests are complete.

### Decision for this stage

The existing fleet Auth helper correctly validates a signed user with `client.auth.getUser(token)` and then resolves fleet membership. That is a useful authentication pattern, but its fleet role lookup is not sufficient for global source governance. The next implementation should reuse the verified-identity pattern while adding a distinct server-managed permission registry and append-only review records. No such registry or endpoint is being activated in this stage.

The Supabase changelog could not be fetched as Markdown, and the repository workflow has no verified protected-environment reviewer configuration. Therefore no pretend GitHub-dispatch approval flow, role simulation, Supabase schema write, or deployment was introduced. The current local review flow remains explicitly unverified. The event contract now requires explicit unverified status for both reviewer identity and the caller-supplied review timestamp. Existing event files created before these fields were added will fail verification and be marked invalid; this is an intentional fail-closed compatibility change, not evidence that the old events were authenticated.
