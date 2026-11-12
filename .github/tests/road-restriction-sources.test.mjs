import test from "node:test";
import assert from "node:assert/strict";
import { ROAD_RESTRICTION_SOURCES, getRoadRestrictionSource, isSourceCandidateOnly } from "../../lib/road-restriction-sources.mjs";

test("official railway grade-separation dataset is candidate-only and not routing eligible", () => {
  const source = getRoadRestrictionSource("mot-level-separations-rail");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "ofergo@eshed-mtl.co.il");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /גובה מעבר מדוד/);
  assert.equal(isSourceCandidateOnly(source), true);
});

test("height obstacle guidelines are a standard, not a geospatial restriction feed", () => {
  const source = getRoadRestrictionSource("mot-height-obstacle-guidelines-2026");
  assert.ok(source);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("measurement_standard"), true);
  assert.match(source.limitations, /לא מאגר מיקומים ארצי/);
});

test("unknown sources fail closed", () => {
  assert.equal(getRoadRestrictionSource("unknown"), null);
  assert.equal(isSourceCandidateOnly(null), true);
});

test("source registry is immutable", () => {
  assert.equal(Object.isFrozen(ROAD_RESTRICTION_SOURCES), true);
  assert.equal(Object.isFrozen(ROAD_RESTRICTION_SOURCES[0]), true);
});


test("road signing authority GIS is only a contact-discovery source, never a restriction feed", () => {
  const source = getRoadRestrictionSource("mot-road-signing-authority");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "pinusi@mot.gov.il");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /אינה מפרטת חסימות/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry road-safety infrastructure document is a data specification, not a live restriction feed", () => {
  const source = getRoadRestrictionSource("mot-road-safety-infrastructure-spec-2025");
  assert.ok(source);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("layer_specification"), true);
  assert.match(source.limitations, /לא קובץ נתונים ארצי/);
});

test("Netivei Israel inventory page is an acquisition lead requiring direct permission and coverage checks", () => {
  const source = getRoadRestrictionSource("netivei-israel-infrastructure-inventory-lead");
  assert.ok(source);
  assert.equal(source.contact, "MeyJ@iroads.co.il");
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /נדרש אישור ישיר/);
});

test("Tel Aviv bridge GIS is local candidate geometry without measured clearance or confirmed commercial licence", () => {
  const source = getRoadRestrictionSource("tel-aviv-municipal-bridge-gis");
  assert.ok(source);
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /ללא גובה מעבר מדוד/);
});


test("regional out-of-service bridge roadblocks layer is candidate-only and has no measured truck clearance or national coverage", () => {
  const source = getRoadRestrictionSource("regional-out-of-service-bridge-roadblocks-arcgis");
  assert.ok(source);
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("regional_bridge_roadblocks"), true);
  assert.match(source.limitations, /אזור קטן/);
  assert.match(source.limitations, /ללא גובה מעבר מדוד/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry geospatial planning portal is discovery-only and explicitly non-authoritative for truck restrictions", () => {
  const source = getRoadRestrictionSource("mot-geospatial-transport-planning-portal");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "geo@mot.gov.il");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("geospatial_layer_discovery"), true);
  assert.match(source.limitations, /אינו נוסח מחייב או מידע מחייב/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry road-tunnel GIS is national candidate-asset discovery only and has a metadata freshness discrepancy", () => {
  const source = getRoadRestrictionSource("mot-road-tunnels-gis");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "geo@mot.gov.il");
  assert.equal(source.lastPublished, "2026-06-01");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("road_tunnel_geometry"), true);
  assert.match(source.limitations, /נובמבר 2022/);
  assert.match(source.limitations, /אין בו.*גובה מעבר מדוד/);
  assert.equal(isSourceCandidateOnly(source), true);
});
