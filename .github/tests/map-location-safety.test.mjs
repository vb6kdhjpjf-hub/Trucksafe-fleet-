import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { isFreshGpsTimestamp, isValidIsraelGpsCoordinates, isValidIsraelGpsPoint, pruneInactiveTripHistory } from "../../lib/map-location-safety.mjs";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const validPoint = {
  latitude: 32.8,
  longitude: 35.5,
  recorded_at: "2026-11-17T11:59:00.000Z"
};

test("accepts a timestamped GPS point inside Israel bounds", () => {
  assert.equal(isValidIsraelGpsPoint(validPoint, now), true);
});

test("rejects coordinates outside the Israel operating bounds", () => {
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, latitude: 40 }, now), false);
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, longitude: 33.9 }, now), false);
});

test("rejects missing, malformed, and future GPS timestamps beyond clock skew", () => {
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, recorded_at: null }, now), false);
  assert.equal(isValidIsraelGpsPoint({ ...validPoint, recorded_at: "not-a-date" }, now), false);
  assert.equal(isValidIsraelGpsPoint({
    ...validPoint, recorded_at: "2026-11-17T12:00:30.001Z"
  }, now), false);
  assert.equal(isValidIsraelGpsPoint({
    ...validPoint, recorded_at: "2026-11-17T12:00:30.000Z"
  }, now), true);
});

test("prunes cached GPS history for trips that are no longer active", () => {
  const cache = new Map([
    ["active-trip", [{ latitude: 32.8, longitude: 35.5 }]],
    ["completed-trip", [{ latitude: 32.7, longitude: 35.4 }]]
  ]);
  const removed = pruneInactiveTripHistory(cache, new Set(["active-trip"]));
  assert.equal(removed, 1);
  assert.equal(cache.has("active-trip"), true);
  assert.equal(cache.has("completed-trip"), false);
});

test("does not mutate a cache when inputs are not valid collections", () => {
  const cache = new Map([["trip", []]]);
  assert.equal(pruneInactiveTripHistory(cache, []), 0);
  assert.equal(cache.size, 1);
});

test("GPS capture accepts only coordinates inside the Israel operating bounds", () => {
  assert.equal(isValidIsraelGpsCoordinates(32.8, 35.5), true);
  assert.equal(isValidIsraelGpsCoordinates(28.9, 35.5), false);
  assert.equal(isValidIsraelGpsCoordinates(32.8, 36.1), false);
});

test("GPS capture rejects stale, future, and malformed device timestamps", () => {
  const nowMs = 1_800_000_000_000;
  assert.equal(isFreshGpsTimestamp(nowMs, nowMs), true);
  assert.equal(isFreshGpsTimestamp(nowMs - 60_000, nowMs), true);
  assert.equal(isFreshGpsTimestamp(nowMs - 60_001, nowMs), false);
  assert.equal(isFreshGpsTimestamp(nowMs + 30_000, nowMs), true);
  assert.equal(isFreshGpsTimestamp(nowMs + 30_001, nowMs), false);
  assert.equal(isFreshGpsTimestamp(NaN, nowMs), false);
});


test("map bootstrap cannot restore fleet data after an auth-generation change", async () => {
  const source = await readFile("app/map/page.js", "utf8");
  assert.match(source, /const initialAuthGeneration = authGenerationRef\.current/);
  assert.match(source, /if \(!alive \|\| initialAuthGeneration !== authGenerationRef\.current\) return/);
  assert.match(source, /await loadLocations\(workspace\.fleet\.id, initialAuthGeneration\)/);
  assert.match(source, /if \(alive && initialAuthGeneration === authGenerationRef\.current\) setLoading\(false\)/);
});


test("GPS capture prevents overlapping asynchronous location writes", async () => {
  const source = await readFile("app/tasks/page.js", "utf8");
  assert.match(source, /const locationWriteInFlightRef = useRef\(false\)/);
  assert.match(source, /if \(locationWriteInFlightRef\.current \|\| now - lastLocationWriteRef\.current < 10000\) return/);
  assert.match(source, /locationWriteInFlightRef\.current = true/);
  assert.match(source, /finally \{\s*locationWriteInFlightRef\.current = false;\s*\}/);
});


test("tasks bootstrap cannot restore private data after an auth-generation change", async () => {
  const source = await readFile("app/tasks/page.js", "utf8");
  assert.match(source, /const initialAuthGeneration = authGenerationRef\.current/);
  assert.match(source, /if \(!alive \|\| initialAuthGeneration !== authGenerationRef\.current\) return/);
  assert.match(source, /await loadWorkspace\(data\.session\.user, initialAuthGeneration\)/);
  assert.match(source, /if \(alive && initialAuthGeneration === authGenerationRef\.current\) setLoading\(false\)/);
});


test("map location refreshes are isolated across fleet and auth generations", async () => {
  const source = await readFile("app/map/page.js", "utf8");
  assert.match(source, /const loadingLocations = useRef\(new Map\(\)\)/);
  assert.match(source, /const locationRequestGenerationRef = useRef\(0\)/);
  assert.match(source, /const activeFleetIdRef = useRef\(null\)/);
  assert.match(source, /if \(activeFleetIdRef\.current !== id\)/);
  assert.match(source, /requestGeneration !== locationRequestGenerationRef\.current \|\| activeFleetIdRef\.current !== id/);
  assert.match(source, /if \(loadingLocations\.current\.get\(id\) === requestGeneration\) loadingLocations\.current\.delete\(id\)/);
  assert.match(source, /locationRequestGenerationRef\.current \+= 1;\s*activeFleetIdRef\.current = null;\s*historyByTrip\.current\.clear\(\)/);
});


test("stale map responses cannot mutate shared GPS history before generation validation", async () => {
  const source = await readFile("app/map/page.js", "utf8");
  const localHistory = source.indexOf("const nextHistoryByTrip = new Map(historyByTrip.current)");
  const historyCommit = source.indexOf("historyByTrip.current = nextHistoryByTrip");
  const generationGuard = source.indexOf("requestGeneration !== locationRequestGenerationRef.current", localHistory);
  assert.ok(localHistory >= 0);
  assert.ok(generationGuard > localHistory);
  assert.ok(historyCommit > generationGuard);
  assert.ok(source.indexOf("nextHistoryByTrip.set(trip.id, history)") > localHistory);
});


test("map clears private state and reloads when authenticated identity changes", async () => {
  const source = await readFile("app/map/page.js", "utf8");
  assert.match(source, /const authUserIdRef = useRef\(null\)/);
  assert.match(source, /nextUserId !== authUserIdRef\.current/);
  assert.match(source, /authUserIdRef\.current = nextUserId/);
  assert.match(source, /if \(typeof window !== "undefined"\) window\.location\.reload\(\)/);
  assert.match(source, /if \(!nextSession\) \{\s*authUserIdRef\.current = null/);
});



test("tasks clears private state and restarts on authenticated identity changes", async () => {
  const source = await readFile("app/tasks/page.js", "utf8");
  assert.ok(source.includes("const authUserIdRef = useRef(null)"));
  assert.ok(source.includes("nextUserId !== authUserIdRef.current"));
  assert.ok(source.includes("authUserIdRef.current = nextUserId"));
  assert.ok(source.includes('window.location.reload()'));
  assert.ok(source.includes("if (!nextSession)"));
  assert.ok(source.includes("setForm(emptyForm); setShowForm(false); setBusy(false)"));
});

test("driver management clears private state and restarts on auth identity changes", async () => {
  const source = await readFile("app/drivers/page.js", "utf8");
  assert.ok(source.includes("const authUserIdRef = useRef(null)"));
  assert.ok(source.includes("nextUserId !== authUserIdRef.current"));
  assert.ok(source.includes("authUserIdRef.current = nextUserId"));
  assert.ok(source.includes("window.location.reload()"));
  assert.ok(source.includes("initialAuthGeneration !== authGenerationRef.current"));
});

test("shipment management invalidates in-flight private data on auth identity changes", async () => {
  const source = await readFile("app/shipments/page.js", "utf8");
  assert.ok(source.includes("const authUserIdRef=useRef(null)"));
  assert.ok(source.includes("nextUserId!==authUserIdRef.current"));
  assert.ok(source.includes("authUserIdRef.current=nextUserId"));
  assert.ok(source.includes("clearPrivateState();"));
  assert.ok(source.includes("const initialAuthGeneration=authGenerationRef.current"));
  assert.ok(source.includes("initialAuthGeneration!==authGenerationRef.current"));
  assert.ok(source.includes("window.location.reload()"));
});

test("incident management invalidates stale private queries on auth identity changes", async () => {
  const source = await readFile("app/incidents/page.js", "utf8");
  assert.ok(source.includes("const authUserIdRef = useRef(null)"));
  assert.ok(source.includes("nextUserId !== authUserIdRef.current"));
  assert.ok(source.includes("initialAuthGeneration !== authGenerationRef.current"));
  assert.ok(source.includes("authGeneration !== authGenerationRef.current"));
  assert.ok(source.includes("window.location.reload()"));
});
