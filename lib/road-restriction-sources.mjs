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
    contact: "GOLDO@MOT.GOV.IL",
    lastPublished: "2024-06-30",
    dataTypes: Object.freeze(["bridge_location", "structure_name", "maintenance_responsibility", "road_identifier", "chainage", "grade_separation_status"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "הקטלוג מציג 618 רשומות בקובץ CSV שעודכן ב-30 ביוני 2024. השדות כוללים שם מסילה/הפרדה, קואורדינטות, כביש, קילומטר/הקטומטר, תיאור, סטטוס, חודש/שנת נתון, גוף תחזוקה וקוד/סוג רשות תמרור. אין שדות גובה מעבר, משקל, רוחב, אורך, נתיב או כיוון. זהו מאגר נקודתי של הפרדות בין כביש למסילת רכבת, לא אינוונטר כלל-ארצי של כל הגשרים. מקור מועמד לגילוי נכסים בלבד; העדכון הישן מחייב בירור עדכניות, והיעדר רשומה אינו מעיד שאין גשר או מגבלה."
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
    id: "mot-area-signing-authority",
    name: "משרד התחבורה – רשות תמרור מתחמים",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://data.gov.il/he/datasets/ministry_of_transport/area_authority",
    contact: "geo@mot.gov.il",
    lastPublished: "2026-07-22",
    dataTypes: Object.freeze(["delegated_signing_authority_area", "signing_authority_code", "administrative_area_geometry"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שכבת GIS של מתחמים שבהם סמכות רשות התמרור המקומית הואצלה לגוף שונה מהרשות המוניציפלית. עדכון הקטלוג הוא 22 ביולי 2026, אך הרשומות כוללות שדה YEARMONTH ודוגמאות גלויות עם ערכים 202303, 202312 ו-202403; מועד רענון הקובץ אינו מוכיח שכל מתחם או האצלת סמכות עדכניים. השכבה מסייעת לאתר גורם תמרור אפשרי לפי מתחם בלבד; היא אינה מכילה מגבלות גובה/משקל/מידות או שעות, ואינה מוכיחה שהגוף המופיע הוא בעל הנכס או הגורם המתחזק. יש לאמת תחום סמכות ומידע עדכני מול הרשות עצמה. מקור לגילוי בעל סמכות בלבד, לא מקור מגבלות ולא אישור מסלול."
  }),
  Object.freeze({
    id: "mot-traffic-authority-directory",
    name: "משרד התחבורה – מדריך רשויות תמרור מקומיות וקודים",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://data.gov.il/he/datasets/ministry_of_transport/traffic_authority",
    contact: "geo@mot.gov.il",
    lastPublished: "2023-02-28",
    dataTypes: Object.freeze(["traffic_authority_name", "traffic_authority_type", "traffic_authority_code"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "טבלת שמות, סוגים וקודים של רשויות תמרור מקומיות, עם עדכון אחרון שמוצג ב-28 בפברואר 2023. הרשימה כוללת בין היתר גופים לאומיים וחברות תשתית, אך היא ישנה ואינה ממפה סמכות לנכס או למקטע מסוים. אין להשתמש בה להנחת אחריות עדכנית או לשליחת פנייה ללא אימות. שימושית כרשימת התחלה בלבד לבניית מפת גורמים; אינה כוללת מגבלות תנועה ואינה מתאימה להחלטות ניווט."
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
    limitations: "מסמך הנחיות מקצועי, לא מאגר מיקומים ארצי. מגדיר הבחנה בין מרווח אנכי מדוד לבין גובה מוצע/משולט; המדידה המפורטת מתבצעת בדיוק ±1 ס״מ, בצמוד לשפות/קווי ניתוב ובמרכז כל נתיב, משני צידי המכשול ובמרכזו במעברים ארוכים מ-20 מ׳, ומתייחסת גם למתקנים תלויים. נדרשת מדידה תקופתית ועדכון מיידי לאחר עבודות סלילה שמשפיעות על המרווח. זהו תקן/נוהל מדידה ולא שכבת נתונים בפועל, ולכן אינו מספק רשימת מכשולים שניתן להזין ישירות לניווט."
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
,
  Object.freeze({
    id: "mot-gis-layer-catalogue-and-spec-guidance-2026",
    name: "משרד התחבורה – קטלוג שכבות ממ״ג והנחיות מפרט שכבות",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://www.gov.il/he/collectors/informationtype?officeId=48eaee91-0c97-4ef3-b364-50ae52e3b56f",
    contact: "geo@mot.gov.il",
    lastPublished: "2026-11-11",
    dataTypes: Object.freeze(["geospatial_layer_catalogue_discovery", "layer_specification_guidance"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "קטלוג/הנחיות לאיתור ולאחידות של שכבות GIS תחבורתיות, לא מאגר גשרים או מגבלות משאיות. עצם עדכון הקטלוג ב-11 בנובמבר 2026 אינו מעיד ששכבת גובה/משקל קיימת, מלאה או עדכנית. יש לבדוק כל שכבה בנפרד: בעלים, תחום כיסוי, תאריך עדכון של הנתונים עצמם, שדות, דיוק, תדירות, תנאי רישיון ושימוש מסחרי. לא מקור לאישור מסלול."
  })
,
  Object.freeze({
    id: "mot-bridge-gis-layer-spec-2025",
    name: "משרד התחבורה – מפרט שכבת GIS לגשרים, גרסה 1",
    publisher: "משרד התחבורה והבטיחות בדרכים",
    url: "https://www.gov.il/BlobFolder/generalpage/30-12-2025/he/%D7%9E%D7%A4%D7%A8%D7%98%20%D7%9C%D7%94%D7%9B%D7%A0%D7%AA%20%D7%A9%D7%9B%D7%91%D7%AA%20GIS%20%D7%A9%D7%9C%20%D7%92%D7%A9%D7%A8%D7%99%D7%9D.pdf",
    contact: "geo@mot.gov.il",
    lastPublished: "2025-11-25",
    dataTypes: Object.freeze(["bridge_geometry_specification", "posted_or_measured_clearance_field", "clearance_source_ambiguous", "bridge_asset_metadata"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "מפרט נתונים רשמי לשכבת גשרים, לא מאגר גשרים תפעולי. מגדיר שכבת פוליגונים ב-EPSG:2039, דיוק מרחבי מוצהר של מטר ותדירות עדכון שנתית. קיימת אי-התאמה בתוך המפרט: טבלת השדות מגדירה את Gavrit_Min ו-Gavrit_Max כגובה לפי השילוט, ואילו פירוט השדות בהמשך מתיר גובה לפי השילוט או לפי מדידה; אין שדה שמבדיל לכל רשומה בין שתי האפשרויות. לכן יש להתייחס לערכים כאל גובה שמקורו אינו חד-משמעי, ולא להניח שהם מדידות פיזיות. המפרט כולל שדות כלליים Source ו-D_Update (חודש/שנת עדכון), אך אלה אינם מתעדים כשלעצמם שיטת מדידה, תאריך מדידה, דיוק אנכי או אסמכתת מדידה. קיימים גם שדות Placement, Lane_N ו-Lane_Under, אך לא ערך מרווח אנכי מדוד נפרד לכל נתיב. הדיוק המרחבי של מטר מתייחס למיקום שכבת ה-GIS ואינו דיוק מדידת הגובה. יש לקבל בנפרד מדידות פיזיות מתועדות לפי הנחיות משרד התחבורה, עם שיוך לנתיב ולכיוון, ולבדוק כיסוי, עדכניות ורישיון לפני שימוש. המפרט עצמו אינו מאשר מעבר."
  })
,
  Object.freeze({
    id: "tel-aviv-municipal-roadworks-arcgis",
    name: "עיריית תל אביב-יפו – עבודות כבישים ואירועים המשפיעים על התנועה",
    publisher: "עיריית תל אביב-יפו",
    url: "https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/852",
    dataTypes: Object.freeze(["municipal_roadworks_geometry", "temporary_lane_reduction", "planned_roadworks_start_end", "day_night_work_window"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שכבת ArcGIS עירונית לתחום תל אביב-יפו בלבד, לא מקור ארצי ולא מגבלת משאית. כוללת גאומטריית עבודות/אירועים, סוג פעילות, צמצום נתיבים, תאריכי ושעות התחלה/סיום ושדה תאריך טעינה; לא הוכח SLA לעדכון בזמן אמת, אמינות שדות פתוח/סגור או כיסוי מלא של כל העבודות. אירוע עבודה אינו בהכרח חסימה מלאה ואינו קובע מגבלת גובה/משקל. שימוש אפשרי רק כמועמד למידע על אירועים זמניים לאחר בדיקת רישיון, freshness, סמנטיקת השדות והצלבה מול הודעה רשמית; לא לאישור מסלול או לחסימת נתיב אוטומטית."
  })
,
  Object.freeze({
    id: "tel-aviv-municipal-bridge-inventory-arcgis",
    name: "עיריית תל אביב-יפו – שכבת גשרים, מנהרות ומעברים",
    publisher: "עיריית תל אביב-יפו",
    url: "https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/550",
    dataTypes: Object.freeze(["municipal_bridge_geometry", "bridge_identifier", "bridge_purpose", "road_name", "municipal_structure_type"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שכבת נכסי תשתית עירונית בתחום תל אביב-יפו בלבד. כוללת גאומטריית קו, קוד/שם גשר, ייעוד וסוג (לרבות גשר לרכב, להולכי רגל, רכבת, מנהרה ומעבר תת-קרקעי), שמות רחובות ותאריך טעינה. אין בה שדות גובה מעבר, משקל, רוחב, מדידה, נתיב או כיוון. אין להסיק מגבלת גובה או בטיחות מעבר מעצם קיום/היעדר ישות. נדרש לבדוק כיסוי, עדכניות, רישיון והתאמה לרשת הכבישים; מקור מועמד למיפוי נכסים בלבד, לא לאישור מסלול."
  })
,
  Object.freeze({
    id: "tel-aviv-waze-traffic-events-arcgis",
    name: "עיריית תל אביב-יפו – דיווחי Waze על אירועי דרך",
    publisher: "עיריית תל אביב-יפו (שכבת דיווחי Waze)",
    url: "https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/891",
    dataTypes: Object.freeze(["community_road_incident", "reported_roadworks", "reported_road_hazard", "reported_road_closure_event", "reported_traffic_jam"]),
    candidateOnly: true,
    routingEligible: false,
    limitations: "שכבת נקודות עירונית בתחום תל אביב-יפו בלבד המבוססת על דיווחי Waze, לא מקור תשתית או סמכות תמרור. כוללת תאונות קלות, עבודות, מפגעים, עומסים ואירועי רחוב סגור, וכן שדות confidence, reliability, reportRating ו-updateDate. ערכי אמינות/ביטחון הם מטא-נתונים של הדיווח ואינם אימות של רשות מוסמכת; הדיווחים עשויים להיות חסרים, כפולים, שגויים או לא עדכניים. אין בה מגבלות גובה/משקל/רוחב/סרן, ואין להסיק מאי-הופעת אירוע שהדרך פתוחה. שימוש אפשרי רק כהתרעת מודעות משנית לאחר בדיקת רישיון, freshness והתאמת אירוע למקטע; לעולם לא כבסיס יחיד לחסימת דרך או לאישור מסלול."
  })
]);

export function getRoadRestrictionSource(id) {
  return ROAD_RESTRICTION_SOURCES.find(source => source.id === id) ?? null;
}

export function isSourceCandidateOnly(source) {
  return Boolean(source?.candidateOnly) || source?.routingEligible !== true;
}
