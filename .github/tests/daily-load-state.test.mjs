import test from "node:test";
import assert from "node:assert/strict";
import { createDailyLoadState, applyDailyLoadOperation } from "../../lib/daily-load-state.mjs";

const initial = {
  tareWeightKg: 9000,
  registeredGrossLimitKg: 26000,
  registeredAxleLimitKg: 10000,
  currentGrossWeightKg: 21000,
  currentHeaviestAxleKg: 8500,
  measuredAt: "2026-11-12T05:00:00.000Z",
  measurementSource: "weighbridge_ticket",
  measurementReference: "WB-1001",
};

function state() {
  const result = createDailyLoadState(initial);
  assert.equal(result.ok, true);
  return result.state;
}

function operation(overrides = {}) {
  return {
    eventId: "stop-1-operation-1",
    kind: "unload",
    quantityKg: 3000,
    measuredGrossWeightKg: 18000,
    measuredHeaviestAxleKg: 7200,
    measuredAt: "2026-11-12T06:00:00.000Z",
    measurementSource: "certified_onboard_scale",
    measurementReference: "SCALE-READING-001",
    expectedRevision: 0,
    ...overrides,
  };
}

test("creates a daily load snapshot only from verified, physically plausible readings", () => {
  assert.equal(createDailyLoadState(initial).ok, true);
  assert.equal(createDailyLoadState({ ...initial, currentGrossWeightKg: 8000 }).reason, "invalid_initial_measurement");
  assert.equal(createDailyLoadState({ ...initial, measurementSource: "driver_estimate" }).reason, "invalid_initial_measurement");
  assert.equal(createDailyLoadState({ ...initial, measurementReference: " " }).reason, "invalid_initial_measurement");
});

test("applies a measured unloading operation and advances the revision", () => {
  const result = applyDailyLoadOperation(state(), operation());
  assert.equal(result.ok, true);
  assert.equal(result.state.currentGrossWeightKg, 18000);
  assert.equal(result.state.currentHeaviestAxleKg, 7200);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.events.length, 1);
});

test("applies sequential loading and unloading without resetting the daily state", () => {
  const first = applyDailyLoadOperation(state(), operation());
  const second = applyDailyLoadOperation(first.state, operation({
    eventId: "stop-2-operation-1",
    kind: "load",
    quantityKg: 2000,
    measuredGrossWeightKg: 20000,
    measuredHeaviestAxleKg: 8800,
    expectedRevision: 1,
    measurementReference: "SCALE-READING-002",
  }));
  assert.equal(second.ok, true);
  assert.equal(second.state.currentGrossWeightKg, 20000);
  assert.equal(second.state.events.length, 2);
  assert.equal(second.state.revision, 2);
});

test("rejects duplicate events and stale revisions", () => {
  const first = applyDailyLoadOperation(state(), operation());
  assert.equal(applyDailyLoadOperation(first.state, operation({ expectedRevision: 1 })).reason, "duplicate_event");
  assert.equal(applyDailyLoadOperation(first.state, operation({
    eventId: "different-id",
    expectedRevision: 0,
  })).reason, "stale_revision");
});

test("rejects unloading more cargo than remains", () => {
  assert.equal(applyDailyLoadOperation(state(), operation({
    quantityKg: 13000,
    measuredGrossWeightKg: 8000,
  })).reason, "unload_exceeds_cargo");
});

test("rejects overloads and measured gross weight inconsistent with the operation", () => {
  assert.equal(applyDailyLoadOperation(state(), operation({
    kind: "load",
    quantityKg: 6000,
    measuredGrossWeightKg: 27000,
  })).reason, "gross_limit_exceeded");
  assert.equal(applyDailyLoadOperation(state(), operation({
    measuredGrossWeightKg: 19000,
  })).reason, "gross_measurement_mismatch");
});

test("requires a fresh measured axle load after every load operation", () => {
  assert.equal(applyDailyLoadOperation(state(), operation({
    measuredHeaviestAxleKg: 11000,
  })).reason, "axle_limit_exceeded");
  assert.equal(applyDailyLoadOperation(state(), operation({
    measurementSource: "estimated_from_cargo_delta",
  })).reason, "verified_measurement_required");
  assert.equal(applyDailyLoadOperation(state(), operation({
    measuredHeaviestAxleKg: undefined,
  })).reason, "verified_measurement_required");
});
