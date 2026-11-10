# TruckSafe Fleet V1 — Project Status and Roadmap

Last reviewed: 2026-11-10
Branch: `test/isolated-e2e-ci`
Pull request: [#15](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/pull/15) — open, Draft, not merged
Production release: **not approved**

This document is the working status record. It separates implemented software from capabilities that have not yet been proven safe or commercially authorized.

## Executive status

TruckSafe has a substantial fleet-management application and an isolated validation baseline. The truck-routing path is deliberately gated: passing software tests or receiving a route from a mapping provider does not establish that a route is safe for a particular truck in Israel.

**Current release posture: development / controlled testing only. Do not use as an approved truck-navigation service.**

## Workstreams

| Workstream | Current status | Evidence / remaining gate |
|---|---|---|
| Fleet workspace and dashboard | Implemented in the application | Login, fleet membership, fleet dashboard and operational modules exist; dashboard loading now fails closed when an account has multiple fleet memberships or multiple owned fleets instead of selecting one arbitrarily. Complete user-acceptance testing is still required. |
| Drivers, vehicles and tasks | Implemented; safety checks added | Driver eligibility, vehicle lifecycle and task/pre-trip flows have automated tests. Real-user acceptance and edge-case review remain. |
| Maintenance, incidents, history and reports | Implemented in the application | Pages and data workflows exist; full operational acceptance and permissions review remain. |
| Vehicle registration verification | Guarded workflow implemented in the development branch | Private registration document and authorized review are required; material technical-profile, registration-number, make/model and vehicle-type edits invalidate prior approval; a database INSERT trigger clears any client-supplied approval or document metadata. SQL integration tests cover forged INSERT metadata and re-review after a registration identity change. Rollout to Production has not been authorized. |
| Fleet road-restriction catalogue | Implemented as fleet-scoped workflow | Geometry, time validity and verification evidence checks exist. It is not a national authoritative road database. |
| Route API security and quota | Implemented in the development branch | Authenticated fleet access with ambiguous multi-fleet membership rejected, saved verified vehicle selection in the routing UI, server-trusted vehicle profile, streamed 16 KB request-body limit, strict UTF-8/JSON parsing, request validation and fail-closed quota enforcement are tested in the isolated test project. |
| HERE truck-routing integration | Code path exists, but routing is disabled by safety gate | Requires approved credentials/plan, validated Israel coverage and independent restriction checks. A provider route alone is not a safety approval. |
| PTV integration | Experimental preparation only | Preview catalogue diagnostic returned 22 profiles (16 truck candidates). No live route integration is approved. Commercial/production rights and Israel coverage must be confirmed in writing. |
| Israeli restriction data acquisition | Research and request draft completed | Ministry specification and other candidate leads are documented. No verified nationwide feed or commercial-use agreement has been received. |
| Offline source provenance pipeline | Implemented and unit-tested | Staging, evidence-completeness assessment, append-only human review, verification and content-addressed manifest are available. This pipeline does not authenticate the truth of source documents or approve routing. |
| Production release | Blocked / not approved | No merge, deployment, Production database migration or national-coverage approval is authorized. |

## Verified engineering baseline

The latest verified isolated validation run is [GitHub Actions run 42873983249](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/42873983249), on commit `77f73b30ac20cfbaeed9de3bc2489973475d77fc`.

Recorded results:
- Application and safety unit-test step passed (161 tests), including streamed request-body limit and routing-profile validation tests.
- Vehicle-registration security integration test passed: direct vehicle INSERT cannot forge a verified status or inject document/approval metadata; technical-profile edits and registration-identity changes invalidate prior approval and clear reviewer metadata. Fleet dashboard code also rejects ambiguous multi-fleet selection rather than silently choosing a workspace.
- Isolated database integration job passed; its connection was verified to target only the dedicated test project.
- Next.js production build passed.
- Production dependency audit reported 0 vulnerabilities.
- Synthetic database fixtures are rollback-only.

These results establish that the tested code passed those checks. They do not establish live provider correctness, source-data coverage, production readiness, or road safety.

## Critical release blockers

1. **Authoritative Israeli restriction data:** obtain current records from the competent road owners/authorities, with stable IDs, exact geometry, direction/lane, height/weight/dimension/time constraints, measurement evidence, effective dates and withdrawal/update process.
2. **Commercial rights:** obtain written permission for commercial storage, transformation, display and route decisions for every source and routing provider.
3. **Coverage and freshness:** document included road owners/classes and all gaps. Prove how expired, withdrawn, temporary and emergency restrictions reach the system.
4. **Independent validation:** compare a representative sample against official documents and field/authority checks; measure false negatives separately and define an approved safety threshold.
5. **Vehicle profile correctness:** validate registration-derived dimensions and weights, actual loaded weight and axle-weight semantics; do not infer missing values.
6. **Geospatial correctness:** replace coarse geographic bounds with a trusted Israel boundary and road-access checks before any routing release.
7. **End-to-end pilot:** run staging-only imports and shadow routes, test time windows and Israel daylight-saving transitions, and obtain sign-off from the data owner, safety reviewer and operational owner.
8. **Production governance:** review migrations, RLS/storage permissions, monitoring, incident response, backups and rollback before any production change.

## Next milestones

### Milestone 1 — Evidence acquisition (current)
- Verify the published Netivei Israel contact and source-owner responsibility.
- Obtain a written response, data dictionary, representative sample, coverage map, update mechanism and commercial-use terms.
- Keep the existing request as a draft until the project owner explicitly authorizes sending it.

### Milestone 2 — Isolated pilot importer
- Build only after a real sample and licence are received.
- Preserve original files, checksums, retrieval metadata and source version.
- Validate schema, units, coordinate reference system, geometry, lane/direction, time zone, expiry, conflicts and withdrawals.
- Keep all imported records candidate/unverified and outside production routing.

### Milestone 3 — Shadow validation
- Compare candidate restrictions with authoritative documents and field/authority checks.
- Run route comparisons without presenting them as safe navigation.
- Record false negatives, stale data, coverage gaps and provider disagreements.
- Require written safety and data-owner sign-off.

### Milestone 4 — Controlled pilot decision
- Limit any pilot to a clearly documented area and road-owner scope.
- Enable only after commercial rights, coverage, update SLA, vehicle mapping, independent tests and rollback plan are approved.
- Keep national coverage disabled unless separately proven and explicitly approved.

### Milestone 5 — Production release
- Separate release review and production migration plan.
- Confirm deployment, monitoring, access control, backup and incident procedures.
- Obtain explicit release authorization. No automatic merge or deploy.

## Non-negotiable safeguards

- `TRUCK_RESTRICTION_COVERAGE_APPROVED` remains off unless the full national-coverage evidence and approval gates are satisfied.
- Missing, stale, conflicting or unverified restriction data must never be interpreted as a clear road.
- Candidate bridge geometry is not a measured height restriction.
- The fleet-scoped restriction catalogue is not nationwide coverage.
- PTV remains experimental until commercial rights, service behavior and Israel coverage are verified.
- Do not apply branch migrations to Production or alter Production data as part of this work.
- Keep PR #15 Draft and unmerged; do not deploy without explicit authorization.
