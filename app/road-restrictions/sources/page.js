import { ROAD_RESTRICTION_SOURCES } from "../../../lib/road-restriction-sources.mjs";

export const metadata = {
  title: "מקורות מידע למגבלות דרך | TruckSafe",
  description: "מקורות רשמיים, מגבלות נתונים וסטטוס אימות למאגר מגבלות הדרך."
};

export default function RoadRestrictionSourcesPage() {
  return <main dir="rtl" style={{ maxWidth: 960, margin: "0 auto", padding: 24, color: "#172338" }}>
    <a href="/road-restrictions" style={{ color: "#315bd6", textDecoration: "none" }}>← חזרה למגבלות דרך</a>
    <header style={{ margin: "20px 0" }}>
      <h1 style={{ marginBottom: 8 }}>מקורות מידע ואימות</h1>
      <p style={{ color: "#64748b", lineHeight: 1.7 }}>רשימת המקורות הרשמית שאותרה עד כה. מקור שמסייע לאתר גשר אינו מוכיח שקיימת בו מגבלת גובה, ולכן לא יועבר אוטומטית למנוע ניווט.</p>
    </header>
    <section style={{ background: "#fff7e6", border: "1px solid #f0d6a2", borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <strong>כלל בטיחות מחייב</strong>
      <p style={{ marginBottom: 0, lineHeight: 1.7 }}>נתוני איתור נשמרים כמועמדים בלבד. רק מגבלה עם מיקום, מקור רשמי, מדידה ותיעוד מתאימים, שאומתה על ידי בעל צי או מנהל צי, יכולה לקבל סטטוס מאומת. אין להשתמש ברשימה זו כתחליף לתמרורים ולהנחיות הדרך.</p>
    </section>
    {ROAD_RESTRICTION_SOURCES.map(source => <article key={source.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 14, background: "white" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 19, margin: 0 }}>{source.name}</h2>
        <span style={{ fontSize: 12, background: source.candidateOnly ? "#fff1d6" : "#e8eefc", color: "#334155", padding: "4px 8px", borderRadius: 999 }}>{source.candidateOnly ? "מועמדים בלבד" : "תקן והנחיות בלבד"}</span>
      </div>
      <p style={{ color: "#64748b", margin: "8px 0" }}>מפרסם: {source.publisher}{source.lastPublished ? " · עדכון/פרסום: " + source.lastPublished : ""}</p>
      <p style={{ lineHeight: 1.7 }}>{source.limitations}</p>
      <p style={{ marginBottom: 0 }}>סוגי מידע: {source.dataTypes.join(" · ")}</p>
      <p style={{ marginBottom: 0, marginTop: 12 }}><a href={source.url} target="_blank" rel="noreferrer" style={{ color: "#315bd6" }}>פתיחת המקור הרשמי ↗</a></p>
      {source.contact && <p style={{ marginBottom: 0, marginTop: 8 }}>איש קשר למאגר: <a href={"mailto:" + source.contact}>{source.contact}</a></p>}
      <p style={{ fontSize: 12, color: "#9a3412", marginBottom: 0, marginTop: 12 }}>זכאות לניווט: לא — לא משמש כמגבלת דרך מאומתת.</p>
    </article>)}
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginTop: 20 }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>מה חסר כדי להתקדם?</h2>
      <ul style={{ lineHeight: 1.9, paddingRight: 20 }}>
        <li>קובץ עדכני של גשרים ומעברים, כולל מזהה ומיקום גיאוגרפי.</li>
        <li>גובה מעבר מדוד לכל נתיב/כיוון, תאריך מדידה, שיטת מדידה ודיוק.</li>
        <li>גובה השילוט הרשמי, מסמך מדידה וגורם מוסמך המאשר את הנתון.</li>
        <li>מנגנון עדכון ותאריך בדיקה חוזרת לכל רשומה.</li>
      </ul>
      <p style={{ color: "#64748b", lineHeight: 1.7, marginBottom: 0 }}>עד לקבלת המידע ואימותו, לא נייבא רשומות אלה למאגר הפעיל ולא נפעיל חסימות מסלול על בסיסן.</p>
    </section>
  </main>;
}
