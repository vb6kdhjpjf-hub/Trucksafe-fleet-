import assert from "node:assert/strict";
import test from "node:test";
import { getDemoRoadEvents, getVisibleDemoRoadEvents } from "../../lib/road-event-demo.mjs";

test("demo feed contains only synthetic operational safety examples", () => {
  const events = getDemoRoadEvents(1_800_000_000_000);
  assert.equal(events.length, 3);
  assert.ok(events.every(event => event.event_id.startsWith("demo-")));
  assert.ok(events.every(event => !["police", "checkpoint", "speed_trap", "patrol"].includes(event.event_type)));
});

test("visible demo events exclude expired and rejected events", () => {
  const now = 1_800_000_000_000;
  const visible = getVisibleDemoRoadEvents(getDemoRoadEvents(now), now);
  assert.deepEqual(visible.map(event => event.event_id), ["demo-road-event-001", "demo-road-event-002"]);
});

test("demo event visibility rejects invalid coordinates and expiry", () => {
  const now = 1_800_000_000_000;
  const base = getDemoRoadEvents(now)[0];
  assert.equal(getVisibleDemoRoadEvents([{ ...base, latitude: 40 }], now).length, 0);
  assert.equal(getVisibleDemoRoadEvents([{ ...base, expires_at: "invalid" }], now).length, 0);
  assert.equal(getVisibleDemoRoadEvents([{ ...base, state: "rejected" }], now).length, 0);
});


test("nearest vehicle distance uses only fresh, valid Israel GPS points", async () => {
  const { getNearestFreshVehicleLocation } = await import("../../lib/road-event-demo.mjs");
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  const event = { latitude: 32.8234, longitude: 35.5031 };
  const result = getNearestFreshVehicleLocation(event, [
    { driver: "נהג ישן", latitude: 32.8235, longitude: 35.5031, recorded_at: new Date(now - 180_000).toISOString() },
    { driver: "נהג קרוב", vehicle: "משאית 1", latitude: 32.8240, longitude: 35.5031, recorded_at: new Date(now - 30_000).toISOString() },
    { driver: "נהג רחוק", latitude: 32.9, longitude: 35.6, recorded_at: new Date(now - 10_000).toISOString() }
  ], now);
  assert.equal(result.driver, "נהג קרוב");
  assert.equal(result.vehicle, "משאית 1");
  assert.ok(result.distanceKm > 0 && result.distanceKm < 0.1);
});

test("nearest vehicle distance returns null for stale, future or out-of-bounds GPS", async () => {
  const { getNearestFreshVehicleLocation } = await import("../../lib/road-event-demo.mjs");
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  const event = { latitude: 32.8234, longitude: 35.5031 };
  const invalid = [
    { latitude: 32.8234, longitude: 35.5031, recorded_at: new Date(now - 121_000).toISOString() },
    { latitude: 32.8234, longitude: 35.5031, recorded_at: new Date(now + 60_000).toISOString() },
    { latitude: 40, longitude: 35.5031, recorded_at: new Date(now).toISOString() }
  ];
  assert.equal(getNearestFreshVehicleLocation(event, invalid, now), null);
  assert.equal(getNearestFreshVehicleLocation({ latitude: 40, longitude: 35 }, [], now), null);
});


test("visible demo events reject inconsistent trust labels, timestamps, confidence and payloads", () => {
  const now = 1_800_000_000_000;
  const base = getDemoRoadEvents(now)[0];
  const invalidEvents = [
    { ...base, verification_state: "unverified" },
    { ...base, state: "corroborating", verification_state: "authoritative" },
    { ...base, observed_at: new Date(now + 60_000).toISOString() },
    { ...base, expires_at: new Date(now - 1).toISOString() },
    { ...base, confidence: 101 },
    { ...base, severity: "unknown" },
    { ...base, event_type: "checkpoint" },
    { ...base, driver_message: " " }
  ];
  for (const event of invalidEvents) {
    assert.equal(getVisibleDemoRoadEvents([event], now).length, 0);
  }
});

test("demo confidence follows the canonical integer percentage scale", () => {
  const events = getDemoRoadEvents(1_800_000_000_000);
  assert.deepEqual(events.map(event => event.confidence), [98, 72, 30]);
});


test("demo feed never labels synthetic events as official-source reports", () => {
  const events = getDemoRoadEvents(1_800_000_000_000);
  assert.ok(events.every(event => !/מקור רשמי/.test(event.source_label)));
  assert.ok(events.every(event => /הדגמה|מדומה|דוגמה|לא מאומת/.test(event.source_label)));
});
