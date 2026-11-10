import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAssessmentReport } from "../../scripts/assess-staged-restriction-source.mjs";
import { RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS } from "../../lib/restriction-source-assessment.mjs";

test("creates a separate conservative report without modifying the candidate", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-assess-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "reports"); await mkdir(outputDir);
  const candidateFile = path.join(root, "candidate.json");
  const assessmentFile = path.join(root, "assessment.json");
  const candidate = { payload_sha256: "a".repeat(64), review: { status: "unreviewed", approved_for_routing: false }, payload: { fixture: true } };
  await writeFile(candidateFile, JSON.stringify(candidate));
  const assessment = Object.fromEntries(RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS.map(key => [key, { status: "evidenced", evidence_refs: ["synthetic://" + key] }]));
  await writeFile(assessmentFile, JSON.stringify(assessment));
  const result = await createAssessmentReport({ candidateFile, assessmentFile, outputDir });
  assert.equal(result.report.evidence_dossier_complete, true);
  assert.equal(result.report.approved_for_routing, false);
  assert.deepEqual(JSON.parse(await readFile(candidateFile, "utf8")), candidate);
  assert.equal(JSON.parse(await readFile(result.output, "utf8")).approved_for_routing, false);
});

test("defaults incomplete evidence to blocking gaps and never overwrites a report", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-assess-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "reports"); await mkdir(outputDir);
  const candidateFile = path.join(root, "candidate.json");
  const assessmentFile = path.join(root, "assessment.json");
  await writeFile(candidateFile, JSON.stringify({ payload_sha256: "b".repeat(64), review: { approved_for_routing: false } }));
  await writeFile(assessmentFile, "{}");
  const result = await createAssessmentReport({ candidateFile, assessmentFile, outputDir });
  assert.equal(result.report.evidence_dossier_complete, false);
  assert.equal(result.report.blocking_gaps.length, 9);
  await assert.rejects(createAssessmentReport({ candidateFile, assessmentFile, outputDir }), { code: "EEXIST" });
});

test("rejects a candidate not explicitly marked unapproved", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-assess-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "reports"); await mkdir(outputDir);
  const candidateFile = path.join(root, "candidate.json"); const assessmentFile = path.join(root, "assessment.json");
  await writeFile(candidateFile, JSON.stringify({ payload_sha256: "c".repeat(64), review: { approved_for_routing: true } }));
  await writeFile(assessmentFile, "{}");
  await assert.rejects(createAssessmentReport({ candidateFile, assessmentFile, outputDir }), /not explicitly unapproved/);
});
