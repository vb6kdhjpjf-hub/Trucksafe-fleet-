import test from "node:test";
import assert from "node:assert/strict";
import { ROAD_RESTRICTION_SOURCES, getRoadRestrictionSource, isSourceCandidateOnly } from "../../lib/road-restriction-sources.mjs";

test("official railway grade-separation dataset is candidate-only and not routing eligible", () => {
  const source = getRoadRestrictionSource("mot-level-separations-rail");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "ofergo@eshed-mtl.co.il");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /גובה מעבר מדוד/);
  assert.equal(isSourceCandidateOnly(source), true);
});

test("height obstacle guidelines are a standard, not a geospatial restriction feed", () => {
  const source = getRoadRestrictionSource("mot-height-obstacle-guidelines-2026");
  assert.ok(source);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("measurement_standard"), true);
  assert.match(source.limitations, /לא מאגר מיקומים ארצי/);
});

test("unknown sources fail closed", () => {
  assert.equal(getRoadRestrictionSource("unknown"), null);
  assert.equal(isSourceCandidateOnly(null), true);
});

test("source registry is immutable", () => {
  assert.equal(Object.isFrozen(ROAD_RESTRICTION_SOURCES), true);
  assert.equal(Object.isFrozen(ROAD_RESTRICTION_SOURCES[0]), true);
});
