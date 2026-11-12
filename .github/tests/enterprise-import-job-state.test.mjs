import test from "node:test";
import assert from "node:assert/strict";
import { enterpriseImportJobIdentity, evaluateEnterpriseImportJobTransition } from "../../lib/enterprise-import-job-state.mjs";

const baseJob = Object.freeze({
  id: "job-1",
  fleet_id: "00000000-0000-4000-8000-000000000001",
  status: "ready",
  revision: 4,
  expires_at: "2026-11-13T12:00:00.000Z"
});

test("allows ready-to-committing and increments revision without mutating input", () => {
  const result = evaluateEnterpriseImportJobTransition(baseJob, "committing", { expectedRevision: 4, now: "2026-11-12T12:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.job.status, "committing");
  assert.equal(result.job.revision, 5);
  assert.equal(result.job.updated_at, "2026-11-12T12:00:00.000Z");
  assert.equal(baseJob.status, "ready");
  assert.equal(baseJob.revision, 4);
});

test("rejects stale revisions", () => {
  assert.deepEqual(evaluateEnterpriseImportJobTransition(baseJob, "committing", { expectedRevision: 3, now: "2026-11-12T12:00:00Z" }), { ok: false, code: "stale_revision" });
});

test("rejects skipped transitions", () => {
  assert.deepEqual(evaluateEnterpriseImportJobTransition(baseJob, "completed", { expectedRevision: 4, now: "2026-11-12T12:00:00Z" }), { ok: false, code: "invalid_transition" });
});

test("rejects commit after expiry", () => {
  assert.deepEqual(evaluateEnterpriseImportJobTransition(baseJob, "committing", { expectedRevision: 4, now: "2026-11-13T12:00:00Z" }), { ok: false, code: "job_expired" });
});

test("allows explicit expiry transition at expiry time", () => {
  const result = evaluateEnterpriseImportJobTransition(baseJob, "expired", { expectedRevision: 4, now: "2026-11-13T12:00:00Z" });
  assert.equal(result.ok, true);
  assert.equal(result.job.status, "expired");
});

test("does not reopen terminal states", () => {
  assert.deepEqual(evaluateEnterpriseImportJobTransition({ ...baseJob, status: "completed" }, "committing", { expectedRevision: 4, now: "2026-11-12T12:00:00Z" }), { ok: false, code: "terminal_state" });
});

test("binds idempotency identity to fleet, source checksum and mapping fingerprint", () => {
  const result = enterpriseImportJobIdentity({ fleetId: baseJob.fleet_id, sourceSha256: "a".repeat(64), mappingFingerprint: "b".repeat(64) });
  assert.equal(result.ok, true);
  assert.equal(result.key, `${baseJob.fleet_id}:${"a".repeat(64)}:${"b".repeat(64)}`);
});

test("rejects malformed identity components", () => {
  assert.deepEqual(enterpriseImportJobIdentity({ fleetId: "bad", sourceSha256: "a".repeat(64), mappingFingerprint: "b".repeat(64) }), { ok: false, code: "invalid_fleet_id" });
  assert.deepEqual(enterpriseImportJobIdentity({ fleetId: baseJob.fleet_id, sourceSha256: "bad", mappingFingerprint: "b".repeat(64) }), { ok: false, code: "invalid_source_checksum" });
});
