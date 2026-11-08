"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ArrowRight, AlertTriangle, Plus, RefreshCw, ShieldAlert } from "lucide-react";

const blank = { road_name: "", restriction_type: "height", direction: "", max_height_m: "", max_weight_t: "", max_width_m: "", max_length_m: "", valid_from: "", valid_until: "", active_from: "", active_until: "", latitude: "", longitude: "", radius_m: "75", source_url: "", notes: "" };
const labels = { height: "גובה מרבי", weight: "משקל מרבי", width: "רוחב מרבי", length: "אורך מרבי", hazmat: "חומרים מסוכנים", time_window: "הגבלת שעות", closed: "כביש סגור", other: "אחר" };

export default function RoadRestrictionsPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load(id) {
    const { data, error } = await supabase.from("road_restrictions").select("*").eq("fleet_id", id).order("is_active", { ascending: false }).order("road_name");
    if (error) setMessage("לא ניתן לטעון מגבלות דרך: " + error.message);
    else setRows(data || []);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      setSession(data.session);
      const { data: members, error: memberError } = await supabase.from("fleet_members")
        .select("fleet_id,role").eq("user_id", data.session.user.id).limit(2);
      if (!alive) return;
      if (memberError || !members?.length) { setMessage(memberError?.message || "לא נמצא צי לחשבון."); setLoading(false); return; }
      if (members.length > 1) { setMessage("החשבון משויך ליותר מצי אחד. בחירת צי מרובה עדיין לא הוגדרה, ולכן לא נטען מאגר מגבלות אוטומטית."); setLoading(false); return; }
      const member = members[0];
      setFleet({ id: member.fleet_id, role: member.role });
      await load(member.fleet_id);
      if (alive) setLoading(false);
    }).catch(e => { if (alive) { setMessage("שגיאה בטעינה: " + e.message); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) router.replace("/"); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  async function save(e) {
    e.preventDefault();
    if (!session?.user?.id) { setMessage("פג תוקף החיבור. יש להתחבר מחדש."); return; }
    if (!fleet || !["owner", "fleet_manager", "dispatcher"].includes(fleet.role)) { setMessage("אין הרשאה להוסיף מגבלת דרך."); return; }
    if (!form.road_name.trim()) { setMessage("יש להזין שם כביש."); return; }
    const keys = ["max_height_m", "max_weight_t", "max_width_m", "max_length_m"];
    if (keys.some(key => form[key] !== "" && (!Number.isFinite(Number(form[key])) || Number(form[key]) <= 0))) {
      setMessage("יש להזין מידות ומשקלים כמספרים חיוביים."); return;
    }
    if ((form.valid_from && form.valid_until && form.valid_until < form.valid_from) ||
        (form.active_from && form.active_until && form.active_until < form.active_from)) {
      setMessage("תאריך או שעת הסיום אינם יכולים להיות לפני ההתחלה."); return;
    }
    const hasLatitude = form.latitude !== "";
    const hasLongitude = form.longitude !== "";
    if (hasLatitude !== hasLongitude) { setMessage("יש להזין גם קו רוחב וגם קו אורך, או להשאיר את שניהם ריקים."); return; }
    if (hasLatitude && (!Number.isFinite(Number(form.latitude)) || Number(form.latitude) < 29 || Number(form.latitude) > 34 ||
        !Number.isFinite(Number(form.longitude)) || Number(form.longitude) < 34 || Number(form.longitude) > 36)) {
      setMessage("הקואורדינטות חייבות להיות תקינות ובתחומי ישראל."); return;
    }
    if (!Number.isInteger(Number(form.radius_m)) || Number(form.radius_m) < 10 || Number(form.radius_m) > 1000) {
      setMessage("רדיוס האזור חייב להיות בין 10 ל־1,000 מטר."); return;
    }
    if (form.source_url && !/^https:\/\//i.test(form.source_url.trim())) {
      setMessage("קישור המקור חייב להתחיל ב־https://."); return;
    }
    setBusy(true); setMessage("");
    try {
      const numeric = value => value === "" ? null : Number(value);
      const payload = {
        fleet_id: fleet.id, created_by: session?.user?.id, road_name: form.road_name.trim(),
        restriction_type: form.restriction_type, direction: form.direction.trim() || null,
        max_height_m: numeric(form.max_height_m), max_weight_t: numeric(form.max_weight_t),
        max_width_m: numeric(form.max_width_m), max_length_m: numeric(form.max_length_m),
        valid_from: form.valid_from || null, valid_until: form.valid_until || null,
        active_from: form.active_from || null, active_until: form.active_until || null,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        radius_m: Number(form.radius_m),
        source_url: form.source_url.trim() || null,
        verification_status: "unverified",
        notes: form.notes.trim() || null
      };
      const { error } = await supabase.from("road_restrictions").insert(payload);
      if (error) { setMessage("שמירת המגבלה נכשלה: " + error.message); return; }
      setForm(blank); setShowForm(false); await load(fleet.id); setMessage("מגבלת הדרך נשמרה.");
    } catch (error) {
      setMessage("שמירת המגבלה נכשלה: " + (error?.message || "שגיאה לא ידועה"));
    } finally { setBusy(false); }
  }

  async function toggle(row) {
    if (!["owner", "fleet_manager", "dispatcher"].includes(fleet?.role)) { setMessage("אין הרשאה לעדכן מגבלת דרך."); return; }
    setBusy(true);
    const { error } = await supabase.from("road_restrictions").update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq("id", row.id).eq("fleet_id", fleet.id);
    if (error) setMessage("עדכון המגבלה נכשל: " + error.message);
    else { await load(fleet.id); setMessage("סטטוס המגבלה עודכן."); }
    setBusy(false);
  }

  const canEdit = ["owner", "fleet_manager", "dispatcher"].includes(fleet?.role);
  const card = { background: "white", border: "1px solid #e7ebf2", borderRadius: 14, padding: 16, marginBottom: 12 };
  const field = { width: "100%", padding: 10, border: "1px solid #dce3ee", borderRadius: 8, marginTop: 5, background: "white" };
  const btn = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #dce3ee", borderRadius: 9, padding: "9px 12px", background: "white", cursor: "pointer" };

  return <main className="truck-safe-tool-page" dir="rtl" style={{ minHeight: "100vh", padding: 20, background: "#f5f7fb", color: "#172338", maxWidth: 980, margin: "0 auto" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><h1 style={{ margin: 0 }}>מגבלות דרך למשאיות</h1><p style={{ color: "#718096", margin: "6px 0" }}>מאגר מגבלות ידועות לצי</p></div>
      <button style={btn} onClick={() => router.push("/")}><ArrowRight size={16}/> לוח הבקרה</button>
    </header>
    <section style={{ ...card, background: "#fff8e8", borderColor: "#f2d7a3" }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center" }}><ShieldAlert size={20}/><b>חשוב לדעת — זהו מאגר תיעוד, לא מנוע ניווט</b></div>
      <p style={{ marginBottom: 0, lineHeight: 1.6 }}>המידע מוזן על ידי מנהלי הצי ואינו מאומת מול רשות הכבישים. המערכת עדיין אינה מחשבת מסלול משאית ואינה יכולה להבטיח הימנעות מגשרים נמוכים, מגבלות משקל או כבישים אסורים. אין להסתמך על המאגר כתחליף לשילוט ולהנחיות הדרך.</p>
    </section>
    {message && <p style={{ ...card, background: "#eef4ff" }}>{message}</p>}
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><h2 style={{ margin: 0, fontSize: 19 }}>מגבלות רשומות ({rows.length})</h2><small style={{ color: "#718096" }}>רק משתמשים בעלי הרשאת ניהול יכולים להוסיף או לשנות</small></div>
        <div style={{ display: "flex", gap: 8 }}><button style={btn} onClick={() => fleet && load(fleet.id)}><RefreshCw size={15}/> רענון</button>{canEdit && <button style={{ ...btn, background: "#3867e8", color: "white" }} onClick={() => setShowForm(!showForm)}><Plus size={15}/> הוספת מגבלה</button>}</div>
      </div>
      {showForm && <form onSubmit={save} style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <label>שם הכביש / המקטע *<input required style={field} value={form.road_name} onChange={e => setForm({ ...form, road_name: e.target.value })}/></label>
        <label>סוג הגבלה<select style={field} value={form.restriction_type} onChange={e => setForm({ ...form, restriction_type: e.target.value })}>{Object.entries(labels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>כיוון / מקטע<input style={field} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} placeholder="לדוגמה: לכיוון צפון"/></label>
        <label>גובה מרבי (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_height_m} onChange={e => setForm({ ...form, max_height_m: e.target.value })}/></label>
        <label>משקל מרבי (טון)<input type="number" min="0.1" step="0.1" style={field} value={form.max_weight_t} onChange={e => setForm({ ...form, max_weight_t: e.target.value })}/></label>
        <label>רוחב מרבי (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_width_m} onChange={e => setForm({ ...form, max_width_m: e.target.value })}/></label>
        <label>אורך מרבי (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_length_m} onChange={e => setForm({ ...form, max_length_m: e.target.value })}/></label>
        <label>קו רוחב (Latitude)<input type="number" step="0.000001" min="29" max="34" style={field} value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="לדוגמה: 32.123456"/></label>
        <label>קו אורך (Longitude)<input type="number" step="0.000001" min="34" max="36" style={field} value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="לדוגמה: 34.987654"/></label>
        <label>רדיוס בדיקה (מטר)<input required type="number" min="10" max="1000" step="5" style={field} value={form.radius_m} onChange={e => setForm({ ...form, radius_m: e.target.value })}/></label>
        <label style={{ gridColumn: "1/-1" }}>קישור למקור המגבלה (HTTPS)<input type="url" style={field} value={form.source_url} onChange={e => setForm({ ...form, source_url: e.target.value })} placeholder="קישור למסמך או הודעה רשמית"/></label>
        <p style={{ gridColumn: "1/-1", margin: 0, color: "#8a4b08", fontSize: 13 }}>כל מגבלה חדשה נשמרת כלא מאומתת. הזנת קואורדינטות או קישור אינה מאשרת את אמינותה; אימות יבוצע בנפרד לפני אכיפה אוטומטית.</p>
        <label>שעת התחלה<input type="time" style={field} value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })}/></label>
        <label>שעת סיום<input type="time" style={field} value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}/></label>
        <label>בתוקף מתאריך<input type="date" style={field} value={form.active_from} onChange={e => setForm({ ...form, active_from: e.target.value })}/></label>
        <label>בתוקף עד תאריך<input type="date" style={field} value={form.active_until} onChange={e => setForm({ ...form, active_until: e.target.value })}/></label>
        <label style={{ gridColumn: "1/-1" }}>הערות / מקור המידע<textarea style={field} rows="3" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
        <div style={{ gridColumn: "1/-1", display: "flex", gap: 8 }}><button disabled={busy} style={{ ...btn, background: "#3867e8", color: "white" }}>{busy ? "שומר..." : "שמירת מגבלה"}</button><button type="button" style={btn} onClick={() => setShowForm(false)}>ביטול</button></div>
      </form>}
    </section>
    {loading ? <p>טוען...</p> : rows.length === 0 ? <section style={card}>אין עדיין מגבלות דרך במאגר.</section> : rows.map(row => <article key={row.id} style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><b>{row.road_name}</b><div style={{ color: "#536176", marginTop: 5 }}>{labels[row.restriction_type] || row.restriction_type}{row.direction ? " · " + row.direction : ""}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: row.is_active ? "#16803c" : "#718096" }}>{row.is_active ? "פעילה" : "לא פעילה"}</span>{canEdit && row.verification_status !== "verified" && <button disabled={busy} style={btn} onClick={() => toggle(row)}>{row.is_active ? "השבתה" : "הפעלה"}</button>}{canEdit && row.verification_status === "verified" && <small style={{ color: "#718096" }}>שינוי מגבלה מאומתת דורש בדיקה מערכתית</small>}</div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 13, color: "#536176" }}>
        {row.max_height_m && <span>גובה: {row.max_height_m} מ׳</span>}{row.max_weight_t && <span>משקל: {row.max_weight_t} טון</span>}{row.max_width_m && <span>רוחב: {row.max_width_m} מ׳</span>}{row.max_length_m && <span>אורך: {row.max_length_m} מ׳</span>}
        {(row.valid_from || row.valid_until) && <span>שעות: {row.valid_from || "—"}–{row.valid_until || "—"}</span>}
        {(row.active_from || row.active_until) && <span>תאריכים: {row.active_from || "—"} עד {row.active_until || "—"}</span>}
      </div>
      {row.latitude != null && row.longitude != null && <div style={{ marginTop: 8, fontSize: 12, color: "#536176" }}>מיקום: {Number(row.latitude).toFixed(6)}, {Number(row.longitude).toFixed(6)} · רדיוס: {row.radius_m} מ׳</div>}
      <div style={{ marginTop: 6, fontSize: 12, color: row.verification_status === "verified" ? "#16803c" : "#9b5b16" }}>סטטוס אימות: {row.verification_status === "verified" ? "מאומת" : row.verification_status === "expired" ? "פג תוקף" : "לא מאומת"}{row.source_last_checked_at ? " · נבדק: " + new Date(row.source_last_checked_at).toLocaleDateString("he-IL") : ""}{row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">מקור</a></> : " · חסר מקור"}</div>
      {row.verification_note && <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>הערת אימות: {row.verification_note}</p>}{row.notes && <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{row.notes}</p>}
    </article>)}
    <p style={{ color: "#718096", fontSize: 12 }}>TruckSafe Fleet · יש לוודא כל מגבלה מול מקור רשמי ועדכני</p>
  </main>;
}
