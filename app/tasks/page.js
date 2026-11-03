"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { Truck, ArrowRight, Plus, ClipboardList, MapPin, CalendarClock, Play, CheckCircle2, LogOut } from "lucide-react";

const emptyForm = { title: "", description: "", pickup_address: "", delivery_address: "", scheduled_at: "", assigned_driver_id: "", assigned_vehicle_id: "" };
const labels = { pending: "ממתינה לשיבוץ", assigned: "שובצה", in_progress: "בתהליך", completed: "הושלמה", cancelled: "בוטלה" };

export default function TasksPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [trips, setTrips] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [trackingTripId, setTrackingTripId] = useState(null);
  const [preTripTask, setPreTripTask] = useState(null);
  const [preTripChecks, setPreTripChecks] = useState({});
  const preTripItems = ["צמיגים ולחץ אוויר תקינים","בלמים ובלם חניה תקינים","אורות, איתותים וצופר תקינים","מראות, שמשות ומגבים תקינים","אין נזילות או נזק גלוי","המטען מאובטח והמשקל מתאים","מסמכי רכב ורישיון נהיגה בתוקף"];
  const watchIdRef = useRef(null);
  const lastLocationWriteRef = useRef(0);

  useEffect(() => () => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      setSession(data.session);
      await loadWorkspace(data.session.user);
      if (alive) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (!next) router.replace("/"); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  async function loadWorkspace(user) {
    const { data: membership, error } = await supabase.from("fleet_members").select("fleet_id,role").eq("user_id", user.id).limit(1).maybeSingle();
    if (error) { setMessage("לא הצלחנו לטעון את פרטי הצי: " + error.message); return; }
    if (!membership) { router.replace("/"); return; }
    const { data: current, error: fleetError } = await supabase.from("fleets").select("id,name").eq("id", membership.fleet_id).single();
    if (fleetError) { setMessage("שגיאה בטעינת הצי: " + fleetError.message); return; }
    setFleet({ ...current, role: membership.role });
    const [t, d, v, tr] = await Promise.all([
      supabase.from("tasks").select("id,reference_code,title,description,pickup_address,delivery_address,scheduled_at,assigned_driver_id,assigned_vehicle_id,status,created_at").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("drivers").select("id,full_name,status").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id,registration_number,make,vehicle_type,status").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("trips").select("id,task_id,driver_id,vehicle_id,status,origin_address,destination_address,started_at,ended_at").eq("fleet_id", current.id).order("created_at", { ascending: false }).limit(50)
    ]);
    if (t.error) setMessage("שגיאה בטעינת המשימות: " + t.error.message); else setTasks(t.data || []);
    if (d.error) setMessage("שגיאה בטעינת הנהגים: " + d.error.message); else setDrivers(d.data || []);
    if (v.error) setMessage("שגיאה בטעינת כלי הרכב: " + v.error.message); else setVehicles(v.data || []);
    if (tr.error) setMessage("שגיאה בטעינת הנסיעות: " + tr.error.message); else setTrips(tr.data || []);
    const { data: inspectionRows, error: inspectionError } = await supabase.from("inspections").select("id,trip_id,vehicle_id,driver_id,inspection_type,checklist,defects,passed,inspected_at").eq("fleet_id", current.id).order("inspected_at", { ascending: false }).limit(30);
    if (inspectionError) setMessage("שגיאה בטעינת היסטוריית בדיקות הרכב: " + inspectionError.message); else setInspections(inspectionRows || []);
  }

  async function saveTask(e) {
    e.preventDefault();
    if (!fleet || !form.title.trim()) return;
    setBusy(true); setMessage("");
    const payload = {
      fleet_id: fleet.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      pickup_address: form.pickup_address.trim() || null,
      delivery_address: form.delivery_address.trim() || null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      assigned_driver_id: form.assigned_driver_id || null,
      assigned_vehicle_id: form.assigned_vehicle_id || null,
      status: form.assigned_driver_id && form.assigned_vehicle_id ? "assigned" : "pending",
      created_by: session.user.id
    };
    const { error } = await supabase.from("tasks").insert(payload);
    if (error) setMessage("לא הצלחנו לשמור את המשימה: " + error.message);
    else { setForm(emptyForm); setShowForm(false); await loadWorkspace(session.user); setMessage("המשימה נשמרה בהצלחה."); }
    setBusy(false);
  }

  async function updateStatus(task, status) {
    setBusy(true); setMessage("");
    const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id).eq("fleet_id", fleet.id);
    if (error) setMessage("לא הצלחנו לעדכן סטטוס: " + error.message);
    else { await loadWorkspace(session.user); setMessage("סטטוס המשימה עודכן."); }
    setBusy(false);
  }

  async function startTrip(task) {
    if (!task.assigned_driver_id || !task.assigned_vehicle_id) { setMessage("כדי להתחיל נסיעה יש לשייך למשימה גם נהג וגם רכב."); return; }
    setPreTripTask(task); setPreTripChecks({}); setMessage("");
  }

  async function confirmPreTrip() {
    const task = preTripTask;
    if (!task || !fleet) return;
    if (!preTripItems.every((_, i) => preTripChecks[i])) { setMessage("יש לאשר את כל סעיפי בדיקת הרכב לפני פתיחת הנסיעה."); return; }
    setBusy(true); setMessage("");
    const checklist = Object.fromEntries(preTripItems.map((item, i) => [item, Boolean(preTripChecks[i])]));
    const { data: tripId, error } = await supabase.rpc("start_trip_with_inspection", {
      p_fleet_id: fleet.id, p_task_id: task.id, p_driver_id: task.assigned_driver_id,
      p_vehicle_id: task.assigned_vehicle_id, p_origin_address: task.pickup_address,
      p_destination_address: task.delivery_address, p_checklist: checklist
    });
    if (error) setMessage("לא ניתן לפתוח נסיעה או לשמור בדיקת רכב: " + error.message);
    else { setPreTripTask(null); await loadWorkspace(session.user); setMessage("בדיקת הרכב נשמרה והנסיעה נפתחה בהצלחה."); }
    setBusy(false);
  }

  async function endTrip(trip) {
    if (!fleet || !session?.user || !trip?.id) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("finish_trip", {
        p_fleet_id: fleet.id,
        p_trip_id: trip.id
      });
      if (error) {
        setMessage("לא הצלחנו לסיים נסיעה: " + error.message);
        return;
      }
      if (trackingTripId === trip.id) {
        if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setTrackingTripId(null);
      }
      await loadWorkspace(session.user);
      setMessage("הנסיעה והמשימה הסתיימו וסטטוס הרכב עודכן.");
    } catch (error) {
      setMessage("אירעה שגיאה בסיום הנסיעה: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      setBusy(false);
    }
  }

  function stopTracking() {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTrackingTripId(null);
    setMessage("מעקב המיקום הופסק.");
  }

  function startTracking(trip) {
    if (!navigator.geolocation) { setMessage("המכשיר או הדפדפן אינם תומכים בשיתוף מיקום."); return; }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setMessage("מבקש הרשאת מיקום ומתחיל מעקב...");
    lastLocationWriteRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(async position => {
      const now = Date.now();
      if (now - lastLocationWriteRef.current < 10000) return;
      lastLocationWriteRef.current = now;
      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isFinite(accuracy) || accuracy > 500) {
        setMessage("נקודת GPS לא נשמרה: הנתונים אינם תקינים או שדיוק המיקום נמוך מדי.");
        return;
      }
      const { error } = await supabase.from("trip_locations").insert({
        trip_id: trip.id, driver_id: trip.driver_id, latitude, longitude,
        speed_kmh: speed == null || !Number.isFinite(speed) || speed < 0 ? null : Math.round(speed * 3.6 * 10) / 10,
        heading_degrees: heading == null || !Number.isFinite(heading) || heading < 0 || heading > 360 ? null : heading
      });
      if (error) {
        lastLocationWriteRef.current = 0;
        setMessage("המעקב פעיל אך שמירת נקודת מיקום נכשלה: " + error.message);
      } else {
        setMessage("מעקב GPS פעיל — נקודת מיקום נשמרה. דיוק משוער: " + Math.round(accuracy) + " מטר.");
      }
    }, error => {
      setMessage(error.code === 1 ? "לא אושרה הרשאת מיקום. יש לאשר מיקום בדפדפן כדי להתחיל מעקב." : "שגיאה בקבלת מיקום GPS. בדוק שהמיקום מופעל במכשיר.");
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setTrackingTripId(null);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    setTrackingTripId(trip.id);
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }

  if (loading) return <main className="auth-wrap"><section className="auth-card">טוען משימות...</section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header">
      <div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div>
      <div className="drivers-header-actions"><a className="nav-link" href="/"><ArrowRight size={16}/> לוח הבקרה</a><a className="nav-link" href="/drivers">ניהול נהגים</a><button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button></div>
    </header>
    <section className="fleet-content">
      <div className="fleet-welcome"><div><small>תכנון ותפעול</small><h2>משימות ונסיעות</h2><p>{fleet?.name || "הצי שלך"} · {tasks.length} משימות</p></div><span className="role-pill"><ClipboardList size={14}/> ניהול משימות</span></div>
      {message && <div className="auth-message">{message}</div>}
      {preTripTask && <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>בדיקת רכב לפני יציאה</h3><p>{preTripTask.title} · יש לאשר כל סעיף לאחר בדיקה בפועל</p></div><span className="role-pill">בדיקת בטיחות</span></div><div className="task-list">{preTripItems.map((item, i) => <label className="task-assignees" key={item} style={{ padding: "10px 4px", alignItems: "center" }}><input type="checkbox" checked={Boolean(preTripChecks[i])} onChange={e => setPreTripChecks(old => ({ ...old, [i]: e.target.checked }))}/>{item}</label>)}</div><div className="task-actions"><button className="primary-btn" disabled={busy || !preTripItems.every((_, i) => preTripChecks[i])} onClick={confirmPreTrip}>אישור בדיקה ופתיחת נסיעה</button><button className="secondary-btn" disabled={busy} onClick={() => setPreTripTask(null)}>ביטול</button></div></section>}
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>נסיעות פעילות</h3><p>מעקב ועדכון נסיעות שהתחילו</p></div><span className="role-pill">{trips.filter(t=>t.status==="active").length} פעילות</span></div>
        {trips.filter(t=>t.status==="active").length === 0 ? <div className="fleet-empty">אין כרגע נסיעות פעילות.</div> :
          <div className="task-list">{trips.filter(t=>t.status==="active").map(trip => <article className="task-card" key={trip.id}>
            <div className="task-card-top"><div><b>{tasks.find(t=>t.id===trip.task_id)?.title || "נסיעה ללא משימה"}</b><small>התחלה: {trip.started_at ? new Date(trip.started_at).toLocaleString("he-IL") : "לא צוין"}</small></div><span className="task-status task-in_progress">בנסיעה</span></div>
            <div className="task-assignees"><span>נהג: {drivers.find(d=>d.id===trip.driver_id)?.full_name || "לא ידוע"}</span><span>רכב: {vehicles.find(v=>v.id===trip.vehicle_id)?.registration_number || "לא ידוע"}</span></div>
            <div className="task-route"><span><MapPin size={14}/> {trip.origin_address || "מוצא לא צוין"}</span><span><MapPin size={14}/> {trip.destination_address || "יעד לא צוין"}</span></div>
            <div className="task-actions">{trackingTripId===trip.id ? <button className="secondary-btn" disabled={busy} onClick={stopTracking}>עצירת מעקב GPS</button> : <button className="secondary-btn" disabled={busy || trackingTripId!==null} onClick={()=>startTracking(trip)}>התחלת מעקב GPS רציף</button>}<button className="primary-btn" disabled={busy} onClick={()=>endTrip(trip)}><CheckCircle2 size={14}/> סיום נסיעה</button></div>
          </article>)}</div>}
      </section>
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>היסטוריית בדיקות רכב</h3><p>בדיקות לפני נסיעה שנשמרו במערכת</p></div><span className="role-pill">{inspections.length} בדיקות</span></div>
        {inspections.length === 0 ? <div className="fleet-empty">עדיין לא נשמרו בדיקות רכב.</div> : <div className="task-list">{inspections.map(item => <article className="task-card" key={item.id}>
          <div className="task-card-top"><div><b>{item.inspection_type === "pre_trip" ? "בדיקה לפני נסיעה" : item.inspection_type}</b><small>{item.inspected_at ? new Date(item.inspected_at).toLocaleString("he-IL") : "מועד לא צוין"}</small></div><span className={"task-status " + (item.passed ? "task-completed" : "task-in_progress")}>{item.passed ? "עבר" : "נמצאו ליקויים"}</span></div>
          <div className="task-assignees"><span>נהג: {drivers.find(d => d.id === item.driver_id)?.full_name || "לא ידוע"}</span><span>רכב: {vehicles.find(v => v.id === item.vehicle_id)?.registration_number || "לא ידוע"}</span></div>
          <div className="task-route">{Object.entries(item.checklist || {}).map(([label, checked]) => <span key={label}>{checked ? "✓" : "✕"} {label}</span>)}</div>
          {item.defects && <p className="task-description">ליקויים: {item.defects}</p>}
        </article>)}</div>}
      </section>
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>משימות הצי</h3><p>יצירת משימות, שיוך נהגים וכלי רכב ומעקב סטטוס</p></div><button className="primary-btn" onClick={() => { setShowForm(!showForm); setMessage(""); }}><Plus size={16}/> משימה חדשה</button></div>
        {showForm && <form className="task-form" onSubmit={saveTask}>
          <div className="driver-form-title">פרטי המשימה</div>
          <div className="task-form-grid">
            <label>כותרת המשימה *<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="לדוגמה: הובלת מטען ללקוח"/></label>
            <label>כתובת איסוף<input value={form.pickup_address} onChange={e=>setForm({...form,pickup_address:e.target.value})} placeholder="כתובת או נקודת איסוף"/></label>
            <label>כתובת יעד<input value={form.delivery_address} onChange={e=>setForm({...form,delivery_address:e.target.value})} placeholder="כתובת היעד"/></label>
            <label>מועד מתוכנן<input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label>
            <label>שיוך נהג<select value={form.assigned_driver_id} onChange={e=>setForm({...form,assigned_driver_id:e.target.value})}><option value="">ללא נהג</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
            <label>שיוך רכב<select value={form.assigned_vehicle_id} onChange={e=>setForm({...form,assigned_vehicle_id:e.target.value})}><option value="">ללא רכב</option>{vehicles.filter(v=>v.status==="available" || v.status==="assigned").map(v=><option key={v.id} value={v.id}>{v.registration_number} · {v.make || v.vehicle_type}</option>)}</select></label>
            <label className="task-wide">הערות / תיאור<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="פרטים נוספים לנהג או למנהל הצי"/></label>
          </div>
          <div className="driver-form-actions"><button className="primary-btn" disabled={busy}>{busy ? "שומר..." : "שמירת משימה"}</button><button type="button" className="secondary-btn" onClick={()=>{setShowForm(false);setForm(emptyForm);}}>ביטול</button></div>
        </form>}
        {tasks.length === 0 ? <div className="fleet-empty"><ClipboardList size={30}/><p>עדיין אין משימות בצי.</p><span>לחץ על "משימה חדשה" כדי ליצור את המשימה הראשונה.</span></div> :
          <div className="task-list">{tasks.map(task => <article className="task-card" key={task.id}>
            <div className="task-card-top"><div><b>{task.title}</b><small>{task.reference_code || "משימה"} · {new Date(task.created_at).toLocaleDateString("he-IL")}</small></div><span className={"task-status task-"+task.status}>{labels[task.status] || task.status}</span></div>
            {(task.pickup_address || task.delivery_address) && <div className="task-route"><span><MapPin size={14}/> איסוף: {task.pickup_address || "לא צוין"}</span><span><MapPin size={14}/> יעד: {task.delivery_address || "לא צוין"}</span></div>}
            <div className="task-assignees"><span>נהג: {drivers.find(d=>d.id===task.assigned_driver_id)?.full_name || "לא שובץ"}</span><span>רכב: {vehicles.find(v=>v.id===task.assigned_vehicle_id)?.registration_number || "לא שובץ"}</span>{task.scheduled_at && <span><CalendarClock size={13}/> {new Date(task.scheduled_at).toLocaleString("he-IL")}</span>}</div>
            {task.description && <p className="task-description">{task.description}</p>}
            <div className="task-actions"><label>סטטוס<select disabled={busy} value={task.status} onChange={e=>updateStatus(task,e.target.value)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{!["completed","cancelled"].includes(task.status) && <button className="primary-btn" disabled={busy} onClick={()=>startTrip(task)}><Play size={14}/> פתיחת נסיעה</button>}</div>
          </article>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · המשימות והנסיעות נשמרות במסד הנתונים</p>
    </section>
  </main>;
}
