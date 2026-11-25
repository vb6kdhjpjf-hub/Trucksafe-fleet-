# Release-readiness gap register

Updated: 2026-11-25

This is a verification register, not a release approval. The application must remain unmerged and undeployed until the outstanding live checks and rollout gates below are accepted.

## Verified in CI on the current PR revision

- The validation job passed: production dependency audit, application/safety/workflow tests, Next.js production build, and isolated smoke tests.
- The database integration job passed with the dedicated Test-project identity guard, rollback-only SQL suite, and fixture cleanup.
- Live Auth integration passed on the current candidate commit via dedicated Test-only push run `45660285458` on `test/current-candidate-auth-e2e`: signed session verification, role/membership fail-closed checks, real local HTTP API checks, and disposable Auth fixture cleanup all succeeded. This is evidence for the candidate commit, not for Production.

## Outstanding evidence

| Area | Existing evidence | Required before release |
|---|---|---|
| Live Auth and RLS | Dedicated Test-only run `45660285458` passed signed-token verification, role/membership fail-closed checks, local HTTP route checks, and Auth fixture cleanup | Add browser-level Auth/session checks and keep Production Auth settings unchanged until separately approved |
| Storage document access | Private buckets, object policies, file-validation unit tests | Live Test-project upload, authorized read, cross-fleet denial, unauthorized delete denial, MIME/size rejection, and cleanup |
| Browser workflows | Unit, API, smoke, and local HTTP route-handler tests | Browser E2E with owner/manager/dispatcher/driver roles, including task assignment, pre-trip checklist, trip start/finish, and delivery proof |
| Driver/device experience | Responsive application build and code-level checks | Mobile viewport/browser pass, offline/network interruption behavior, GPS permission denial/recovery, and stale-location handling |
| Routing safety | Geometry, source-evidence, vehicle-profile, quota, and fail-closed tests | Verified authoritative restriction data with provenance, freshness, geographic coverage, vehicle dimensions/weight constraints, and explicit safety approval; only then provider integration tests |
| Production migration | Schema archive, catalog comparison, documented drift | Reconcile migration provenance; test a reviewed migration set on disposable local DB and then Test; exact SQL, backup, preflight, rollback, and maintenance plan for Production |
| Auth hardening | Production advisor reported leaked-password protection disabled | Review and enable in Auth Dashboard only after dedicated regression checks for sign-in and password reset; do not change Production as part of this register |

## Required live Auth execution

The workflow intentionally permits live Auth only on a direct push to `test/isolated-e2e-ci` or a manual dispatch on that branch with `confirm_test_auth=true`. It requires:

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`

The workflow's Auth job builds with routing providers disabled and coverage approval false, binds the app server to loopback, and removes the service-role key from the server process. Its fixture uses unique markers and cleanup-only logic. Never substitute Production secrets or expose secret values in logs/chat.

## Release gates

1. Live Auth is verified for the current candidate by Test-only run `45660285458`; live Storage remains unverified until upload/read/cross-fleet denial/delete-denial and cleanup pass on Test.
2. No routing provider is enabled until authoritative restriction coverage and safety review are approved.
3. No hosted schema, Auth, Storage, or data mutation is performed without a separately reviewed change plan and explicit approval.
4. No merge or deployment is implied by green CI; browser E2E, production configuration review, and rollback readiness remain independent gates.

## Current disposition

**Not release-ready.** Automated application and rollback-only database CI are green, and live Auth now has Test-only evidence. Live Storage, browser/device E2E, authoritative routing coverage, Auth hardening review, and Production rollout approval remain outstanding.
