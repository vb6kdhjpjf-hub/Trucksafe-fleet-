"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { buildPreTripChecklist } from "../../lib/pre-trip-checklist.mjs";
import { isDriverEligibleForVehicleAssignment } from "../../lib/driver-eligibility.mjs";
import { isFreshGpsTimestamp, isValidIsraelGpsCoordinates } from "../../lib/map-location-safety.mjs";
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
  const [currentDriverId, setCurrentDriverId] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [trackingTripId, setTrackingTripId] = useState(null);
  const [preTripTask, setPreTripTask] = useState(null);
  const [preTripChecks, setPreTripChecks] = useState({});
  const [preTripDefectDetails, setPreTripDefectDetails] = useState("");
  const preTripItems = ["צמיגים ולחץ אוויר תקינים","בלמים ובלם חניה תקינים","אורות, איתותים וצופר תקינים","מראות, שמשות ומגבים תקינים","אין נזילות או נזק גלוי","המטען מאובטח והמשקל מתאים","מסמכי רכב ורישיון נהיגה בתוקף"];
  const watchIdRef = useRef(null);
  const lastLocationWriteRef = useRef(0);
  const locationWriteInFlightRef = useRef(false);
  const trackingGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const authUserIdRef = useRef(null);

  function isCurrentAuthSession(generation = authGenerationRef.current, userId = authUserIdRef.current) {
    return generation === authGenerationRef.current
      && Boolean(userId)
      && userId === authUserIdRef.current
      && userId === session?.user?.id;
  }

  useEffect(() => () => {
    trackingGenerationRef.current += 1;
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      if (nextUserId && authUserIdRef.current && nextUserId !== authUserIdRef.current) {
        authGenerationRef.current += 1;
        trackingGenerationRef.current += 1;
        if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setTrackingTripId(null);
        setSession(null); setFleet(null); setTasks([]); setTrips([]); setInspections([]);
        setDrivers([]); setVehicles([]); setCurrentDriverId(null);
        setForm(emptyForm); setShowForm(false); setBusy(false);
        setPreTripTask(null); setPreTripChecks({}); setPreTripDefectDetails(""); setMessage("");
        authUserIdRef.current = nextUserId;
        if (typeof window !== "undefined") window.location.reload();
        return;
      }
      if (nextUserId) authUserIdRef.current = nextUserId;
      if (!nextSession) {
        authUserIdRef.current = null;
        authGenerationRef.current += 1;
        trackingGenerationRef.current += 1;
        if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setTrackingTripId(null);
        setSession(null); setFleet(null); setTasks([]); setTrips([]); setInspections([]);
        setDrivers([]); setVehicles([]); setCurrentDriverId(null);
        setForm(emptyForm); setShowForm(false); setBusy(false);
        setPreTripTask(null); setPreTripChecks({}); setPreTripDefectDetails(""); setMessage("");
        router.replace("/");
      }
    });
    const initialAuthGeneration = authGenerationRef.current;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive || initialAuthGeneration !== authGenerationRef.current) return;
      if (error || !data.session) { router.replace("/"); return; }
      authUserIdRef.current = data.session.user.id;
      setSession(data.session);
      await loadWorkspace(data.session.user, initialAuthGeneration);
      if (alive && initialAuthGeneration === authGenerationRef.current) setLoading(false);
    }).catch(error => {
      if (!alive || initialAuthGeneration !== authGenerationRef.current) return;
      setMessage("לא הצלחנו לטעון את המשימות: " + (error?.message || "שגיאה לא ידועה"));
      setLoading(false);
    });
    return () => { alive = false; authGenerationRef.current += 1; subscription.unsubscribe(); };
  }, [router]);

  async function loadWorkspace(user, authGeneration = authGenerationRef.current) {
    const { data, error } = await resolveFleetWorkspace(supabase, user.id);
    if (authGeneration !== authGenerationRef.current) return;
    if (error) {
      if (error.code === "AUTH_REQUIRED" || error.code === "NO_FLEET") router.replace("/");
      else setMessage("לא הצלחנו לאמת את הצי: " + error.message);
      return;
    }
    const current = data.fleet;
    setFleet(current);
    const [t, d, v, tr, currentDriver] = await Promise.all([
      supabase.from("tasks").select("id,reference_code,title,description,pickup_address,delivery_address,scheduled_at,assigned_driver_id,assigned_vehicle_id,status,created_at").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("drivers").select("id,full_name,status,license_expires_at").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id,registration_number,make,vehicle_type,status").eq("fleet_id", current.id).order("created_at", { ascending: false }),
      supabase.from("trips").select("id,task_id,driver_id,vehicle_id,status,origin_address,destination_address,started_at,ended_at").eq("fleet_id", current.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("drivers").select("id").eq("fleet_id", current.id).eq("user_id", user.id).maybeSingle()
    ]);
    if (authGeneration !== authGenerationRef.current) return;
    if (t.error) setMessage("שגיאה בטעינת המשימות: " + t.error.message); else setTasks(t.data || []);
    if (d.error) setMessage("שגיאה בטעינת הנהגים: " + d.error.message); else setDrivers(d.data || []);
    if (v.error) setMessage("שגיאה בטעינת כלי הרכב: " + v.error.message); else setVehicles(v.data || []);
    if (tr.error) setMessage("שגיאה בטעינת הנסיעות: " + tr.error.message); else setTrips(tr.data || []);
    setCurrentDriverId(currentDriver?.data?.id || null);
    if (currentDriver?.error) setMessage("לא הצלחנו לאמת את שיוך הנהג לחשבון. פעולות נסיעה יישארו חסומות עד לבדיקה.");
    const { data: inspectionRows, error: inspectionError } = await supabase.from("inspections").select("id,trip_id,vehicle_id,driver_id,inspection_type,checklist,defects,passed,inspected_at").eq("fleet_id", current.id).order("inspected_at", { ascending: false }).limit(30);
    if (authGeneration !== authGenerationRef.current) return;
    if (inspectionError) setMessage("שגיאה בטעינת היסטוריית בדיקות הרכב: " + inspectionError.message); else setInspections(inspectionRows || []);
  }

  const canManageTasks = ["owner", "fleet_manager", "dispatcher"].includes(fleet?.role);
  const isAssignedDriver = driverId => Boolean(currentDriverId && currentDriverId === driverId);
  const canOperateTrip = trip => canManageTasks || isAssignedDriver(trip?.driver_id);

  async function saveTask(e) {
    e.preventDefault();
    const generation = authGenerationRef.current;
    const requestingUserId = authUserIdRef.current;
    if (!isCurrentAuthSession(generation, requestingUserId)) return;
    if (!fleet || !form.title.trim()) return;
    if (!canManageTasks) { setMessage("אין לך הרשאה לניהול משימות."); return; }
    if (form.assigned_driver_id) {
      const selectedDriver = drivers.find(driver => driver.id === form.assigned_driver_id);
      if (!isDriverEligibleForVehicleAssignment(selectedDriver)) {
        setMessage("לא ניתן לשבץ נהג שאינו פעיל או שתוקף רישיונו חסר או פג. יש לעדכן את פרטי הנהג לפני השיבוץ.");
        return;
      }
    }
    setBusy(true); setMessage("");
    try {
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
        created_by: requestingUserId
      };
      const { error } = await supabase.from("tasks").insert(payload);
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      if (error) { setMessage("לא הצלחנו לשמור את המשימה: " + error.message); return; }
      setForm(emptyForm); setShowForm(false);
      await loadWorkspace(session.user, generation);
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("המשימה נשמרה בהצלחה.");
    } catch (error) {
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("שמירת המשימה נכשלה: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      if (isCurrentAuthSession(generation, requestingUserId)) setBusy(false);
    }
  }

  async function updateStatus(task, status) {
    const generation = authGenerationRef.current;
    const requestingUserId = authUserIdRef.current;
    if (!isCurrentAuthSession(generation, requestingUserId)) return;
    if (!fleet || !canManageTasks) { setMessage("אין לך הרשאה לעדכון סטטוס משימה."); return; }
    if (!["pending", "assigned", "cancelled"].includes(status)) { setMessage("סטטוס זה אינו ניתן לעדכון ידני."); return; }
    setBusy(true); setMessage("");
    try {
      if (status === "cancelled") {
        const { data: activeTrip, error: activeTripError } = await supabase
          .from("trips").select("id").eq("task_id", task.id).eq("status", "active").limit(1).maybeSingle();
        if (!isCurrentAuthSession(generation, requestingUserId)) return;
        if (activeTripError) { setMessage("לא ניתן לאמת אם קיימת נסיעה פעילה. נסה שוב לפני ביטול המשימה."); return; }
        if (activeTrip) { setMessage("לא ניתן לבטל משימה בזמן שהנסיעה שלה פעילה. יש לסיים את הנסיעה תחילה."); return; }
      }
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id).eq("fleet_id", fleet.id);
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      if (error) { setMessage("לא הצלחנו לעדכן סטטוס: " + error.message); return; }
      await loadWorkspace(session.user, generation);
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("סטטוס המשימה עודכן.");
    } catch (error) {
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("עדכון סטטוס המשימה נכשל: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      if (isCurrentAuthSession(generation, requestingUserId)) setBusy(false);
    }
  }

  async function startTrip(task) {
    if (!canManageTasks && !isAssignedDriver(task?.assigned_driver_id)) { setMessage("רק מנהל מורשה או הנהג המשויך למשימה יכולים לפתוח נסיעה."); return; }
    if (!task.assigned_driver_id || !task.assigned_vehicle_id) { setMessage("כדי להתחיל נסיעה יש לשייך למשימה גם נהג וגם רכב."); return; }
    setPreTripTask(task); setPreTripChecks({}); setPreTripDefectDetails(""); setMessage("");
  }

  async function confirmPreTrip() {
    const generation = authGenerationRef.current;
    const requestingUserId = authUserIdRef.current;
    const task = preTripTask;
    if (!isCurrentAuthSession(generation, requestingUserId) || !task || !fleet || !session?.user) return;
    const result = buildPreTripChecklist(preTripItems, preTripChecks, preTripDefectDetails);
    if (!result.valid) { setMessage(result.message); return; }
    setBusy(true); setMessage("");
    try {
      const { data: startedTripId, error } = await supabase.rpc("start_trip_with_inspection", {
        p_fleet_id: fleet.id, p_task_id: task.id, p_driver_id: task.assigned_driver_id,
        p_vehicle_id: task.assigned_vehicle_id, p_origin_address: task.pickup_address,
        p_destination_address: task.delivery_address, p_checklist: result.checklist
      });
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      if (error) { setMessage("לא ניתן לפתוח נסיעה או לשמור בדיקת רכב: " + error.message); return; }
      setPreTripTask(null);
      setPreTripDefectDetails("");
      await loadWorkspace(session.user, generation);
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      if (!startedTripId) {
        setMessage(result.hasDefects
          ? "נמצאו ליקויים. הבדיקה נשמרה ונפתח אירוע בטיחות, אך הנסיעה לא נפתחה. יש לטפל בליקוי ולקבל אישור לפני יציאה."
          : "הבדיקה נשמרה, אך הנסיעה לא נפתחה. יש לבדוק את תנאי הכשירות של הנהג והרכב לפני יציאה.");
        return;
      }
      setMessage("בדיקת הרכב נשמרה והנסיעה נפתחה בהצלחה.");
    } catch (error) {
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("אירעה שגיאה בפתיחת הנסיעה: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      if (isCurrentAuthSession(generation, requestingUserId)) setBusy(false);
    }
  }

  async function endTrip(trip) {
    const generation = authGenerationRef.current;
    const requestingUserId = authUserIdRef.current;
    if (!isCurrentAuthSession(generation, requestingUserId)) return;
    if (!canOperateTrip(trip)) { setMessage("רק מנהל מורשה או הנהג המשויך לנסיעה יכולים לסיים אותה."); return; }
    if (!fleet || !session?.user || !trip?.id) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("finish_trip", {
        p_fleet_id: fleet.id,
        p_trip_id: trip.id
      });
      if (!isCurrentAuthSession(generation, requestingUserId)) return;
      if (error) { setMessage("לא הצלחנו לסיים נסיעה: " + error.message); return; }
      if (trackingTripId === trip.id) {
        trackingGenerationRef.current += 1;
        if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setTrackingTripId(null);
      }
      await loadWorkspace(session.user, generation);
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("הנסיעה והמשימה הסתיימו וסטטוס הרכב עודכן.");
    } catch (error) {
      if (isCurrentAuthSession(generation, requestingUserId)) setMessage("אירעה שגיאה בסיום הנסיעה: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      if (isCurrentAuthSession(generation, requestingUserId)) setBusy(false);
    }
  }

  function stopTracking() {
    trackingGenerationRef.current += 1;
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTrackingTripId(null);
    setMessage("מעקב המיקום הופסק.");
  }

  function startTracking(trip) {
    if (!isAssignedDriver(trip?.driver_id)) { setMessage("מעקב GPS יכול להתחיל רק ממכשיר הנהג המשויך לנסיעה."); return; }
    if (!navigator.geolocation) { setMessage("המכשיר או הדפדפן אינם תומכים בשיתוף מיקום."); return; }
    trackingGenerationRef.current += 1;
    const generation = trackingGenerationRef.current;
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setMessage("מבקש הרשאת מיקום ומתחיל מעקב...");
    lastLocationWriteRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(async position => {
      if (generation !== trackingGenerationRef.current) return;
      const now = Date.now();
      if (locationWriteInFlightRef.current || now - lastLocationWriteRef.current < 10000) return;
      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      if (!isValidIsraelGpsCoordinates(latitude, longitude)
        || !isFreshGpsTimestamp(position.timestamp, now)
        || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 500) {
        setMessage("נקודת GPS לא נשמרה: המיקום מחוץ לאזור הפעילות, הנתון ישן או שהדיוק אינו מספיק.");
        return;
      }
      locationWriteInFlightRef.current = true;
      lastLocationWriteRef.current = now;
      try {
        const { error } = await supabase.from("trip_locations").insert({
          trip_id: trip.id, driver_id: trip.driver_id, latitude, longitude,
          speed_kmh: speed == null || !Number.isFinite(speed) || speed < 0 ? null : Math.round(speed * 3.6 * 10) / 10,
          heading_degrees: heading == null || !Number.isFinite(heading) || heading < 0 || heading > 360 ? null : heading
        });
        if (generation !== trackingGenerationRef.current) return;
        if (error) {
          lastLocationWriteRef.current = 0;
          setMessage("המעקב פעיל אך שמירת נקודת מיקום נכשלה: " + error.message);
        } else {
          setMessage("מעקב GPS פעיל — נקודת מיקום נשמרה. דיוק משוער: " + Math.round(accuracy) + " מטר.");
        }
      } catch (error) {
        if (generation !== trackingGenerationRef.current) return;
        lastLocationWriteRef.current = 0;
        setMessage("המעקב פעיל אך שמירת נקודת מיקום נכשלה: " + (error?.message || "שגיאה לא ידועה"));
      } finally {
        locationWriteInFlightRef.current = false;
      }
    }, error => {
      if (generation !== trackingGenerationRef.current) return;
      setMessage(error.code === 1 ? "לא אושרה הרשאת מיקום. יש לאשר מיקום בדפדפן כדי להתחיל מעקב." : "שגיאה בקבלת מיקום GPS. בדוק שהמיקום מופעל במכשיר.");
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      trackingGenerationRef.current += 1;
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
      {preTripTask && <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>בדיקת רכב לפני יציאה</h3><p>{preTripTask.title} · יש לאשר כל סעיף לאחר בדיקה בפועל</p></div><span className="role-pill">בדיקת בטיחות</span></div><div className="task-list">{preTripItems.map((item, i) => <div className="task-assignees" key={item} style={{ padding: "10px 4px", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span>{item}</span><select aria-label={item} value={preTripChecks[i] === true ? "ok" : preTripChecks[i] === false ? "defect" : ""} onChange={e => setPreTripChecks(old => ({ ...old, [i]: e.target.value === "ok" ? true : e.target.value === "defect" ? false : undefined }))}><option value="">בחר מצב</option><option value="ok">תקין</option><option value="defect">לא תקין</option></select></div>)}</div>{preTripItems.some((_, i) => preTripChecks[i] === false) && <label style={{ display: "grid", gap: 6, marginTop: 12 }}>פירוט הליקוי (חובה, לפחות 5 תווים)<textarea rows={3} maxLength={1000} value={preTripDefectDetails} onChange={e => setPreTripDefectDetails(e.target.value)} placeholder="תאר מה נמצא, באיזה רכיב ומה דורש טיפול" /></label>}<div className="task-actions"><button className="primary-btn" disabled={busy || !preTripItems.every((_, i) => typeof preTripChecks[i] === "boolean") || (preTripItems.some((_, i) => preTripChecks[i] === false) && preTripDefectDetails.trim().length < 5)} onClick={confirmPreTrip}>{preTripItems.some((_, i) => preTripChecks[i] === false) ? "שמירת בדיקה ודיווח תקלה" : "אישור בדיקה ופתיחת נסיעה"}</button><button className="secondary-btn" disabled={busy} onClick={() => { setPreTripTask(null); setPreTripDefectDetails(""); }}>ביטול</button></div></section>}
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>נסיעות פעילות</h3><p>מעקב ועדכון נסיעות שהתחילו</p></div><span className="role-pill">{trips.filter(t=>t.status==="active").length} פעילות</span></div>
        {trips.filter(t=>t.status==="active").length === 0 ? <div className="fleet-empty">אין כרגע נסיעות פעילות.</div> :
          <div className="task-list">{trips.filter(t=>t.status==="active").map(trip => <article className="task-card" key={trip.id}>
            <div className="task-card-top"><div><b>{tasks.find(t=>t.id===trip.task_id)?.title || "נסיעה ללא משימה"}</b><small>התחלה: {trip.started_at ? new Date(trip.started_at).toLocaleString("he-IL") : "לא צוין"}</small></div><span className="task-status task-in_progress">בנסיעה</span></div>
            <div className="task-assignees"><span>נהג: {drivers.find(d=>d.id===trip.driver_id)?.full_name || "לא ידוע"}</span><span>רכב: {vehicles.find(v=>v.id===trip.vehicle_id)?.registration_number || "לא ידוע"}</span></div>
            <div className="task-route"><span><MapPin size={14}/> {trip.origin_address || "מוצא לא צוין"}</span><span><MapPin size={14}/> {trip.destination_address || "יעד לא צוין"}</span></div>
            <div className="task-actions">{isAssignedDriver(trip.driver_id) ? (trackingTripId===trip.id ? <button className="secondary-btn" disabled={busy} onClick={stopTracking}>עצירת מעקב GPS</button> : <button className="secondary-btn" disabled={busy || trackingTripId!==null} onClick={()=>startTracking(trip)}>התחלת מעקב GPS רציף</button>) : <span className="task-description">מעקב GPS זמין ממכשיר הנהג המשויך בלבד</span>}{canOperateTrip(trip) && <button className="primary-btn" disabled={busy} onClick={()=>endTrip(trip)}><CheckCircle2 size={14}/> סיום נסיעה</button>}</div>
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
        <div className="fleet-panel-head"><div><h3>משימות הצי</h3><p>יצירת משימות, שיוך נהגים וכלי רכב ומעקב סטטוס</p></div>{canManageTasks&&<button className="primary-btn" onClick={() => { setShowForm(!showForm); setMessage(""); }}><Plus size={16}/> משימה חדשה</button>}</div>
        {showForm && canManageTasks && <form className="task-form" onSubmit={saveTask}>
          <div className="driver-form-title">פרטי המשימה</div>
          <div className="task-form-grid">
            <label>כותרת המשימה *<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="לדוגמה: הובלת מטען ללקוח"/></label>
            <label>כתובת איסוף<input value={form.pickup_address} onChange={e=>setForm({...form,pickup_address:e.target.value})} placeholder="כתובת או נקודת איסוף"/></label>
            <label>כתובת יעד<input value={form.delivery_address} onChange={e=>setForm({...form,delivery_address:e.target.value})} placeholder="כתובת היעד"/></label>
            <label>מועד מתוכנן<input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label>
            <label>שיוך נהג<select value={form.assigned_driver_id} onChange={e=>setForm({...form,assigned_driver_id:e.target.value})}><option value="">ללא נהג</option>{drivers.filter(d=>isDriverEligibleForVehicleAssignment(d)).map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
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
            <div className="task-actions"><label>סטטוס<select disabled={busy||!canManageTasks} value={task.status} onChange={e=>updateStatus(task,e.target.value)}>{Object.entries(labels).filter(([value])=>["pending","assigned","cancelled"].includes(value)||value===task.status).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{!["completed","cancelled"].includes(task.status) && (canManageTasks || isAssignedDriver(task.assigned_driver_id)) && <button className="primary-btn" disabled={busy} onClick={()=>startTrip(task)}><Play size={14}/> פתיחת נסיעה</button>}</div>
          </article>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · המשימות והנסיעות נשמרות במסד הנתונים</p>
    </section>
  </main>;
}
