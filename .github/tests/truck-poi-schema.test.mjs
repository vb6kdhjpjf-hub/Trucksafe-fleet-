import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = JSON.parse(await readFile("docs/product/truck-poi.schema.json", "utf8"));

test("normalized POI schema is versioned and rejects unknown fields", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema_version.const, 1);
  assert.equal(schema.additionalProperties, false);
  for (const field of ["poi_id", "name", "category", "geometry", "truck_access_status", "source", "observed_at", "last_checked_at"]) {
    assert.ok(schema.required.includes(field), `missing required field: ${field}`);
  }
});

test("POI taxonomy includes fuel, food, rest, repair, freight, and driver essentials", () => {
  const categories = schema.properties.category.enum;
  for (const category of ["fuel", "food", "truck_parking", "rest_area", "truck_workshop", "tire_service", "truck_wash", "weighbridge", "logistics_hub", "lodging", "pharmacy"]) {
    assert.ok(categories.includes(category));
  }
});

test("POI coordinates are bounded to the currently supported Israel region", () => {
  const point = schema.$defs.point;
  assert.equal(point.properties.latitude.minimum, 29);
  assert.equal(point.properties.latitude.maximum, 34);
  assert.equal(point.properties.longitude.minimum, 34);
  assert.equal(point.properties.longitude.maximum, 36);
});

test("vehicle limits and operational capabilities are explicit", () => {
  for (const key of ["max_height_cm", "max_width_cm", "max_length_cm", "max_gross_weight_kg", "max_axle_weight_kg"]) {
    assert.ok(key in schema.properties.vehicle_limits.properties);
  }
  for (const capability of ["diesel", "adblue", "toilets", "showers", "secure_parking", "truck_wash", "weighbridge", "tires"]) {
    assert.ok(schema.properties.capabilities.items.enum.includes(capability));
  }
});

test("parking availability requires its own timestamp and source fields", () => {
  const parking = schema.properties.parking.properties;
  assert.ok("available_spaces" in parking);
  assert.ok("availability_checked_at" in parking);
  assert.ok("availability_source" in parking);
});

test("source licensing and access evidence are distinct trust records", () => {
  const source = schema.properties.source;
  const evidence = schema.properties.truck_access_evidence;
  assert.ok(source.required.includes("license_review_status"));
  assert.deepEqual(source.properties.license_review_status.enum, ["approved", "pending", "rejected"]);
  assert.ok(evidence.required.includes("verified_at"));
  assert.ok(evidence.required.includes("expires_at"));
});
