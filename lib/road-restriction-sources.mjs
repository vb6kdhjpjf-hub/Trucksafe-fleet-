/**
 * Curated official source registry for Israeli road-restriction discovery.
 *
 * Candidate datasets are discovery aids only. They are never restrictions,
 * and must never be sent to routing or treated as verified measurements.
 */
export const ROAD_RESTRICTION_SOURCES = Object.freeze([
  Object.freeze({
    id: "mot-level-separations-rail",
    name: "הפרדות מפלסיות רכבת ישראל",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://data.gov.il/he/datasets/ministry_of_transport/levelseparation",
    contact: "ofergo@eshed-mtl.co.il",
    lastPublished: "2024-06-30",
    dataTypes: Object.freeze(["bridge_location", "structure_name", "maintenance_responsibility"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "כולל מיקום, שם ההפרדה והגוף האחראי לתחזוקה; אינו כולל גובה מעבר מדוד או מגבלת גובה מאומתת. תאריך העדכון המפורסם ישן ולכן נדרש אימות עדכניות מול המפרסם."
  }),
  Object.freeze({
    id: "mot-road-signing-authority",
    name: "רשות תמרור בכבישים",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://data.gov.il/he/datasets/ministry_of_transport/roadauthority",
    contact: "pinusi@mot.gov.il",
    lastPublished: "2026-07-22",
    dataTypes: Object.freeze(["road_segment", "delegated_signing_authority"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "השכבה מזהה מקטעי כביש שבהם סמכות רשות התמרור הואצלה לגוף אחר; היא אינה מפרטת חסימות, מגבלות משקל או גובה, שעות איסור או מרווחי גובה מדודים. שימושית לזיהוי הגורם המוסמך לאימות ידני בלבד."
  }),
  Object.freeze({
    id: "mot-height-obstacle-guidelines-2026",
    name: "הנחיות להסדרי תנועה בקרבת מכשולי גובה – אפריל 2026",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf",
    lastPublished: "2026-04",
    dataTypes: Object.freeze(["measurement_standard", "safety_margin", "measurement_method"]),
    candidateOnly: false,
    routingEligible: false,
    limitations: "מסמך הנחיות מקצועי, לא מאגר מיקומים ארצי של גשרים או מגבלות גובה. אינו מספק רשימת מכשולים שניתן להזין ישירות לניווט."
  })
]);

export function getRoadRestrictionSource(id) {
  return ROAD_RESTRICTION_SOURCES.find(source => source.id === id) ?? null;
}

export function isSourceCandidateOnly(source) {
  return Boolean(source?.candidateOnly) || source?.routingEligible !== true;
}
