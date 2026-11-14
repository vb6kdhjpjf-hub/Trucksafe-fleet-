import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDeliveryGpsCoordinates } from "../../lib/delivery-gps.mjs";

test("normalizes valid GPS coordinates to the database's six-decimal precision", () => {
  assert.deepEqual(normalizeDeliveryGpsCoordinates(32.8123456, 35.5123456), {
    latitude: 32.812346,
    longitude: 35.512346
  });
});

test("accepts valid coordinate boundaries", () => {
  assert.deepEqual(normalizeDeliveryGpsCoordinates(-90, -180), { latitude: -90, longitude: -180 });
  assert.deepEqual(normalizeDeliveryGpsCoordinates(90, 180), { latitude: 90, longitude: 180 });
});

test("rejects missing, non-numeric, non-finite and out-of-range coordinates", () => {
  for (const pair of [
    [null, 35], [32, null], ["32", 35], [32, "35"],
    [NaN, 35], [32, Infinity], [-90.000001, 0], [0, 180.000001]
  ]) {
    assert.equal(normalizeDeliveryGpsCoordinates(...pair), null);
  }
});
