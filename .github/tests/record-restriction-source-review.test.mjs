import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHumanReviewEvent } from "../../scripts/record-restriction-source-review.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
async function fixture(t, report = { valid: true, approved_for_routing: false, dimensions: { authority: { status: "evidenced", evidence_refs: ["https://evidence.invalid/a"] } } }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-review-")); t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "quarantine"); await mkdir(outputDir);
  const candidateFile = path.join(root, "candidate.json"); const assessmentReportFile = path.join(root, "assessment.json");
  await writeFile(candidateFile, JSON.stringify({ payload_sha256: "a".repeat(64), review: { approved_for_routing: false } }));
  await writeFile(assessmentReportFile, JSON.stringify(report));
  return { root, outputDir, candidateFile, assessmentReportFile };
}
const base = f => ({ ...f, reviewer: "human-reviewer-1", decision: "needs_more_evidence", reviewedAt: "2026-11-10T17:30:00Z" });

test("writes an append-only human review event with linked hashes and no routing approval", async t => {
  const f = await fixture(t); const result = await createHumanReviewEvent(base(f));
  assert.equal(result.event.candidate_payload_sha256, "a".repeat(64));
  assert.equal(result.event.assessment_report_sha256, hash(await readFile(f.assessmentReportFile)));
  assert.equal(result.event.event_sha256, hash(JSON.stringify(Object.fromEntries(Object.entries(result.event).filter(([key]) => key !== "event_sha256")))));
  assert.equal(Object.hasOwn(result.event, "approved_for_routing"), false);
  assert.deepEqual(result.event.evidence_refs, ["https://evidence.invalid/a"]);
  await assert.rejects(createHumanReviewEvent(base(f)), { code: "EEXIST" });
  assert.equal(JSON.parse(await readFile(f.candidateFile, "utf8")).review.approved_for_routing, false);
});

test("requires reviewer, supported decision, and timezone-aware timestamp", async t => {
  const f = await fixture(t);
  await assert.rejects(createHumanReviewEvent({ ...base(f), reviewer: " " }), /reviewer identifier/);
  await assert.rejects(createHumanReviewEvent({ ...base(f), decision: "approved_for_routing" }), /Unsupported human review decision/);
  await assert.rejects(createHumanReviewEvent({ ...base(f), reviewedAt: "2026-11-10T17:30:00" }), /explicit timezone/);
});

test("rejects malformed or routing-approved candidate and assessment report", async t => {
  const f = await fixture(t);
  await writeFile(f.candidateFile, JSON.stringify({ payload_sha256: "a".repeat(64), review: { approved_for_routing: true } }));
  await assert.rejects(createHumanReviewEvent(base(f)), /explicitly unapproved/);
  await writeFile(f.candidateFile, JSON.stringify({ payload_sha256: "a".repeat(64), review: { approved_for_routing: false } }));
  await writeFile(f.assessmentReportFile, JSON.stringify({ valid: true, approved_for_routing: true, dimensions: {} }));
  await assert.rejects(createHumanReviewEvent(base(f)), /malformed or not explicitly unapproved/);
});

test("rejects assessment report carrying unknown decision fields", async t => {
  const f = await fixture(t, { valid: true, approved_for_routing: false, reviewer: "auto", dimensions: {} });
  await assert.rejects(createHumanReviewEvent(base(f)), /review-event fields/);
});
