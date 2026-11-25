# Release-readiness gap register

Updated: 2026-11-25

This is a verification register, not a release approval. The application remains unmerged and undeployed. Production must remain unchanged until the separate migration, routing-safety, and release gates below are accepted.

## Verified on the current candidate code

The dedicated Test-only CI run [45676984131](https://github.com/vb6kdhjpjf-hub/Trucksafe-fleet-/actions/runs/45676984131) completed successfully on candidate commit `3d11a571188181eee26788c5e6647db1a3ab3b01`. All three jobs passed:

- **Validation:** dependency audit, application/safety/workflow tests, Next.js production build, and isolated smoke tests.
- **Database integration:** the dedicated Test-project identity guard, rollback-only SQL suites, shipment/daily-load/delivery-document scenarios, and disposable Auth fixture cleanup.
- **Live Auth and Storage:** seven disposable signed Auth identities; RLS and role checks; the actual Next.js HTTP route handlers; invalid-token and unassigned-user denial; immediate membership revocation and role demotion; cross-fleet BOLA checks; private Storage upload/read/delete behavior; MIME and size rejection; and exact-path fixture cleanup.

The live Storage assertions also cover both sides of the delivery-proof cleanup rule. A driver-owned signature and owner-owned photo are referenced by an immutable synthetic proof; the actual uploader cannot delete their referenced file, while each user can remove only their own unreferenced upload and cross-user deletion is denied. Temporary objects are removed by exact path.

## Test-project state

The hosted Supabase Test project now has 25 public tables, with RLS enabled on all 25. Catalog review reports 48 authenticated public-table policies and no `anon` public-table policies. The private `delivery-proof-private` bucket is Test-only, limited to PNG/JPEG/WebP and 10 MiB per object. Test health advisor is clean; performance advisor reports 37 unused-index INFO notices and no unindexed-FK findings. Unused indexes were not removed without query-plan evidence.

One explicitly marked legacy Test fixture remains because an earlier failed CI run created an immutable delivery-proof record. The exact synthetic fleet, shipment, stop, proof, two referenced files, and only the two required Auth identities (owner and assigned driver) are preserved for the signed-JWT immutability test; the other five marked Auth identities are cleaned. The files are restored only at their exact allowlisted paths through their original signed uploader identities. No immutable trigger is disabled and no proof record is deleted.

The Test Security Advisor still warns about 10 authenticated `SECURITY DEFINER` RPCs. Catalog/code review shows pinned empty `search_path`, `auth.uid()` checks, and fleet-role checks; the shipment-result RPC also validates assigned-driver access. The two additional `SECURITY DEFINER` functions are trigger-only and not executable by `anon` or `authenticated`. These are intentional privileged transaction boundaries, not blanket grants. Leaked-password protection remains disabled and was not changed; enable it only after separate sign-in and password-reset regression checks.

## Production remains untouched

Read-only verification confirms the Production project still has 12 public tables, 35 migration-history rows, no shipment/daily-work/delivery-proof module tables, and no `delivery-proof-private` bucket. No Production schema, Auth setting, Storage bucket, object, or user was changed. Production performance review previously identified two unindexed foreign keys (`road_restrictions.verified_by` and `vehicles.registration_verified_by`); they were not changed without workload/query-plan evidence.

The Test feature migrations are not a Production rollout plan. Production migration history and tracked migration files have substantial provenance/version drift. Do not replay the complete tracked migration chain against Production. A separate evidence-based migration plan is required, including provenance reconciliation, exact SQL, preflight counts, backup, rollback, and maintenance approval.

## Outstanding evidence before release

| Area | Required work |
|---|---|
| Browser and device E2E | Real browser tests for owner/manager/dispatcher/driver workflows, including task assignment, pre-trip inspection, trip start/finish, shipment and delivery proof. |
| Mobile and network behavior | Mobile viewport pass; offline and intermittent-network retries; GPS permission denial/recovery; device-level GPS accuracy and stale-location behavior. |
| Routing safety | Obtain and verify authoritative truck restrictions with provenance, licensing, freshness, and geographic coverage; validate dimensions, gross weight, axle and trailer constraints; complete independent safety review. |
| Routing provider | PTV/HERE integration remains disabled. No provider or restriction-coverage approval is implied by the existing geometry and fail-closed tests. |
| Production migration | Reconcile Test/Production migration provenance and prepare a separate reviewed Production plan; no schema rollout is authorized by this register. |
| Auth hardening | Review leaked-password protection and complete sign-in/password-reset regression tests before enabling it. |
| Production performance | Assess the two unindexed Production foreign keys using representative query plans before deciding whether to add indexes. |

## Release gates

1. The successful Test-only run above does not prove browser E2E, Production configuration, or live routing-provider behavior.
2. No routing provider is enabled until authoritative restriction coverage and explicit safety approval exist.
3. No Production schema, Auth, Storage, or data mutation is performed without a separately reviewed plan and explicit approval.
4. Green CI does not imply merge or deployment. Production rollout, browser/device verification, and rollback readiness remain independent gates.

## Current disposition

**Not release-ready.** Application, rollback-only database, live Auth, and live Test Storage checks are green. Browser/device E2E, authoritative truck-restriction coverage, Production migration reconciliation, Auth hardening, and Production rollout approval remain outstanding.
