import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = JSON.parse(await readFile("docs/product/road-event.schema.json", "utf8"));

test("road-event contract has a closed, versioned envelope", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema_version.const, 1);
  assert.equal(schema.additionalProperties, false);
  for (const key of ["event_id", "event_type", "state", "verification_state", "source_class", "geometry", "observed_at", "received_at", "expires_at", "confidence", "severity", "driver_message"]) {
    assert.ok(schema.required.includes(key), `missing required event field: ${key}`);
  }
});

test("road-event taxonomy is limited to operational road safety", () => {
  const types = schema.properties.event_type.enum;
  for (const allowed of ["crash", "road_hazard", "weather_hazard", "roadworks", "lane_closure", "road_closure", "temporary_truck_restriction", "traffic_control"]) {
    assert.ok(types.includes(allowed));
  }
  for (const prohibited of ["police", "checkpoint", "speed_trap", "patrol", "enforcement_location"]) {
    assert.ok(!types.includes(prohibited), `prohibited tactical event type present: ${prohibited}`);
  }
});

test("road-event payload does not accept client-supplied actor identity or private fleet fields", () => {
  for (const key of ["reporter_id", "reviewer_id", "created_by", "driver_id", "fleet_id", "vehicle_registration", "access_token"]) {
    assert.ok(!(key in schema.properties), `untrusted/private field must not be part of public event envelope: ${key}`);
  }
  assert.equal(schema.additionalProperties, false);
});

test("road-event geometry is bounded to supported Israel coordinates", () => {
  const variants = schema.properties.geometry.oneOf;
  assert.equal(variants.length, 2);
  const point = variants.find(item => item.properties.kind.const === "point");
  const segment = variants.find(item => item.properties.kind.const === "segment");
  for (const coordinate of [point.properties, segment.properties.start.properties, segment.properties.end.properties]) {
    assert.equal(coordinate.latitude.minimum, 29);
    assert.equal(coordinate.latitude.maximum, 34);
    assert.equal(coordinate.longitude.minimum, 34);
    assert.equal(coordinate.longitude.maximum, 36);
  }
});

test("event expiry and verification are explicit and separate from confidence", () => {
  assert.ok(schema.required.includes("expires_at"));
  assert.ok(schema.required.includes("verification_state"));
  assert.ok(schema.required.includes("confidence"));
  assert.deepEqual(schema.properties.verification_state.enum, ["unverified", "corroborated", "authoritative", "rejected"]);
  assert.deepEqual(schema.properties.state.enum, ["reported", "corroborating", "verified", "expired", "rejected", "withdrawn"]);
});
