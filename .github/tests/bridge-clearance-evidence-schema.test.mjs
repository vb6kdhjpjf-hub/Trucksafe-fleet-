import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = JSON.parse(await readFile(
  new URL("../../docs/data-sourcing/bridge-clearance-measurement.schema.json", import.meta.url),
  "utf8"
));

test("bridge clearance evidence is a per-lane, per-direction physical survey contract", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  for (const field of [
    "structure_id", "road_segment_id", "direction", "lane_id",
    "measured_clearance_m", "posted_clearance_status", "posted_clearance_m",
    "measurement_date", "measurement_accuracy_cm", "measurement_method",
    "surveyor", "measurement_reference", "measurement_coverage",
    "authority_name", "authority_reference"
  ]) assert.ok(schema.required.includes(field), `missing required evidence field: ${field}`);
  assert.deepEqual(schema.properties.direction.enum, ["forward", "backward"]);
  assert.equal(schema.properties.measurement_accuracy_cm.maximum, 1);
  assert.equal(schema.properties.measurement_coverage.properties.both_sides_measured.const, true);
  assert.equal(schema.properties.measurement_coverage.properties.lane_center_measured.const, true);
  assert.equal(schema.properties.measurement_coverage.properties.left_edge_measured.const, true);
  assert.equal(schema.properties.measurement_coverage.properties.right_edge_measured.const, true);
  assert.equal(schema.properties.measurement_coverage.properties.hanging_installations_checked.const, true);
  assert.equal(schema.properties.approved_for_routing.const, false);
});

test("long passages require a centre measurement and posted values remain distinct", () => {
  const longPassageRule = schema.allOf.find(rule =>
    rule.if?.properties?.passage_length_m?.exclusiveMinimum === 20
  );
  assert.ok(longPassageRule);
  assert.equal(longPassageRule.then.properties.measurement_coverage.properties.passage_center_measured.const, true);
  const postedRule = schema.allOf.find(rule =>
    rule.if?.properties?.posted_clearance_status?.const === "posted"
  );
  const unknownRule = schema.allOf.find(rule =>
    rule.if?.properties?.posted_clearance_status?.enum?.includes("unknown")
  );
  assert.equal(postedRule.then.properties.posted_clearance_m.type, "number");
  assert.equal(unknownRule.then.properties.posted_clearance_m.type, "null");
});
