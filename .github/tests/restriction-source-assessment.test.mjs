import test from "node:test";
import assert from "node:assert/strict";
import { assessRestrictionSource, RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS } from "../../lib/restriction-source-assessment.mjs";

const completeFixture = () => Object.fromEntries(
  RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS.map(name => [name, {
    status: "evidenced",
    evidence_refs: [`synthetic://evidence/${name}`]
  }])
);

test("treats every omitted dimension as missing and never approves routing", () => {
  const report = assessRestrictionSource({});
  assert.equal(report.valid, true);
  assert.equal(report.evidence_dossier_complete, false);
  assert.deepEqual(report.blocking_gaps, [...RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS]);
  assert.equal(report.approved_for_routing, false);
});

test("reports a complete evidence dossier without asserting truth or routing approval", () => {
  const report = assessRestrictionSource(completeFixture());
  assert.equal(report.valid, true);
  assert.equal(report.evidence_dossier_complete, true);
  assert.deepEqual(report.blocking_gaps, []);
  assert.equal(report.approved_for_routing, false);
});

test("keeps partial evidence as a blocking gap", () => {
  const fixture = completeFixture();
  fixture.measurement_quality = { status: "partial", evidence_refs: ["synthetic://sample"] };
  const report = assessRestrictionSource(fixture);
  assert.equal(report.evidence_dossier_complete, false);
  assert.deepEqual(report.blocking_gaps, ["measurement_quality"]);
});

test("does not accept evidenced status without a reference", () => {
  const fixture = completeFixture();
  fixture.authority = { status: "evidenced", evidence_refs: [] };
  const report = assessRestrictionSource(fixture);
  assert.equal(report.valid, false);
  assert.equal(report.dimensions.authority.status, "partial");
  assert.ok(report.errors.some(error => error.includes("authority cannot be evidenced")));
  assert.equal(report.approved_for_routing, false);
});

test("rejects unknown dimensions, statuses, and malformed references", () => {
  const report = assessRestrictionSource({
    unknown: { status: "evidenced", evidence_refs: ["synthetic://x"] },
    authority: { status: "verified", evidence_refs: [""] }
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(error => error.includes("unsupported assessment dimension")));
  assert.ok(report.errors.some(error => error.includes("authority.status")));
  assert.ok(report.errors.some(error => error.includes("authority.evidence_refs")));
});

test("rejects unexpected keys and references on a missing dimension", () => {
  const report = assessRestrictionSource({
    authority: { status: "missing", evidence_refs: ["synthetic://unreviewed"], trusted: true }
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(error => error.includes("only status and evidence_refs")));
  assert.ok(report.errors.some(error => error.includes("marked missing")));
});

test("rejects non-object input conservatively", () => {
  const report = assessRestrictionSource(null);
  assert.equal(report.valid, false);
  assert.equal(report.approved_for_routing, false);
  assert.deepEqual(report.blocking_gaps, [...RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS]);
});
