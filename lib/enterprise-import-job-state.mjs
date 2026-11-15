const TRANSITIONS = Object.freeze({
  uploaded: new Set(["validating", "cancelled", "expired"]),
  validating: new Set(["ready", "failed", "cancelled", "expired"]),
  ready: new Set(["committing", "cancelled", "expired"]),
  committing: new Set(["completed", "partial_failed", "failed"]),
  partial_failed: new Set(["committing", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  expired: new Set()
});

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "expired"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function evaluateEnterpriseImportJobTransition(job, nextStatus, {
  expectedRevision,
  now = new Date()
} = {}) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return { ok: false, code: "invalid_job" };
  if (!Object.hasOwn(TRANSITIONS, job.status) || !Object.hasOwn(TRANSITIONS, nextStatus)) return { ok: false, code: "unknown_status" };
  if (!Number.isSafeInteger(job.revision) || job.revision < 0) return { ok: false, code: "invalid_revision" };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, code: "expected_revision_required" };
  if (job.revision !== expectedRevision) return { ok: false, code: "stale_revision" };

  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) return { ok: false, code: "invalid_clock" };

  let expiresAt = null;
  if (job.expires_at !== undefined && job.expires_at !== null && job.expires_at !== "") {
    expiresAt = new Date(job.expires_at);
    if (!Number.isFinite(expiresAt.getTime())) return { ok: false, code: "invalid_expiry" };
  }

  if (nextStatus === "expired") {
    if (!expiresAt) return { ok: false, code: "expiry_required" };
    if (nowDate.getTime() < expiresAt.getTime()) return { ok: false, code: "expiry_not_reached" };
  }

  if (expiresAt && nowDate.getTime() >= expiresAt.getTime() && !TERMINAL_STATES.has(job.status)) {
    if (nextStatus !== "expired" || !TRANSITIONS[job.status].has("expired")) return { ok: false, code: "job_expired" };
  }
  if (!TRANSITIONS[job.status].has(nextStatus)) {
    return { ok: false, code: TERMINAL_STATES.has(job.status) ? "terminal_state" : "invalid_transition" };
  }
  return { ok: true, job: { ...job, status: nextStatus, revision: job.revision + 1, updated_at: nowDate.toISOString() } };
}

export function enterpriseImportJobIdentity({ fleetId, sourceSha256, mappingFingerprint } = {}) {
  if (typeof fleetId !== "string" || !UUID_PATTERN.test(fleetId)) return { ok: false, code: "invalid_fleet_id" };
  if (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(sourceSha256)) return { ok: false, code: "invalid_source_checksum" };
  if (typeof mappingFingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(mappingFingerprint)) return { ok: false, code: "invalid_mapping_fingerprint" };
  return { ok: true, key: `${fleetId.toLowerCase()}:${sourceSha256}:${mappingFingerprint}` };
}
