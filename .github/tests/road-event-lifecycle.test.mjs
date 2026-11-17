import assert from "node:assert/strict";
import test from "node:test";
import {
  transitionRoadEventState,
  validateRoadEventForPublication
} from "../../lib/road-event-lifecycle.mjs";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const freshnessPolicy = { maxConfirmationAgeMs: 5 * 60_000 };
const baseEvent = Object.freeze({
  schema_version: 1,
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  event_type: "road_hazard",
  state: "verified",
  verification_state: "authoritative",
  source_class: "official_authority",
  geometry: { kind: "point", latitude: 32.8, longitude: 35.5 },
  observed_at: new Date(now - 60_000).toISOString(),
  received_at: new Date(now - 30_000).toISOString(),
  last_confirmed_at: new Date(now - 10_000).toISOString(),
  expires_at: new Date(now + 5 * 60_000).toISOString(),
  confidence: 95,
  severity: "high",
  driver_message: "מפגע בכביש, יש להאט"
});

test("only current, verified authoritative events pass publication policy", () => {
  assert.deepEqual(validateRoadEventForPublication(baseEvent, now, freshnessPolicy), {
    valid: true,
    reason: "verified_current_event"
  });
});

test("driver and dispatcher reports cannot self-declare authoritative verification", () => {
  for (const source_class of ["driver_report", "fleet_dispatcher"]) {
    const result = validateRoadEventForPublication({ ...baseEvent, source_class }, now, freshnessPolicy);
    assert.equal(result.valid, false);
    assert.equal(result.reason, "authority_source_mismatch");
  }
});

test("corroborated events require independent server-derived corroboration count", () => {
  const event = {
    ...baseEvent,
    verification_state: "corroborated",
    source_class: "driver_report"
  };
  assert.equal(validateRoadEventForPublication(event, now, freshnessPolicy).reason, "insufficient_independent_corroboration");
  assert.equal(validateRoadEventForPublication(event, now, { ...freshnessPolicy, independentCorroborationCount: 1 }).valid, false);
  assert.equal(validateRoadEventForPublication(event, now, { ...freshnessPolicy, independentCorroborationCount: 2 }).valid, true);
});

test("stale, unverified, expired and malformed events fail closed", () => {
  assert.equal(validateRoadEventForPublication({ ...baseEvent, state: "corroborating" }, now, freshnessPolicy).reason, "not_verified");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, last_confirmed_at: null }, now, freshnessPolicy).reason, "stale_or_missing_confirmation");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, expires_at: new Date(now).toISOString() }, now, freshnessPolicy).reason, "expired");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, geometry: { kind: "point", latitude: 40, longitude: 35 } }, now, freshnessPolicy).reason, "invalid_geometry");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, received_at: "not-a-date" }, now, freshnessPolicy).reason, "invalid_timestamps");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, event_type: "checkpoint" }, now, freshnessPolicy).reason, "unsupported_classification");
  assert.equal(validateRoadEventForPublication({ ...baseEvent, driver_message: "<script>" + "x".repeat(300) }, now, freshnessPolicy).reason, "invalid_driver_payload");
});

test("verified events require non-zero line geometry and bounded Israel coordinates", () => {
  const segment = {
    ...baseEvent,
    geometry: {
      kind: "segment",
      start: { latitude: 32.8, longitude: 35.5 },
      end: { latitude: 32.81, longitude: 35.51 }
    }
  };
  assert.equal(validateRoadEventForPublication(segment, now, freshnessPolicy).valid, true);
  assert.equal(validateRoadEventForPublication({
    ...segment,
    geometry: { ...segment.geometry, end: segment.geometry.start }
  }, now).reason, "invalid_geometry");
});

test("lifecycle permits only forward, explicit transitions", () => {
  const reported = { ...baseEvent, state: "reported", verification_state: "unverified" };
  assert.equal(transitionRoadEventState(reported, "corroborating", now).ok, true);
  assert.equal(transitionRoadEventState(reported, "verified", now).reason, "transition_not_allowed");

  const corroborating = { ...reported, state: "corroborating", verification_state: "corroborated" };
  assert.equal(transitionRoadEventState(corroborating, "verified", now).reason, "insufficient_independent_corroboration");
  assert.equal(transitionRoadEventState(corroborating, "verified", now, { ...freshnessPolicy, independentCorroborationCount: 2 }).ok, true);
  assert.equal(transitionRoadEventState(corroborating, "verified", now, { independentCorroborationCount: 2 }).reason, "stale_or_missing_confirmation");
  assert.equal(transitionRoadEventState(baseEvent, "reported", now).reason, "transition_not_allowed");
});

test("expiry is enforced and terminal rejected/withdrawn states remain terminal", () => {
  const expired = transitionRoadEventState({ ...baseEvent, state: "reported", expires_at: new Date(now - 1).toISOString() }, "corroborating", now);
  assert.equal(expired.ok, true);
  assert.equal(expired.event.state, "expired");
  assert.equal(transitionRoadEventState({ ...baseEvent, state: "rejected", expires_at: new Date(now - 1).toISOString() }, "expired", now).reason, "transition_not_allowed");
  assert.equal(transitionRoadEventState({ ...baseEvent, state: "withdrawn" }, "verified", now).reason, "transition_not_allowed");
});

test("lifecycle helpers never mutate the caller's event", () => {
  const reported = { ...baseEvent, state: "reported" };
  const original = structuredClone(reported);
  transitionRoadEventState(reported, "corroborating", now);
  assert.deepEqual(reported, original);
});
