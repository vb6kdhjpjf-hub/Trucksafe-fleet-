import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeRejectedRouteCandidates,
  formatRejectedRouteMessages
} from "../../lib/truck-route-rejection.mjs";

test("summarizes only bounded, user-safe route rejection details", () => {
  const result = summarizeRejectedRouteCandidates([{
    reason: "unresolved_fleet_restrictions",
    restrictionCheck: {
      conflicts: [{ roadName: "כביש בדיקה".repeat(40), restrictionType: "height" }],
      unresolved: [{ roadName: "מעבר בדיקה", reason: "height_clearance_evidence_incomplete" }]
    },
    secret: "must-not-leak"
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].conflicts[0].roadName.length, 120);
  assert.equal(result[0].unresolved[0].reason, "height_clearance_evidence_incomplete");
  assert.equal("secret" in result[0], false);
});

test("formats clear Hebrew explanations for missing bridge evidence and route conflicts", () => {
  const messages = formatRejectedRouteMessages([{
    reason: "unresolved_fleet_restrictions",
    conflicts: [],
    unresolved: [{ roadName: "כביש 90", reason: "height_clearance_evidence_incomplete" }]
  }, {
    reason: "fleet_restriction_conflict",
    conflicts: [{ roadName: "כביש 65", restrictionType: "height" }],
    unresolved: []
  }]);
  assert.ok(messages.some(message => message.includes("גובה המעבר אינו מאומת")));
  assert.ok(messages.some(message => message.includes("כביש 65") && message.includes("התנגשות")));
});

test("handles malformed and unknown rejection details without throwing", () => {
  assert.deepEqual(formatRejectedRouteMessages(null), []);
  assert.deepEqual(summarizeRejectedRouteCandidates(null), []);
  assert.ok(formatRejectedRouteMessages([{ reason: "unknown_reason" }])[0].includes("נדחתה"));
});

test("caps candidate and message counts", () => {
  const candidates = Array.from({ length: 10 }, () => ({
    reason: "unknown_reason",
    conflicts: Array.from({ length: 10 }, () => ({ roadName: "road" })),
    unresolved: Array.from({ length: 10 }, () => ({ reason: "unknown" }))
  }));
  assert.equal(summarizeRejectedRouteCandidates(candidates).length, 5);
  assert.equal(formatRejectedRouteMessages(candidates).length, 12);
});

test("explains fail-closed catalogue, stale verification, and invalid route evidence in Hebrew", () => {
  const messages = formatRejectedRouteMessages([{
    reason: "unresolved_fleet_restrictions",
    conflicts: [],
    unresolved: [
      { roadName: "כביש 77", reason: "restriction_catalog_unavailable" },
      { roadName: "כביש 6", reason: "restriction_verification_stale_or_invalid" },
      { roadName: "מעבר צפון", reason: "route_geometry_outside_supported_israel_bounds" },
      { roadName: "כביש 65", reason: "vehicle_profile_incomplete" }
    ]
  }]);
  assert.ok(messages.some(message => message.includes("מאגר מגבלות הדרך אינו זמין")));
  assert.ok(messages.some(message => message.includes("אימות מגבלת הדרך אינו עדכני")));
  assert.ok(messages.some(message => message.includes("חורג מאזור הפעילות המאומת")));
  assert.ok(messages.some(message => message.includes("נתוני מידות או משקל הרכב אינם מלאים")));
});
