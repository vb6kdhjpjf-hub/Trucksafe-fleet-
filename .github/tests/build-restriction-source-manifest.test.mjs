import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHumanReviewEvent } from "../../scripts/record-restriction-source-review.mjs";
import { buildRestrictionSourceManifest, verifyRestrictionSourceManifest } from "../../scripts/build-restriction-source-manifest.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reviewsDir = path.join(root, "reviews"); await mkdir(reviewsDir);
  const payload = { restrictions: [{ id: "synthetic-1" }] };
  const payloadHash = hash(JSON.stringify(payload));
  const candidateFile = path.join(root, "candidate-" + payloadHash + ".json");
  const assessmentFile = path.join(root, "candidate-" + payloadHash + ".assessment.json");
  await writeFile(candidateFile, JSON.stringify({
    schema_version: "1.0",
    source: { source_id: "synthetic-source", publisher: "Test publisher", dataset_name: "Synthetic restrictions", dataset_version: "v1", licence_reference: "test-only" },
    retrieved_at: "2026-11-10T17:00:00Z",
    payload, payload_sha256: payloadHash,
    review: { status: "unreviewed", approved_for_routing: false }
  }));
  await writeFile(assessmentFile, JSON.stringify({ valid: true, approved_for_routing: false, dimensions: {} }));
  return { root, candidateFile, assessmentFile, payloadHash };
}

test("builds a content-addressed, unapproved manifest and verifies it", async t => {
  const f = await fixture(t);
  const first = await buildRestrictionSourceManifest({ quarantineDir: f.root, createdAt: "2026-11-10T18:00:00Z" });
  assert.equal(first.manifest.candidates[0].status, "awaiting_review");
  assert.equal(first.manifest.approved_for_routing, false);
  assert.equal(verifyRestrictionSourceManifest(first.manifest).valid, true);
  await assert.rejects(buildRestrictionSourceManifest({ quarantineDir: f.root, createdAt: "2026-11-10T18:00:00Z" }), /EEXIST/);
});

test("detects repeated reviews for the same candidate and report", async t => {
  const f = await fixture(t);
  await createHumanReviewEvent({ candidateFile: f.candidateFile, assessmentReportFile: f.assessmentFile, outputDir: f.root, reviewer: "reviewer-a", decision: "needs_more_evidence", reviewedAt: "2026-11-10T18:10:00Z" });
  await createHumanReviewEvent({ candidateFile: f.candidateFile, assessmentReportFile: f.assessmentFile, outputDir: f.root, reviewer: "reviewer-b", decision: "accepted_for_pilot", reviewedAt: "2026-11-10T18:20:00Z" });
  const result = await buildRestrictionSourceManifest({ quarantineDir: f.root, createdAt: "2026-11-10T18:30:00Z" });
  assert.equal(result.manifest.candidates[0].status, "repeated_review");
  assert.equal(result.manifest.candidates[0].reviews.filter(item => item.valid).length, 2);
  assert.equal(result.manifest.approved_for_routing, false);
});

test("detects stale assessment linkage and rejects manifest tampering", async t => {
  const f = await fixture(t);
  await createHumanReviewEvent({ candidateFile: f.candidateFile, assessmentReportFile: f.assessmentFile, outputDir: f.root, reviewer: "reviewer-a", decision: "needs_more_evidence", reviewedAt: "2026-11-10T18:10:00Z" });
  await writeFile(f.assessmentFile, JSON.stringify({ valid: false, approved_for_routing: false, dimensions: {} }));
  const result = await buildRestrictionSourceManifest({ quarantineDir: f.root, createdAt: "2026-11-10T18:30:00Z" });
  assert.equal(result.manifest.candidates[0].status, "stale_review");
  const tampered = structuredClone(result.manifest); tampered.candidate_count = 99;
  assert.throws(() => verifyRestrictionSourceManifest(tampered), /integrity hash mismatch/);
});

test("reports review events without a matching candidate as orphaned", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "reviews", "review-" + "a".repeat(64) + ".json"), JSON.stringify({ candidate_payload_sha256: "b".repeat(64) }));
  const result = await buildRestrictionSourceManifest({ quarantineDir: f.root, createdAt: "2026-11-10T18:30:00Z" });
  assert.equal(result.manifest.orphaned_event_count, 1);
});
