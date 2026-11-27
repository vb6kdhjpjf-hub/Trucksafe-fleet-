# Test DB: task-assignment guard validation note

Date: 25 November 2026. Scope: read-only Test catalog inspection plus isolated CI test-fixture correction.

## Test preflight

- `public.tasks` currently contains zero rows, so there were zero existing-row violations of the proposed assignment-pair and assigned-status CHECK constraints at inspection time.
- Existing task triggers are `guard_driver_task_update`, `reject_demo_vehicle_task_assignment`, and `set_updated_at`.
- `guard_driver_task_update` authorizes fleet owners, fleet managers, and dispatchers via `private.has_fleet_role`; otherwise it restricts assigned drivers to status-only updates.
- The fleet insert trigger `add_fleet_owner_membership` creates the owner membership row in `public.fleet_members`.

This is a point-in-time preflight only. Re-run immediately before any explicitly approved Test rollout.

## CI test-quality correction

The rollback-only test `.github/tests/task-assignment-eligibility-e2e.sql` has a negative UPDATE assertion intended to prove that `validate_task_assignment_before_write` rejects reassignment to an inactive driver.

Previously, the assertion ran without a synthetic authenticated fleet-owner identity. The legacy `guard_driver_task_update` could reject the UPDATE first, creating a false positive.

The fixture now sets the transaction-local JWT subject to the owner of the test fleet and role to `authenticated` immediately before the UPDATE assertion. The fleet owner membership is already created by the existing fleet insert trigger. The legacy guard therefore authorizes the owner, allowing the assertion to test the new eligibility trigger. The test still verifies the original valid assignment remains unchanged.

This changes only a disposable rollback-only CI test fixture; no application migration or hosted database was changed.

## Required validation

- Run the complete isolated validation workflow against the updated commit.
- Confirm the assignment-eligibility SQL test passes and all other SQL suites remain green.
- Keep PR #24 open and Draft. No merge, deployment, hosted Test mutation, or Production mutation is authorized by this validation note.
