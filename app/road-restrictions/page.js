"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { ArrowRight, AlertTriangle, Plus, RefreshCw, ShieldAlert } from "lucide-react";

const blank = { road_name: "", restriction_type: "height", direction: "", max_height_m: "", max_weight_t: "", max_width_m: "", max_length_m: "", valid_from: "", valid_until: "", active_from: "", active_until: "", latitude: "", longitude: "", start_latitude: "", start_longitude: "", end_latitude: "", end_longitude: "", location_accuracy_m: "", measured_clearance_m: "", measurement_date: "", measurement_accuracy_cm: "", measurement_method: "", measurement_location_note: "", measurement_document_url: "", structure_id: "", road_segment_id: "", lane_id: "", passage_length_m: "", surveyor: "", posted_clearance_status: "unknown", posted_clearance_m: "", measurement_coverage: { both_sides_measured: false, lane_center_measured: false, left_edge_measured: false, right_edge_measured: false, hanging_installations_checked: false, passage_center_measured: false }, source_type: "user_report", source_name: "", source_url: "", source_reference: "", source_updated_at: "", expires_at: "", notes: "" };
const labels = { height: "גובה מרבי", weight: "משקל מרבי", width: "רוחב מרבי", length: "אורך מרבי", hazmat: "חומרים מסוכנים", time_window: "הגבלת שעות", closed: "כביש סגור", other: "אחר" };
const isValidMeasurementDate = value => {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
};

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
  const [reviewNotes, setReviewNotes] = useState({});
  const [reviewBusy, setReviewBusy] = useState(null);

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
      const { data: workspace, error: workspaceError } = await resolveFleetWorkspace(supabase, data.session.user.id);
      if (!alive) return;
      if (workspaceError) {
        if (workspaceError.code === "AUTH_REQUIRED" || workspaceError.code === "NO_FLEET") router.replace("/");
        else setMessage("לא הצלחנו לאמת את הצי: " + workspaceError.message);
        setLoading(false); return;
      }
      setFleet(workspace.fleet);
      await load(workspace.fleet.id);
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
    const coordinatePairs = [["latitude", "longitude"], ["start_latitude", "start_longitude"], ["end_latitude", "end_longitude"]];
    for (const [latKey, lngKey] of coordinatePairs) {
      if ((form[latKey] === "") !== (form[lngKey] === "")) {
        setMessage("יש להזין קו רוחב וקו אורך יחד."); return;
      }
      if (form[latKey] !== "" &&
          (!Number.isFinite(Number(form[latKey])) || Number(form[latKey]) < -90 || Number(form[latKey]) > 90 ||
           !Number.isFinite(Number(form[lngKey])) || Number(form[lngKey]) < -180 || Number(form[lngKey]) > 180)) {
        setMessage("קואורדינטות המיקום אינן תקינות."); return;
      }
    }
    if ((form.start_latitude === "") !== (form.end_latitude === "")) {
      setMessage("במקטע כביש יש להזין נקודת התחלה וסיום."); return;
    }
    if (form.latitude === "" && form.start_latitude === "") {
      setMessage("יש להזין מיקום נקודתי או נקודת התחלה וסיום של מקטע הכביש."); return;
    }
    if (form.source_url.trim() && !/^https:\/\//i.test(form.source_url.trim())) {
      setMessage("קישור מקור חייב להתחיל ב־https://."); return;
    }
    if (form.source_updated_at && Number.isNaN(Date.parse(form.source_updated_at))) {
      setMessage("תאריך עדכון המקור אינו תקין."); return;
    }
    if (form.expires_at && Number.isNaN(Date.parse(form.expires_at))) {
      setMessage("תאריך התפוגה אינו תקין."); return;
    }
    setBusy(true); setMessage("");
    try {
      const numeric = value => value === "" ? null : Number(value);
      const payload = {
        fleet_id: fleet.id, created_by: session?.user?.id, road_name: form.road_name.trim(),
        restriction_type: form.restriction_type, direction: form.direction || null,
        max_height_m: numeric(form.max_height_m), max_weight_t: numeric(form.max_weight_t),
        max_width_m: numeric(form.max_width_m), max_length_m: numeric(form.max_length_m),
        valid_from: form.valid_from || null, valid_until: form.valid_until || null,
        active_from: form.active_from || null, active_until: form.active_until || null,
        country_code: "IL",
        latitude: numeric(form.latitude), longitude: numeric(form.longitude),
        start_latitude: numeric(form.start_latitude), start_longitude: numeric(form.start_longitude),
        end_latitude: numeric(form.end_latitude), end_longitude: numeric(form.end_longitude),
        location_accuracy_m: numeric(form.location_accuracy_m),
        measured_clearance_m: numeric(form.measured_clearance_m),
        measurement_date: form.measurement_date || null,
        measurement_accuracy_cm: numeric(form.measurement_accuracy_cm),
        measurement_method: form.measurement_method.trim() || null,
        measurement_location_note: form.measurement_location_note.trim() || null,
        measurement_document_url: form.measurement_document_url.trim() || null,
        structure_id: form.structure_id.trim() || null,
        road_segment_id: form.road_segment_id.trim() || null,
        lane_id: form.lane_id.trim() || null,
        passage_length_m: numeric(form.passage_length_m),
        surveyor: form.surveyor.trim() || null,
        posted_clearance_status: form.posted_clearance_status,
        posted_clearance_m: form.posted_clearance_status === "posted" ? numeric(form.posted_clearance_m) : null,
        measurement_coverage: form.measurement_coverage,
        source_type: form.source_type,
        source_name: form.source_name.trim() || null,
        source_url: form.source_url.trim() || null,
        source_reference: form.source_reference.trim() || null,
        source_updated_at: form.source_updated_at ? new Date(form.source_updated_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        verification_status: "unverified",
        verified_at: null,
        verified_by: null,
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

  async function reviewRestriction(row, decision) {
    if (!["owner", "fleet_manager"].includes(fleet?.role)) {
      setMessage("רק בעל הצי או מנהל צי יכולים לאמת מגבלת דרך.");
      return;
    }
    const note = String(reviewNotes[row.id] || "").trim();
    if (note.length < 12) {
      setMessage("יש לתעד הערת אימות מפורטת (לפחות 12 תווים).");
      return;
    }
    if (decision === "verified") {
      if (!row.source_name?.trim() || !/^https:\/\//i.test(String(row.source_url || ""))) {
        setMessage("כדי לאמת נדרשים שם מקור וקישור HTTPS למקור.");
        return;
      }
      const hasPoint = row.latitude != null && row.longitude != null;
      const hasSegment = row.start_latitude != null && row.start_longitude != null && row.end_latitude != null && row.end_longitude != null;
      if (!hasPoint && !hasSegment) {
        setMessage("לא ניתן לאמת מגבלה ללא מיקום נקודתי או מקטע כביש מלא.");
        return;
      }
      const limitField = { height: "max_height_m", weight: "max_weight_t", width: "max_width_m", length: "max_length_m" }[row.restriction_type];
      if (limitField && !(Number(row[limitField]) > 0)) {
        setMessage("חסר ערך מגבלה תקין לסוג ההגבלה שנבחר.");
        return;
      }
      if (row.restriction_type === "time_window" && (!row.valid_from || !row.valid_until)) {
        setMessage("להגבלת שעות נדרשים שעת התחלה ושעת סיום.");
        return;
      }
      if (row.restriction_type === "height") {
        const measured = Number(row.measured_clearance_m);
        const posted = Number(row.max_height_m);
        const margin = measured - posted;
        const coverage = row.measurement_coverage;
        const completeCoverage = coverage && typeof coverage === "object" &&
          coverage.both_sides_measured === true &&
          coverage.lane_center_measured === true &&
          coverage.left_edge_measured === true &&
          coverage.right_edge_measured === true &&
          coverage.hanging_installations_checked === true &&
          typeof coverage.passage_center_measured === "boolean" &&
          (Number(row.passage_length_m) <= 20 || coverage.passage_center_measured === true);
        const postedEvidenceValid = row.posted_clearance_status === "posted"
          ? Number.isFinite(Number(row.posted_clearance_m)) && Number(row.posted_clearance_m) >= 0.5 && Number(row.posted_clearance_m) <= 20
          : ["not_posted", "unknown"].includes(row.posted_clearance_status) && row.posted_clearance_m == null;
        if (!Number.isFinite(measured) || measured < 0.5 || measured > 20 ||
            !isValidMeasurementDate(row.measurement_date) ||
            !Number.isFinite(Number(row.measurement_accuracy_cm)) || Number(row.measurement_accuracy_cm) <= 0 || Number(row.measurement_accuracy_cm) > 1 ||
            !row.measurement_method?.trim() || String(row.measurement_location_note || "").trim().length < 12 ||
            !/^https:\/\//i.test(String(row.measurement_document_url || "")) ||
            !row.structure_id?.trim() || !row.road_segment_id?.trim() || !row.lane_id?.trim() ||
            !["forward", "backward"].includes(row.direction) ||
            !Number.isFinite(Number(row.passage_length_m)) || Number(row.passage_length_m) <= 0 || Number(row.passage_length_m) > 1000 ||
            !row.surveyor?.trim() || !completeCoverage || !postedEvidenceValid ||
            !Number.isFinite(margin) || margin < 0.20 || margin > 0.29) {
          setMessage("לאימות גובה נדרשים מזהי מבנה, מקטע ונתיב, כיוון, אורך מעבר, מודד, תיעוד מדידה וכיסוי מלא של הנתיב, סטטוס שילוט והפרש בטיחות של 20–29 ס״מ.");
          return;
        }
      }
      if (!["official_authority", "municipal_authority", "road_operator"].includes(row.source_type)) {
        setMessage("לא ניתן לאמת לניווט מקור שאינו רשות רשמית או מפעיל דרך.");
        return;
      }
    }
    setReviewBusy(row.id);
    setMessage("");
    try {
      // The database trigger is authoritative for reviewer identity and timestamps.
      // The client submits only the decision and the review note.
      const update = {
        verification_status: decision,
        verification_note: note,
        verification_notes: note
      };
      const { data, error } = await supabase.from("road_restrictions")
        .update(update)
        .eq("id", row.id)
        .eq("fleet_id", fleet.id)
        .select("id,verification_status")
        .maybeSingle();
      if (error) {
        setMessage("שמירת החלטת האימות נכשלה: " + error.message);
        return;
      }
      if (!data) {
        setMessage("לא ניתן לשמור את ההחלטה. בדוק הרשאות או רענן את המסך.");
        return;
      }
      setReviewNotes(current => ({ ...current, [row.id]: "" }));
      await load(fleet.id);
      setMessage(decision === "verified" ? "המגבלה אומתה ונרשם תיעוד הבדיקה." : "המגבלה נדחתה ונשמר תיעוד הבדיקה.");
    } catch (error) {
      setMessage("שגיאה בשמירת האימות: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      setReviewBusy(null);
    }
  }

  const canEdit = ["owner", "fleet_manager", "dispatcher"].includes(fleet?.role);
  const canVerify = ["owner", "fleet_manager"].includes(fleet?.role);
  const card = { background: "white", border: "1px solid #e7ebf2", borderRadius: 14, padding: 16, marginBottom: 12 };
  const field = { width: "100%", padding: 10, border: "1px solid #dce3ee", borderRadius: 8, marginTop: 5, background: "white" };
  const btn = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #dce3ee", borderRadius: 9, padding: "9px 12px", background: "white", cursor: "pointer" };

  return <main dir="rtl" style={{ minHeight: "100vh", padding: 20, background: "#f5f7fb", color: "#172338", maxWidth: 980, margin: "0 auto" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><h1 style={{ margin: 0 }}>מגבלות דרך למשאיות</h1><p style={{ color: "#718096", margin: "6px 0" }}>מאגר מגבלות ידועות לצי</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><a href="/road-restrictions/sources" style={{ ...btn, textDecoration: "none", color: "#315bd6" }}>מקורות מידע ואימות</a><button style={btn} onClick={() => router.push("/")}><ArrowRight size={16}/> לוח הבקרה</button></div>
    </header>
    <section style={{ ...card, background: "#fff8e8", borderColor: "#f2d7a3" }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center" }}><ShieldAlert size={20}/><b>חשוב לדעת — זהו מאגר תיעוד, לא מנוע ניווט</b></div>
      <p style={{ marginBottom: 0, lineHeight: 1.6 }}>כל מגבלה חדשה נשמרת כ״לא מאומתת״. יש להזין מיקום מדויק ככל האפשר ולצרף מקור. בהגבלת גובה, אימות מחייב גם מדידה בפועל, גובה רשום בתמרור, תאריך ושיטת מדידה, דיוק מדידה של עד 1 ס״מ ומסמך מדידה. נדרש פער בטיחות של 20–29 ס״מ בין הגובה המדוד לגובה המותר בתמרור, בהתאם ל־<a href="https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf" target="_blank" rel="noreferrer">הנחיות משרד התחבורה מאפריל 2026</a>. המערכת עדיין אינה מחשבת מסלול משאית על בסיס מאגר מלא של מגבלות רשמיות, ואין להסתמך עליה כתחליף לשילוט ולהנחיות הדרך.</p>
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
        <label>כיוון נסיעה<select style={field} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="">לא צוין</option><option value="forward">כיוון קדימה (forward)</option><option value="backward">כיוון הפוך (backward)</option></select></label>
        <label>קו רוחב נקודתי<input type="number" step="any" style={field} value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="WGS84"/></label>
        <label>קו אורך נקודתי<input type="number" step="any" style={field} value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="WGS84"/></label>
        <label>תחילת מקטע – קו רוחב<input type="number" step="any" style={field} value={form.start_latitude} onChange={e => setForm({ ...form, start_latitude: e.target.value })}/></label>
        <label>תחילת מקטע – קו אורך<input type="number" step="any" style={field} value={form.start_longitude} onChange={e => setForm({ ...form, start_longitude: e.target.value })}/></label>
        <label>סיום מקטע – קו רוחב<input type="number" step="any" style={field} value={form.end_latitude} onChange={e => setForm({ ...form, end_latitude: e.target.value })}/></label>
        <label>סיום מקטע – קו אורך<input type="number" step="any" style={field} value={form.end_longitude} onChange={e => setForm({ ...form, end_longitude: e.target.value })}/></label>
        <label>דיוק מיקום משוער (מטר)<input type="number" min="0" max="100000" step="1" style={field} value={form.location_accuracy_m} onChange={e => setForm({ ...form, location_accuracy_m: e.target.value })}/></label>
        <label>סוג מקור<select style={field} value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })}><option value="user_report">דיווח משתמש</option><option value="fleet_report">דיווח צי</option><option value="official_authority">רשות רשמית</option><option value="municipal_authority">רשות מקומית</option><option value="road_operator">מפעיל דרך</option><option value="imported">ייבוא נתונים</option></select></label>
        <label>שם המקור<input style={field} value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })} placeholder="למשל: רשות מקומית"/></label>
        <label>קישור למקור (HTTPS)<input type="url" style={field} value={form.source_url} onChange={e => setForm({ ...form, source_url: e.target.value })} placeholder="https://..."/></label>
        <label>מספר אסמכתא / מזהה מקור<input style={field} value={form.source_reference} onChange={e => setForm({ ...form, source_reference: e.target.value })}/></label>
        <label>עודכן במקור בתאריך<input type="datetime-local" style={field} value={form.source_updated_at} onChange={e => setForm({ ...form, source_updated_at: e.target.value })}/></label>
        <label>תפוגת המגבלה<input type="datetime-local" style={field} value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })}/></label>
        {form.restriction_type === "height" && <>
        <label>גובה לפי תמרור / שילוט (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_height_m} onChange={e => setForm({ ...form, max_height_m: e.target.value })}/></label>
        <label>מרווח אנכי מדוד בפועל (מטר)<input type="number" min="0.5" max="20" step="0.01" style={field} value={form.measured_clearance_m} onChange={e => setForm({ ...form, measured_clearance_m: e.target.value })}/></label>
        <label>תאריך המדידה<input type="date" style={field} value={form.measurement_date} onChange={e => setForm({ ...form, measurement_date: e.target.value })}/></label>
        <label>דיוק המדידה (ס״מ)<input type="number" min="0.1" max="10" step="0.1" style={field} value={form.measurement_accuracy_cm} onChange={e => setForm({ ...form, measurement_accuracy_cm: e.target.value })} placeholder="לפי מסמך המדידה"/></label>
        <label>שיטת המדידה<input style={field} value={form.measurement_method} onChange={e => setForm({ ...form, measurement_method: e.target.value })} placeholder="למשל: מד לייזר"/></label>
        <label>קישור למסמך מדידה (HTTPS)<input type="url" style={field} value={form.measurement_document_url} onChange={e => setForm({ ...form, measurement_document_url: e.target.value })} placeholder="https://..."/></label>
        <label>מזהה מבנה / גשר<input style={field} value={form.structure_id} onChange={e => setForm({ ...form, structure_id: e.target.value })}/></label>
        <label>מזהה מקטע כביש<input style={field} value={form.road_segment_id} onChange={e => setForm({ ...form, road_segment_id: e.target.value })}/></label>
        <label>מזהה נתיב<input style={field} value={form.lane_id} onChange={e => setForm({ ...form, lane_id: e.target.value })}/></label>
        <label>אורך המעבר (מטר)<input type="number" min="0.1" max="1000" step="0.1" style={field} value={form.passage_length_m} onChange={e => setForm({ ...form, passage_length_m: e.target.value })}/></label>
        <label>מודד / גורם מבצע<input style={field} value={form.surveyor} onChange={e => setForm({ ...form, surveyor: e.target.value })}/></label>
        <label>מצב גובה משולט<select style={field} value={form.posted_clearance_status} onChange={e => setForm({ ...form, posted_clearance_status: e.target.value, posted_clearance_m: e.target.value === "posted" ? form.posted_clearance_m : "" })}><option value="unknown">לא ידוע</option><option value="posted">מופיע בשילוט</option><option value="not_posted">לא מופיע בשילוט</option></select></label>
        {form.posted_clearance_status === "posted" && <label>גובה לפי שילוט (מטר)<input type="number" min="0.5" max="20" step="0.01" style={field} value={form.posted_clearance_m} onChange={e => setForm({ ...form, posted_clearance_m: e.target.value })}/></label>}
        <div style={{ gridColumn: "1/-1", border: "1px solid #dce3ee", borderRadius: 8, padding: 12 }}><b>כיסוי המדידה — יש לסמן רק בדיקות שבוצעו בפועל</b><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginTop: 10 }}>{[["both_sides_measured","נמדדו שני צדי המעבר"],["lane_center_measured","נמדד מרכז הנתיב"],["left_edge_measured","נמדדה השפה השמאלית"],["right_edge_measured","נמדדה השפה הימנית"],["hanging_installations_checked","נבדקו מתקנים תלויים"],["passage_center_measured","נמדד מרכז מעבר שאורכו מעל 20 מטר"]].map(([key,label]) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.measurement_coverage[key]} onChange={e => setForm({ ...form, measurement_coverage: { ...form.measurement_coverage, [key]: e.target.checked } })}/>{label}</label>)}</div></div>
        <label style={{ gridColumn: "1/-1" }}>פירוט נתיבים ומיקומי מדידה<textarea rows="2" style={field} value={form.measurement_location_note} onChange={e => setForm({ ...form, measurement_location_note: e.target.value })} placeholder="יש לתעד את המדידות הרלוונטיות בכל נתיב ובמיקומים שנדרשו"/></label>
        </>} 
        <label>משקל מרבי (טון)<input type="number" min="0.1" step="0.1" style={field} value={form.max_weight_t} onChange={e => setForm({ ...form, max_weight_t: e.target.value })}/></label>
        <label>רוחב מרבי (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_width_m} onChange={e => setForm({ ...form, max_width_m: e.target.value })}/></label>
        <label>אורך מרבי (מטר)<input type="number" min="0.1" step="0.01" style={field} value={form.max_length_m} onChange={e => setForm({ ...form, max_length_m: e.target.value })}/></label>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: row.is_active ? "#16803c" : "#718096" }}>{row.is_active ? "פעילה" : "לא פעילה"}</span>{canEdit && <button disabled={busy} style={btn} onClick={() => toggle(row)}>{row.is_active ? "השבתה" : "הפעלה"}</button>}</div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 13, color: "#536176" }}>
        {row.max_height_m && <span>גובה בתמרור: {row.max_height_m} מ׳</span>}
        {row.measured_clearance_m && <span>גובה מדוד: {row.measured_clearance_m} מ׳</span>}
        {row.measurement_date && <span>תאריך מדידה: {new Date(row.measurement_date).toLocaleDateString("he-IL")}</span>}{row.max_weight_t && <span>משקל: {row.max_weight_t} טון</span>}{row.max_width_m && <span>רוחב: {row.max_width_m} מ׳</span>}{row.max_length_m && <span>אורך: {row.max_length_m} מ׳</span>}
        {(row.valid_from || row.valid_until) && <span>שעות: {row.valid_from || "—"}–{row.valid_until || "—"}</span>}
        {(row.active_from || row.active_until) && <span>תאריכים: {row.active_from || "—"} עד {row.active_until || "—"}</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: row.verification_status === "verified" ? "#16803c" : "#9a6500" }}>
        אימות: {row.verification_status === "verified" ? "מאומת" : row.verification_status === "rejected" ? "נדחה" : row.verification_status === "expired" ? "פג תוקף" : "לא מאומת"}
        {row.source_name ? " · מקור: " + row.source_name : ""}
        {row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">קישור למקור</a></> : ""}
        {(row.latitude !== null && row.longitude !== null) ? " · מיקום: " + Number(row.latitude).toFixed(5) + ", " + Number(row.longitude).toFixed(5) : ""}
        {(row.start_latitude !== null && row.end_latitude !== null) ? " · מקטע: " + Number(row.start_latitude).toFixed(5) + ", " + Number(row.start_longitude).toFixed(5) + " עד " + Number(row.end_latitude).toFixed(5) + ", " + Number(row.end_longitude).toFixed(5) : ""}
        {row.expires_at ? " · תפוגה: " + new Date(row.expires_at).toLocaleDateString("he-IL") : ""}
      </div>
      {row.measurement_method && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#536176" }}>שיטת מדידה: {row.measurement_method} · דיוק: ±{row.measurement_accuracy_cm} ס״מ</p>}
      {row.measurement_document_url && <p style={{ margin: "4px 0 0", fontSize: 12 }}><a href={row.measurement_document_url} target="_blank" rel="noreferrer">מסמך מדידה</a></p>}
      {row.verification_note && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#536176" }}>הערת אימות: {row.verification_note}</p>}
      {row.verified_at && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#536176" }}>אומת בתאריך: {new Date(row.verified_at).toLocaleString("he-IL")}</p>}
      {canVerify && row.verification_status !== "verified" && <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e7ebf2" }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>הערת בדיקה למנהל (חובה)
          <textarea rows="2" style={field} value={reviewNotes[row.id] || ""} onChange={e => setReviewNotes(current => ({ ...current, [row.id]: e.target.value }))} placeholder="מה נבדק, מול איזה מסמך או הודעה רשמית, ומה הוחלט?"/>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" disabled={reviewBusy === row.id || busy} style={{ ...btn, background: "#16803c", color: "white", borderColor: "#16803c" }} onClick={() => reviewRestriction(row, "verified")}>{reviewBusy === row.id ? "שומר..." : "אימות מגבלה"}</button>
          <button type="button" disabled={reviewBusy === row.id || busy} style={{ ...btn, background: "#fff1f0", color: "#a12622", borderColor: "#f0c5c2" }} onClick={() => reviewRestriction(row, "rejected")}>דחיית מגבלה</button>
        </div>
      </div>}
      {row.notes && <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{row.notes}</p>}
    </article>)}
    <p style={{ color: "#718096", fontSize: 12 }}>TruckSafe Fleet · יש לוודא כל מגבלה מול מקור רשמי ועדכני</p>
  </main>;
}
