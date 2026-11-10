import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHumanReviewEvent } from "../../scripts/record-restriction-source-review.mjs";
import { verifyHumanReviewEvent } from "../../scripts/verify-restriction-source-review.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-review-")); t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "quarantine"); await mkdir(outputDir);
  const candidateFile = path.join(root, "candidate.json"); const assessmentReportFile = path.join(root, "assessment.json");
  await writeFile(candidateFile, JSON.stringify({ payload_sha256: "a".repeat(64), source: {
      source_id: "agency-dataset-id",
      publisher: "Publishing authority",
      dataset_name: "Road restrictions export",
      dataset_version: "2026-11",
      licence_reference: "permission-123"
    },
    retrieved_at: "2026-11-10T17:00:00Z",
    schema_version: "1.0", review: { approved_for_routing: false } }));
  await writeFile(assessmentReportFile, JSON.stringify({ valid: true, approved_for_routing: false, dimensions: { authority: { status: "evidenced", evidence_refs: ["https://evidence.invalid/a"] } } }));
  const created = await createHumanReviewEvent({ candidateFile, assessmentReportFile, outputDir, reviewer: "reviewer-1", decision: "needs_more_evidence", reviewedAt: "2026-11-10T17:30:00Z" });
  return { ...{ root, candidateFile, assessmentReportFile }, eventFile: created.output };
}

test("verifies linked candidate, report, and event hashes", async t => {
  const f = await fixture(t);
  const result = await verifyHumanReviewEvent(f);
  assert.equal(result.valid, true);
  assert.equal(result.approved_for_routing, false);
  assert.equal(result.source_id, "agency-dataset-id");
  assert.equal(result.dataset_version, "2026-11");
});

test("detects candidate and assessment report changes", async t => {
  const f = await fixture(t);
  await writeFile(f.candidateFile, JSON.stringify({ payload_sha256: "b".repeat(64), source: {
      source_id: "agency-dataset-id",
      publisher: "Publishing authority",
      dataset_name: "Road restrictions export",
      dataset_version: "2026-11",
      licence_reference: "permission-123"
    },
    retrieved_at: "2026-11-10T17:00:00Z",
    schema_version: "1.0", review: { approved_for_routing: false } }));
  await assert.rejects(verifyHumanReviewEvent(f), /Candidate payload hash/);
  await writeFile(f.candidateFile, JSON.stringify({ payload_sha256: "a".repeat(64), review: { approved_for_routing: false } }));
  await writeFile(f.assessmentReportFile, JSON.stringify({ valid: false, approved_for_routing: false, dimensions: {} }));
  await assert.rejects(verifyHumanReviewEvent(f), /Assessment report hash/);
});

test("detects event tampering and unexpected routing fields", async t => {
  const f = await fixture(t);
  const event = JSON.parse(await readFile(f.eventFile, "utf8"));
  event.notes = "altered";
  await writeFile(f.eventFile, JSON.stringify(event));
  await assert.rejects(verifyHumanReviewEvent(f), /integrity hash mismatch/);
  event.approved_for_routing = true;
  await writeFile(f.eventFile, JSON.stringify(event));
  await assert.rejects(verifyHumanReviewEvent(f), /missing or unexpected fields/);
});
