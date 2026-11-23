"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("TRUCKSAFE_APP_CLIENT_ERROR", error);
  }, [error]);

  return (
    <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7fa", fontFamily: "Arial, sans-serif", color: "#172033" }}>
      <section style={{ width: "100%", maxWidth: 560, background: "white", borderRadius: 18, padding: 24, boxSizing: "border-box", boxShadow: "0 8px 32px rgba(0,0,0,.08)" }}>
        <h1>TruckSafe – נדרש תיקון</h1>
        <p>זיהינו שגיאה בטעינת אחד ממסכי המערכת. פרטי השגיאה מוצגים כאן כדי שנוכל לאבחן ולתקן.</p>
        <pre dir="ltr" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f1f3f6", padding: 14, borderRadius: 10, fontSize: 13 }}>{error?.message || "לא התקבל פירוט שגיאה מהדפדפן"}</pre>
        {error?.digest && <p dir="ltr">Error ID: {error.digest}</p>}
        <button onClick={() => reset()} style={{ width: "100%", padding: 14, border: 0, borderRadius: 10, background: "#173f73", color: "white", fontSize: 16 }}>נסה לטעון מחדש</button>
      </section>
    </main>
  );
}
