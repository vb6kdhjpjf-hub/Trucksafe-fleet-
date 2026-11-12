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
    id: "mot-road-safety-infrastructure-spec-2025",
    name: "מפרט שכבות הסדרי בטיחות בתשתית דרכים",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://www.gov.il/BlobFolder/generalpage/30_12_2025/he/%D7%9E%D7%A4%D7%A8%D7%98%20%D7%A9%D7%9B%D7%91%D7%95%D7%AA%20%D7%94%D7%A1%D7%93%D7%A8%D7%99%20%D7%91%D7%98%D7%99%D7%97%D7%95%D7%AA%20%D7%91%D7%AA%D7%A9%D7%AA%D7%99%D7%AA%20%D7%93%D7%A8%D7%9B%D7%99%D7%9D%202.pdf",
    lastPublished: "2025-11",
    dataTypes: Object.freeze(["layer_specification", "bridge_inventory_requirements"]),
    candidateOnly: false,
    routingEligible: false,
    limitations: "מפרט שכבות ונתונים להסדרי בטיחות בתשתית דרכים, ולא קובץ נתונים ארצי של גשרים או מגבלות. הוא מסייע להגדיר אילו שכבות ונתונים נדרשים, אך אינו מוכיח גובה מעבר או איסור תנועה במיקום מסוים."
  }),
  Object.freeze({
    id: "netivei-israel-infrastructure-inventory-lead",
    name: "נתיבי ישראל – גישה לאינוונטר תשתיות וגשרים",
    publisher: "המרכז הישראלי לחקר תחבורה חכמה (ISTRC), מידע על נתיבי ישראל",
    url: "https://istrc.net.technion.ac.il/open-data/",
    contact: "MeyJ@iroads.co.il",
    dataTypes: Object.freeze(["bridge_inventory_access_lead", "heavy_load_data_access_lead", "traffic_events_access_lead"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "זהו פרסום על אפשרות לקבל מידע מנתיבי ישראל, ולא מאגר נתונים להורדה. נדרש אישור ישיר מנתיבי ישראל לגבי כיסוי, שדות, עדכניות, רישיון, API או פורמט מסירה, וזכות שימוש במוצר ניווט מסחרי."
  }),
  Object.freeze({
    id: "regional-out-of-service-bridge-roadblocks-arcgis",
    name: "שכבת GIS אזורית – חסימות ומעקפים לגשרים שיצאו משירות",
    publisher: "ArcGIS Feature Service (מפרסם/בעלים לא מזוהים במטא-נתוני השירות שנבדקו)",
    url: "https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer",
    dataTypes: Object.freeze(["regional_bridge_roadblocks", "out_of_service_bridge_detours"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שירות ArcGIS המתאר חסימות ומעקפים לגשרים שיצאו משירות, עם שכבות חסימה, מעקפים וגשרים. היקף המידע מוגבל גאוגרפית לאזור קטן, השירות מציג Max Record Count של 1000 וללא פרטי Copyright Text או תדירות עדכון ברורה; שכבת החסימות כוללת קוד גשר ומזהה בלבד, ללא גובה מעבר מדוד, משקל, שעות, כיוון/נתיב או תוקף עדכני. מקור מועמד לגילוי חסימות/מעקפים בלבד; נדרשים זיהוי בעלים, אימות כיסוי, עדכניות, רישיון ושיוך לכביש לפני כל שימוש. לעולם אינו מוכיח שכביש אחר נקי ממגבלה."
  }),
  Object.freeze({
    id: "tel-aviv-municipal-bridge-gis",
    name: "עיריית תל אביב – שכבת GIS גשרים",
    publisher: "עיריית תל אביב-יפו",
    url: "https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/550",
    dataTypes: Object.freeze(["municipal_bridge_geometry", "bridge_type", "road_name", "municipal_asset_id"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שכבה עירונית לתל אביב בלבד, עם גיאומטריית גשרים וסיווגם אך ללא גובה מעבר מדוד או מגבלות משקל/שעות. פרטי רישיון השימוש אינם מוצגים בבירור ולכן נדרש אישור לפני ייבוא או שימוש מסחרי."
  }),
  Object.freeze({
    id: "mot-geospatial-transport-planning-portal",
    name: "משרד התחבורה – מערכת חצב לתכנון תחבורתי בישראל",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://geo.mot.gov.il/",
    contact: "geo@mot.gov.il",
    dataTypes: Object.freeze(["geospatial_layer_discovery", "transport_planning_context"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "פורטל GIS לאיתור שכבות תכנון ותחבורה ממקורות ממשלתיים, חברות תשתית ורשויות. המשרד מציין שהעדכון משתנה בין שכבות ושהמידע אינו נוסח מחייב או מידע מחייב. עצם הופעת שכבה בפורטל אינה מאמתת מגבלת משאית, גובה, משקל, שעות, כיסוי או רישיון שימוש מסחרי. יש לבדוק מטא-נתונים, בעל מקור, תאריך עדכון, תנאי שימוש והמסמך המקורי של כל שכבה בנפרד."
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
    id: "mot-road-tunnels-gis",
    name: "משרד התחבורה – שכבת מנהרות כבישים",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://data.gov.il/he/datasets/ministry_of_transport/tunnels",
    contact: "geo@mot.gov.il",
    lastPublished: "2026-06-01",
    dataTypes: Object.freeze(["road_tunnel_geometry", "tunnel_name", "national_candidate_asset"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "מאגר מנהרות כבישים בפריסה ארצית. רישום המאגר מציג עדכון קבצים ב-1 ביוני 2026, אך קובץ המטא-נתונים מציין שהשכבה נוצרה ועודכנה בנובמבר 2022, כיסוי זמני 2022 ותדירות עדכון משתנה. אין בו לפי התיעוד שנבדק גובה מעבר מדוד, מגבלת גובה/משקל, נתיב, כיוון, תוקף תפעולי או הוכחה שהמנהרה מתאימה למשאית. נדרש לברר את הסתירה בתאריכי העדכון ואת שדות הנתונים מול צוות חצב; שכבת גילוי נכסים בלבד, לא אישור מעבר ולא מגבלה מאומתת."
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
  }),
  Object.freeze({
    id: "openstreetmap-community-truck-restrictions",
    name: "OpenStreetMap – תגיות קהילתיות למגבלות רכב כבד",
    publisher: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/",
    dataTypes: Object.freeze(["community_maxheight", "community_maxweight", "community_maxwidth", "community_maxlength", "community_maxaxleload", "community_hgv_access"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "נתוני מיפוי קהילתיים ולא מקור רשמי או מדידה מוסמכת. התיעוד מבחין בין maxheight כמגבלה חוקית לבין maxheight:physical כמגבלה פיזית, ומציין שמגבלות כיוון עשויות להיות מתויגות בנפרד. תגיות עלולות להיות חסרות, שגויות, לא מעודכנות או לא משויכות לקטע הכביש/נתיב הנכון; היעדר תגית אינו מוכיח שאין מגבלה. שימוש מותר רק כ-lead לבדיקה אנושית לאחר בדיקת ODbL, ייחוס ושיתוף-אלייק; לעולם לא לאישור מסלול או לחסימה מאומתת."
  })
]);

export function getRoadRestrictionSource(id) {
  return ROAD_RESTRICTION_SOURCES.find(source => source.id === id) ?? null;
}

export function isSourceCandidateOnly(source) {
  return Boolean(source?.candidateOnly) || source?.routingEligible !== true;
}
