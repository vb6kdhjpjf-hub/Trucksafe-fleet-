import test from "node:test";
import assert from "node:assert/strict";
import { ROAD_RESTRICTION_SOURCES, getRoadRestrictionSource, isSourceCandidateOnly } from "../../lib/road-restriction-sources.mjs";

test("official railway grade-separation dataset is candidate-only and not routing eligible", () => {
  const source = getRoadRestrictionSource("mot-level-separations-rail");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "GOLDO@MOT.GOV.IL");
  assert.equal(source.lastPublished, "2024-06-30");
  assert.equal(source.dataTypes.includes("grade_separation_status"), true);
  assert.match(source.limitations, /618 רשומות/);
  assert.match(source.limitations, /אין שדות גובה מעבר/);
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.match(source.limitations, /אין שדות גובה מעבר/);
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

test("OpenStreetMap truck restriction tags remain community-only leads and never approve routing", () => {
  const source = getRoadRestrictionSource("openstreetmap-community-truck-restrictions");
  assert.ok(source);
  assert.equal(source.publisher, "OpenStreetMap contributors");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("community_maxheight"), true);
  assert.match(source.limitations, /נתוני מיפוי קהילתיים ולא מקור רשמי/);
  assert.match(source.limitations, /היעדר תגית אינו מוכיח שאין מגבלה/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry GIS layer catalogue and specification guidance is discovery-only, not a truck restriction feed", () => {
  const source = getRoadRestrictionSource("mot-gis-layer-catalogue-and-spec-guidance-2026");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "geo@mot.gov.il");
  assert.equal(source.lastPublished, "2026-11-11");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("geospatial_layer_catalogue_discovery"), true);
  assert.match(source.limitations, /לא מאגר גשרים או מגבלות משאיות/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry bridge GIS specification is a useful schema lead but not an operational verified restriction dataset", () => {
  const source = getRoadRestrictionSource("mot-bridge-gis-layer-spec-2025");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.contact, "geo@mot.gov.il");
  assert.equal(source.lastPublished, "2025-11-25");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("posted_or_measured_clearance_field"), true);
  assert.equal(source.dataTypes.includes("clearance_source_ambiguous"), true);
  assert.match(source.limitations, /לא מאגר גשרים תפעולי/);
  assert.match(source.limitations, /אי-התאמה בתוך המפרט/);
  assert.match(source.limitations, /אין שדה שמבדיל לכל רשומה/);
  assert.match(source.limitations, /Source ו-D_Update/);
  assert.match(source.limitations, /הדיוק המרחבי של מטר מתייחס למיקום/);
  assert.match(source.limitations, /לא ערך מרווח אנכי מדוד נפרד לכל נתיב/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry 2026 height-obstacle guidelines define lane-level measured clearance survey requirements but are not a data feed", () => {
  const source = getRoadRestrictionSource("mot-height-obstacle-guidelines-2026");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.candidateOnly, false);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("measurement_method"), true);
  assert.match(source.limitations, /דיוק ±1 ס״מ/);
  assert.match(source.limitations, /במרכז כל נתיב/);
  assert.match(source.limitations, /מדידה תקופתית/);
  assert.match(source.limitations, /לא שכבת נתונים בפועל/);
});


test("Tel Aviv municipal roadworks ArcGIS layer is city-scoped event discovery only", () => {
  const source = getRoadRestrictionSource("tel-aviv-municipal-roadworks-arcgis");
  assert.ok(source);
  assert.equal(source.publisher, "עיריית תל אביב-יפו");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("temporary_lane_reduction"), true);
  assert.match(source.limitations, /לתחום תל אביב-יפו בלבד/);
  assert.match(source.limitations, /לא מקור ארצי/);
  assert.match(source.limitations, /לא לאישור מסלול/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Tel Aviv municipal bridge inventory is an asset-discovery layer, not a clearance dataset", () => {
  const source = getRoadRestrictionSource("tel-aviv-municipal-bridge-inventory-arcgis");
  assert.ok(source);
  assert.equal(source.publisher, "עיריית תל אביב-יפו");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("municipal_bridge_geometry"), true);
  assert.match(source.limitations, /בתחום תל אביב-יפו בלבד/);
  assert.match(source.limitations, /אין בה שדות גובה מעבר/);
  assert.match(source.limitations, /לא לאישור מסלול/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Tel Aviv Waze event layer is secondary situational awareness only", () => {
  const source = getRoadRestrictionSource("tel-aviv-waze-traffic-events-arcgis");
  assert.ok(source);
  assert.equal(source.publisher, "עיריית תל אביב-יפו (שכבת דיווחי Waze)");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("reported_road_closure_event"), true);
  assert.match(source.limitations, /מבוססת על דיווחי Waze/);
  assert.match(source.limitations, /אינם אימות של רשות מוסמכת/);
  assert.match(source.limitations, /אין להסיק מאי-הופעת אירוע שהדרך פתוחה/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("Ministry delegated area-signing-authority GIS is authority discovery only, not a restriction feed", () => {
  const source = getRoadRestrictionSource("mot-area-signing-authority");
  assert.ok(source);
  assert.equal(source.publisher, "משרד התחבורה והבטיחות בדרכים");
  assert.equal(source.lastPublished, "2026-07-22");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("delegated_signing_authority_area"), true);
  assert.match(source.limitations, /לא מקור מגבלות ולא אישור מסלול/);
  assert.equal(isSourceCandidateOnly(source), true);
});

test("Ministry traffic-authority directory is stale contact discovery only and never proves current road responsibility", () => {
  const source = getRoadRestrictionSource("mot-traffic-authority-directory");
  assert.ok(source);
  assert.equal(source.lastPublished, "2023-02-28");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("traffic_authority_code"), true);
  assert.match(source.limitations, /אינה ממפה סמכות לנכס או למקטע מסוים/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("delegated area authority catalogue refresh does not prove row-level authority currency", () => {
  const source = getRoadRestrictionSource("mot-area-signing-authority");
  assert.ok(source);
  assert.equal(source.lastPublished, "2026-07-22");
  assert.match(source.limitations, /YEARMONTH/);
  assert.match(source.limitations, /202303/);
  assert.match(source.limitations, /אינו מוכיח שכל מתחם/);
  assert.equal(source.routingEligible, false);
});

 
test("Survey of Israel BNTAL is national topographic asset discovery only, not truck clearance evidence", () => {
  const source = getRoadRestrictionSource("survey-of-israel-bntal-topographic-database");
  assert.ok(source);
  assert.equal(source.publisher, "המרכז למיפוי ישראל");
  assert.equal(source.contact, "service@mapi.gov.il");
  assert.equal(source.candidateOnly, true);
  assert.equal(source.routingEligible, false);
  assert.equal(source.dataTypes.includes("national_topographic_structure_geometry_discovery"), true);
  assert.match(source.limitations, /אינו מאשר שקיימת שכבת גשרים ייעודית/);
  assert.match(source.limitations, /גובה מבנה טופוגרפי אינו גובה פנוי מתחת לגשר/);
  assert.match(source.limitations, /תנאי רישיון מסחרי/);
  assert.equal(isSourceCandidateOnly(source), true);
});


test("every registered source remains routing-ineligible until a separate safety approval process exists", () => {
  const ids = ROAD_RESTRICTION_SOURCES.map(source => source.id);
  assert.equal(new Set(ids).size, ids.length, "source IDs must be unique");

  for (const source of ROAD_RESTRICTION_SOURCES) {
    assert.equal(typeof source.id, "string");
    assert.ok(source.id.length > 0);
    assert.equal(source.url.startsWith("https://"), true);
    assert.equal(source.routingEligible, false, `${source.id} must not enable routing from registry metadata`);
    assert.equal(isSourceCandidateOnly(source), true, `${source.id} must remain candidate-only for routing decisions`);
  }
});
