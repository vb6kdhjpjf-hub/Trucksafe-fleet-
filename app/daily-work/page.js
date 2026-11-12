"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { ArrowRight, ClipboardList, Plus, Scale, Truck, UserRound, MapPin, CheckCircle2, Play, RefreshCw } from "lucide-react";

const blankStop = () => ({ operation_kind: "unload", address: "", planned_quantity_kg: "" });
const blankForm = () => ({
  work_date: new Date().toLocaleDateString("en-CA"),
  driver_id: "",
  vehicle_id: "",
  tare_weight_kg: "",
  registered_gross_limit_kg: "",
  registered_axle_limit_kg: "",
  initial_gross_weight_kg: "",
  initial_heaviest_axle_kg: "",
  measurement_source: "weighbridge_ticket",
  measurement_reference: "",
  stops: [blankStop()]
});
const sourceLabels = { weighbridge_ticket: "תעודת שקילה", certified_onboard_scale: "משקל מובנה מאושר" };

export default function DailyWorkPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stopsByPlan, setStopsByPlan] = useState({});
  const [form, setForm] = useState(blankForm);
  const [measurements, setMeasurements] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("info");

  const canManage = ["owner", "fleet_manager", "dispatcher"].includes(fleet?.role);
  const canRead = Boolean(fleet?.id);
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === form.vehicle_id);
  const driverNames = useMemo(() => new Map(drivers.map(d => [d.id, d.full_name])), [drivers]);
  const vehicleNames = useMemo(() => new Map(vehicles.map(v => [v.id, v.registration_number])), [vehicles]);

  const notify = (text, kind = "info") => { setMessage(text); setMessageKind(kind); };

  const loadData = useCallback(async (user) => {
    const { data, error } = await resolveFleetWorkspace(supabase, user.id);
    if (error) {
      if (error.code === "AUTH_REQUIRED" || error.code === "NO_FLEET") router.replace("/");
      else notify("לא הצלחנו לאמת את סביבת העבודה: " + error.message, "error");
      return;
    }
    const current = data.fleet;
    setFleet(current);
    const [d, v, p] = await Promise.all([
      supabase.from("drivers").select("id,full_name,status").eq("fleet_id", current.id).order("full_name"),
      supabase.from("vehicles").select("id,registration_number,vehicle_type,status,empty_weight_kg,gross_weight_kg,weight_per_axle_kg,registration_verification_status").eq("fleet_id", current.id).order("registration_number"),
      supabase.from("daily_work_plans").select("id,fleet_id,work_date,driver_id,vehicle_id,status,tare_weight_kg,registered_gross_limit_kg,registered_axle_limit_kg,current_gross_weight_kg,current_heaviest_axle_kg,load_revision,measurement_at,measurement_source,measurement_reference,created_at").eq("fleet_id", current.id).order("work_date", { ascending: false }).limit(50)
    ]);
    if (d.error) notify("שגיאה בטעינת הנהגים: " + d.error.message, "error"); else setDrivers(d.data || []);
    if (v.error) notify("שגיאה בטעינת כלי הרכב: " + v.error.message, "error"); else setVehicles(v.data || []);
    if (p.error) { notify("שגיאה בטעינת תוכניות העבודה: " + p.error.message, "error"); setPlans([]); setStopsByPlan({}); return; }
    const rows = p.data || [];
    setPlans(rows);
    if (!rows.length) { setStopsByPlan({}); return; }
    const stopResult = await supabase.from("daily_work_stops")
      .select("id,fleet_id,plan_id,sequence_no,operation_kind,address,planned_quantity_kg,status,actual_quantity_kg,completed_at")
      .eq("fleet_id", current.id).in("plan_id", rows.map(row => row.id)).order("sequence_no");
    if (stopResult.error) notify("שגיאה בטעינת תחנות העבודה: " + stopResult.error.message, "error");
    else {
      const grouped = {};
      for (const stop of stopResult.data || []) (grouped[stop.plan_id] ||= []).push(stop);
      setStopsByPlan(grouped);
    }
  }, [router]);

  useEffect(() => {
    if (!isSupabaseConfigured) { notify("החיבור למסד הנתונים אינו מוגדר.", "error"); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      setSession(data.session);
      await loadData(data.session.user);
      if (alive) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (!next) router.replace("/"); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router, loadData]);

  function updateStop(index, field, value) {
    setForm(old => ({ ...old, stops: old.stops.map((stop, i) => i === index ? { ...stop, [field]: value } : stop) }));
  }

  async function createPlan(event) {
    event.preventDefault();
    if (!canManage || !fleet || busy) return;
    const f = form;
    if (!f.driver_id || !f.vehicle_id || !f.work_date || !f.measurement_reference.trim()) {
      notify("יש למלא תאריך, נהג, רכב ואסמכתת שקילה.", "error"); return;
    }
    if (!f.stops.length || f.stops.some(stop => !stop.address.trim() || !Number.isSafeInteger(Number(stop.planned_quantity_kg)) || Number(stop.planned_quantity_kg) <= 0)) {
      notify("יש להשלים כתובת וכמות מתוכננת חיובית בכל תחנה.", "error"); return;
    }
    const numeric = ["tare_weight_kg","registered_gross_limit_kg","registered_axle_limit_kg","initial_gross_weight_kg","initial_heaviest_axle_kg"];
    if (numeric.some(key => !Number.isSafeInteger(Number(f[key])) || Number(f[key]) <= 0)) {
      notify("יש להזין משקלים שלמים וחיוביים בקילוגרמים.", "error"); return;
    }
    setBusy(true); notify("");
    try {
      const { data, error } = await supabase.rpc("create_daily_work_plan", {
        p_fleet_id: fleet.id,
        p_work_date: f.work_date,
        p_driver_id: f.driver_id,
        p_vehicle_id: f.vehicle_id,
        p_tare_weight_kg: Number(f.tare_weight_kg),
        p_registered_gross_limit_kg: Number(f.registered_gross_limit_kg),
        p_registered_axle_limit_kg: Number(f.registered_axle_limit_kg),
        p_initial_gross_weight_kg: Number(f.initial_gross_weight_kg),
        p_initial_heaviest_axle_kg: Number(f.initial_heaviest_axle_kg),
        p_measurement_at: new Date().toISOString(),
        p_measurement_source: f.measurement_source,
        p_measurement_reference: f.measurement_reference.trim(),
        p_stops: f.stops.map(stop => ({
          operation_kind: stop.operation_kind,
          address: stop.address.trim(),
          planned_quantity_kg: Number(stop.planned_quantity_kg)
        }))
      });
      if (error) { notify("לא ניתן ליצור תוכנית עבודה: " + error.message, "error"); return; }
      setForm(blankForm()); setShowForm(false);
      await loadData(session.user);
      notify("תוכנית העבודה ותחנותיה נשמרו יחד בהצלחה. התוכנית ממתינה להפעלה.", "success");
    } catch (error) {
      notify("יצירת התוכנית נכשלה: " + (error?.message || "שגיאה לא ידועה"), "error");
    } finally { setBusy(false); }
  }

  async function activatePlan(plan) {
    if (!canManage || plan.status !== "planned" || busy) return;
    setBusy(true); notify("");
    try {
      const { error } = await supabase.rpc("activate_daily_work_plan", {
        p_fleet_id: fleet.id,
        p_plan_id: plan.id
      });
      if (error) { notify("לא ניתן להפעיל את התוכנית. ייתכן שכבר קיים שיבוץ פעיל לאותו נהג או רכב: " + error.message, "error"); return; }
      await loadData(session.user);
      notify("התוכנית הופעלה. הנהג יכול לדווח תחנות עם מדידות מאומתות.", "success");
    } finally { setBusy(false); }
  }

  async function completeStop(plan, stop) {
    const input = measurements[stop.id] || {};
    const quantity = Number(input.quantity_kg ?? stop.planned_quantity_kg);
    const gross = Number(input.measured_gross_weight_kg);
    const axle = Number(input.measured_heaviest_axle_kg);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > Number(stop.planned_quantity_kg)) {
      notify("הכמות בפועל חייבת להיות חיובית ולא לחרוג מהכמות המתוכננת.", "error"); return;
    }
    if (![gross, axle].every(value => Number.isSafeInteger(value) && value > 0) || !input.reference?.trim()) {
      notify("נדרשים משקל כולל, עומס הסרן הכבד ביותר ואסמכתת מדידה.", "error"); return;
    }
    setBusy(true); notify("");
    try {
      const { error } = await supabase.rpc("record_daily_load_operation", {
        p_fleet_id: fleet.id,
        p_plan_id: plan.id,
        p_stop_id: stop.id,
        p_event_key: crypto.randomUUID(),
        p_operation_kind: stop.operation_kind,
        p_quantity_kg: quantity,
        p_measured_gross_weight_kg: gross,
        p_measured_heaviest_axle_kg: axle,
        p_measured_at: new Date().toISOString(),
        p_measurement_source: input.source || "weighbridge_ticket",
        p_measurement_reference: input.reference.trim(),
        p_expected_revision: plan.load_revision
      });
      if (error) { notify("התחנה לא עודכנה. בדוק שהשקילה עדכנית ושהמשקלים עומדים במגבלות: " + error.message, "error"); return; }
      await loadData(session.user);
      notify("התחנה הושלמה והמשקלים עודכנו ביומן המאובטח.", "success");
    } catch (error) {
      notify("עדכון התחנה נכשל: " + (error?.message || "שגיאה לא ידועה"), "error");
    } finally { setBusy(false); }
  }

  if (loading) return <main className="fleet-home" dir="rtl"><section className="fleet-content"><div className="fleet-panel">טוען תוכניות עבודה...</div></section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header">
      <div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div>
      <div className="drivers-header-actions">
        <a className="nav-link" href="/"><ArrowRight size={16}/> לוח הבקרה</a>
        <a className="nav-link" href="/tasks"><ClipboardList size={16}/> משימות ונסיעות</a>
      </div>
    </header>
    <section className="fleet-content">
      <div className="fleet-welcome">
        <div><small>תכנון ותפעול יומי</small><h2>תוכניות עבודה והעמסות</h2><p>{fleet?.name || "הצי שלך"} · {plans.length} תוכניות אחרונות</p></div>
        {canManage && <button className="primary-btn" onClick={() => { setShowForm(v => !v); notify(""); }}><Plus size={16}/> תוכנית עבודה חדשה</button>}
      </div>
      {message && <div className="auth-message" role="status" style={messageKind === "success" ? { background: "#eaf8f1", color: "#18794e" } : messageKind === "error" ? { background: "#fff0f0", color: "#9b1c1c" } : {}}>{message}</div>}

      {showForm && canManage && <form className="fleet-panel daily-plan-form" onSubmit={createPlan}>
        <div className="fleet-panel-head"><div><h3>יצירת תוכנית עבודה</h3><p>הפרטים והתחנות נשמרים בפעולה אטומית אחת</p></div></div>
        <div className="task-form-grid">
          <label>תאריך עבודה<input type="date" required value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })}/></label>
          <label>נהג<select required value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}><option value="">בחירת נהג</option>{drivers.filter(d => d.status === "active").map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
          <label>רכב<select required value={form.vehicle_id} onChange={e => { const vehicle = vehicles.find(v => v.id === e.target.value); setForm(old => ({ ...old, vehicle_id: e.target.value, tare_weight_kg: vehicle?.empty_weight_kg ?? "", registered_gross_limit_kg: vehicle?.gross_weight_kg ?? "", registered_axle_limit_kg: vehicle?.weight_per_axle_kg ?? "" })); }}><option value="">בחירת רכב</option>{vehicles.filter(v => ["available","assigned"].includes(v.status) && v.registration_verification_status === "verified" && v.empty_weight_kg != null && v.gross_weight_kg != null && v.weight_per_axle_kg != null).map(v => <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type || "משאית"}</option>)}</select></label>
        </div>
        <h4 className="daily-section-title"><Scale size={17}/> נתוני רכב ושקילה התחלתית</h4>
        <div className="task-form-grid">
          <div className="daily-verified-profile task-wide"><b>מגבלות רכב מאומתות</b>{selectedVehicle ? <p>משקל עצמי: {Number(selectedVehicle.empty_weight_kg).toLocaleString("he-IL")} ק״ג · משקל כולל מותר: {Number(selectedVehicle.gross_weight_kg).toLocaleString("he-IL")} ק״ג · עומס סרן מותר: {Number(selectedVehicle.weight_per_axle_kg).toLocaleString("he-IL")} ק״ג</p> : <p>בחר רכב עם מסמכי רישוי ונתוני משקל שאומתו. לא ניתן לתכנן עם רכב לא מאומת.</p>}</div>
          <label>משקל כולל שנמדד עכשיו (ק״ג)<input required type="number" min="1" step="1" value={form.initial_gross_weight_kg} onChange={e => setForm({ ...form, initial_gross_weight_kg: e.target.value })}/></label>
          <label>עומס הסרן הכבד ביותר שנמדד (ק״ג)<input required type="number" min="1" step="1" value={form.initial_heaviest_axle_kg} onChange={e => setForm({ ...form, initial_heaviest_axle_kg: e.target.value })}/></label>
          <label>מקור המדידה<select value={form.measurement_source} onChange={e => setForm({ ...form, measurement_source: e.target.value })}><option value="weighbridge_ticket">תעודת שקילה</option><option value="certified_onboard_scale">משקל מובנה מאושר</option></select></label>
          <label className="task-wide">מספר תעודה / אסמכתת שקילה<input required maxLength="120" value={form.measurement_reference} onChange={e => setForm({ ...form, measurement_reference: e.target.value })} placeholder="מספר תעודת שקילה או מזהה משקל מאושר"/></label>
        </div>
        <h4 className="daily-section-title"><MapPin size={17}/> תחנות לפי סדר הנסיעה</h4>
        {form.stops.map((stop, index) => <div className="daily-stop-editor" key={index}>
          <b>תחנה {index + 1}</b>
          <label>סוג פעולה<select value={stop.operation_kind} onChange={e => updateStop(index, "operation_kind", e.target.value)}><option value="unload">פריקה</option><option value="load">העמסה</option></select></label>
          <label>כתובת / לקוח<input required maxLength="240" value={stop.address} onChange={e => updateStop(index, "address", e.target.value)} placeholder="כתובת התחנה"/></label>
          <label>כמות מתוכננת (ק״ג)<input required type="number" min="1" step="1" value={stop.planned_quantity_kg} onChange={e => updateStop(index, "planned_quantity_kg", e.target.value)}/></label>
          {form.stops.length > 1 && <button type="button" className="secondary-btn" onClick={() => setForm(old => ({ ...old, stops: old.stops.filter((_, i) => i !== index) }))}>הסרת תחנה</button>}
        </div>)}
        <button type="button" className="secondary-btn" disabled={form.stops.length >= 30} onClick={() => setForm(old => ({ ...old, stops: [...old.stops, blankStop()] }))}><Plus size={15}/> הוספת תחנה</button>
        <div className="daily-safety-note"><Scale size={17}/> יש להזין נתוני שקילה אמיתיים ומאומתים. המערכת אינה מחשבת עומס סרן מתוך כמות המטען.</div>
        <div className="driver-form-actions"><button className="primary-btn" disabled={busy}>{busy ? "שומר..." : "שמירת תוכנית עבודה"}</button><button type="button" className="secondary-btn" disabled={busy} onClick={() => setShowForm(false)}>ביטול</button></div>
      </form>}

      {!canRead ? <div className="fleet-panel">אין סביבת עבודה פעילה להצגה.</div> : plans.length === 0 ? <div className="fleet-panel fleet-empty"><ClipboardList size={32}/><p>עדיין אין תוכניות עבודה.</p><span>{canManage ? "צור תוכנית ראשונה כדי לשבץ נהג, רכב ותחנות." : "תוכניות שיוקצו לך יופיעו כאן."}</span></div> :
        <div className="daily-plan-list">{plans.map(plan => {
          const stops = stopsByPlan[plan.id] || [];
          const completed = stops.filter(stop => stop.status === "completed").length;
          const progress = stops.length ? Math.round(completed / stops.length * 100) : 0;
          return <article className="fleet-panel daily-plan-card" key={plan.id}>
            <div className="fleet-panel-head">
              <div><h3>{new Date(plan.work_date + "T00:00:00").toLocaleDateString("he-IL")} · {vehicleNames.get(plan.vehicle_id) || "רכב"}</h3><p><UserRound size={13}/> {driverNames.get(plan.driver_id) || "נהג"} · גרסה {plan.load_revision}</p></div>
              <span className={"task-status " + (plan.status === "active" ? "task-in_progress" : plan.status === "completed" ? "task-completed" : "task-pending")}>{plan.status === "active" ? "פעילה" : plan.status === "completed" ? "הושלמה" : plan.status === "cancelled" ? "בוטלה" : "ממתינה להפעלה"}</span>
            </div>
            <div className="daily-weight-grid">
              <div><small>משקל כולל נוכחי</small><b>{Number(plan.current_gross_weight_kg).toLocaleString("he-IL")} ק״ג</b></div>
              <div><small>עומס סרן כבד ביותר</small><b>{Number(plan.current_heaviest_axle_kg).toLocaleString("he-IL")} ק״ג</b></div>
              <div><small>מגבלת משקל כולל</small><b>{Number(plan.registered_gross_limit_kg).toLocaleString("he-IL")} ק״ג</b></div>
              <div><small>מקור שקילה אחרונה</small><b>{sourceLabels[plan.measurement_source] || "לא ידוע"}</b></div>
            </div>
            <div className="daily-progress"><span>התקדמות תחנות: {completed}/{stops.length}</span><div><i style={{ width: progress + "%" }}/></div></div>
            {canManage && plan.status === "planned" && <button className="primary-btn" disabled={busy || !stops.length} onClick={() => activatePlan(plan)}><Play size={15}/> הפעלת תוכנית</button>}
            <div className="daily-stop-list">{stops.map(stop => {
              const input = measurements[stop.id] || {};
              const expected = Number(plan.current_gross_weight_kg) + (stop.operation_kind === "load" ? 1 : -1) * Number(input.quantity_kg ?? stop.planned_quantity_kg);
              return <section className="daily-stop" key={stop.id}>
                <div className="daily-stop-heading"><b>{stop.sequence_no}. {stop.operation_kind === "load" ? "העמסה" : "פריקה"} · {stop.address}</b><span className={stop.status === "completed" ? "task-status task-completed" : "task-status task-pending"}>{stop.status === "completed" ? "הושלמה" : "ממתינה"}</span></div>
                <p>כמות מתוכננת: {Number(stop.planned_quantity_kg).toLocaleString("he-IL")} ק״ג {stop.actual_quantity_kg ? "· בוצעו " + Number(stop.actual_quantity_kg).toLocaleString("he-IL") + " ק״ג" : ""}</p>
                {plan.status === "active" && stop.status === "pending" && <div className="daily-measurement-form">
                  <label>כמות בפועל (ק״ג)<input type="number" min="1" max={stop.planned_quantity_kg} step="1" value={input.quantity_kg ?? stop.planned_quantity_kg} onChange={e => setMeasurements(old => ({ ...old, [stop.id]: { ...old[stop.id], quantity_kg: e.target.value } }))}/></label>
                  <label>משקל כולל שנמדד (ק״ג)<input type="number" min="1" step="1" value={input.measured_gross_weight_kg || ""} onChange={e => setMeasurements(old => ({ ...old, [stop.id]: { ...old[stop.id], measured_gross_weight_kg: e.target.value } }))}/></label>
                  <label>עומס סרן כבד ביותר (ק״ג)<input type="number" min="1" step="1" value={input.measured_heaviest_axle_kg || ""} onChange={e => setMeasurements(old => ({ ...old, [stop.id]: { ...old[stop.id], measured_heaviest_axle_kg: e.target.value } }))}/></label>
                  <label>מקור מדידה<select value={input.source || "weighbridge_ticket"} onChange={e => setMeasurements(old => ({ ...old, [stop.id]: { ...old[stop.id], source: e.target.value } }))}><option value="weighbridge_ticket">תעודת שקילה</option><option value="certified_onboard_scale">משקל מובנה מאושר</option></select></label>
                  <label className="daily-wide">מספר תעודה / אסמכתה<input maxLength="120" value={input.reference || ""} onChange={e => setMeasurements(old => ({ ...old, [stop.id]: { ...old[stop.id], reference: e.target.value } }))}/></label>
                  <div className="daily-measurement-hint">שינוי משקל צפוי לפי הכמות: {expected.toLocaleString("he-IL")} ק״ג. האישור יתקבל רק לפי השקילה בפועל ובדיקת השרת.</div>
                  <button className="primary-btn" disabled={busy} onClick={() => completeStop(plan, stop)}><CheckCircle2 size={15}/> אישור שקילה והשלמת תחנה</button>
                </div>}
              </section>;
            })}</div>
          </article>;
        })}</div>}
      <p className="fleet-foot">TruckSafe Fleet V1 · יומן העמסות בלתי־מחיק · עדכון משקל רק לפי מדידה מאומתת</p>
    </section>
  </main>;
}
