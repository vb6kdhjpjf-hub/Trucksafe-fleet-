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
