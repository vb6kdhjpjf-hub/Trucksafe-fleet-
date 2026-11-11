"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { Truck, ArrowRight, Plus, AlertTriangle, MapPin, LogOut, CheckCircle2 } from "lucide-react";

const emptyForm = { incident_type: "תקלה ברכב", severity: "medium", description: "", location_text: "", driver_id: "", vehicle_id: "" };
const severityLabels = { low: "נמוכה", medium: "בינונית", high: "גבוהה", critical: "קריטית" };
const statusLabels = { open: "פתוח", reported: "דווח", investigating: "בטיפול", resolved: "טופל" };

export default function IncidentsPage() {
  const router = useRouter();
  const [session,setSession] = useState(null);
  const [fleet,setFleet] = useState(null);
  const [incidents,setIncidents] = useState([]);
  const [drivers,setDrivers] = useState([]);
  const [vehicles,setVehicles] = useState([]);
  const [form,setForm] = useState(emptyForm);
  const [showForm,setShowForm] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [gps,setGps] = useState({latitude:null,longitude:null});
  const [gpsBusy,setGpsBusy] = useState(false);
  const [photoFile,setPhotoFile] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({data,error}) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      setSession(data.session);
      await loadWorkspace(data.session.user);
      if (alive) setLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => { if (!next) router.replace("/"); });
    return () => { alive = false; subscription.unsubscribe(); };
  },[router]);

  async function loadWorkspace(user) {
    const { data, error } = await resolveFleetWorkspace(supabase, user.id);
    if (error) {
      if (error.code === "AUTH_REQUIRED" || error.code === "NO_FLEET") router.replace("/");
      else setMessage("לא הצלחנו לאמת את הצי: " + error.message);
      return;
    }
    const current = data.fleet;
    setFleet(current);
    await loadIncidents(current.id);
    const [d,v] = await Promise.all([
      supabase.from("drivers").select("id,full_name").eq("fleet_id",current.id),
      supabase.from("vehicles").select("id,registration_number").eq("fleet_id",current.id)
    ]);
    if (!d.error) setDrivers(d.data||[]);
    if (!v.error) setVehicles(v.data||[]);
  }

  async function loadIncidents(fleetId) {
    const {data,error} = await supabase.from("incidents")
      .select("id,incident_type,severity,description,location_text,latitude,longitude,status,reported_at,resolved_at,driver_id,vehicle_id,photo_path")
      .eq("fleet_id",fleetId).order("reported_at",{ascending:false});
    if (error) setMessage("שגיאה בטעינת אירועי הבטיחות: "+error.message);
    else {
      const rows = await Promise.all((data||[]).map(async item => {
        if (!item.photo_path) return item;
        const {data:photo} = await supabase.storage.from("incident-photos").createSignedUrl(item.photo_path,3600);
        return {...item,photo_url:photo?.signedUrl||null};
      }));
      setIncidents(rows);
    }
  }

  function captureIncidentLocation() {
    if (!navigator.geolocation) { setMessage("המכשיר אינו תומך בקבלת מיקום GPS."); return; }
    setGpsBusy(true); setMessage("מקבל מיקום GPS...");
    navigator.geolocation.getCurrentPosition(position => {
      const latitude=position.coords.latitude, longitude=position.coords.longitude;
      setGps({latitude,longitude});
      setForm(old=>({...old,location_text:old.location_text||"מיקום GPS"}));
      setGpsBusy(false); setMessage("מיקום האירוע נקלט בהצלחה.");
    }, error => {
      setGpsBusy(false);
      setMessage(error.code===1?"לא אושרה הרשאת מיקום. אפשר להזין מיקום ידנית.":"לא ניתן לקבל מיקום כרגע. אפשר להזין מיקום ידנית.");
    }, {enableHighAccuracy:true,timeout:20000,maximumAge:10000});
  }

  async function submitIncident(e) {
    e.preventDefault();
    if (!fleet || !session) return;
    if (!form.description.trim()) { setMessage("יש לתאר את האירוע לפני השליחה."); return; }
    if (form.driver_id && !drivers.some(driver=>driver.id===form.driver_id)) { setMessage("הנהג שנבחר אינו שייך לצי הפעיל. רענן את הרשימה ובחר נהג תקין."); return; }
    if (form.vehicle_id && !vehicles.some(vehicle=>vehicle.id===form.vehicle_id)) { setMessage("הרכב שנבחר אינו שייך לצי הפעיל. רענן את הרשימה ובחר רכב תקין."); return; }
    if ((gps.latitude == null) !== (gps.longitude == null)) { setMessage("נתוני המיקום אינם מלאים. נסה לקלוט GPS מחדש או נקה את המיקום."); return; }
    setBusy(true); setMessage("");
    let photoPath = null;
    try {
      if (photoFile) {
        if (!["image/jpeg","image/png","image/webp"].includes(photoFile.type)) { setMessage("אפשר להעלות תמונה מסוג JPG, PNG או WEBP בלבד."); return; }
        if (photoFile.size > 5 * 1024 * 1024) { setMessage("גודל התמונה המרבי הוא 5MB."); return; }
        const extension = photoFile.type === "image/png" ? "png" : photoFile.type === "image/webp" ? "webp" : "jpg";
        photoPath = fleet.id+"/incidents/"+crypto.randomUUID()+"."+extension;
        const {error:uploadError} = await supabase.storage.from("incident-photos").upload(photoPath,photoFile,{contentType:photoFile.type,upsert:false});
        if (uploadError) { setMessage("העלאת התמונה נכשלה: "+uploadError.message); return; }
      }
      const payload = {
        fleet_id:fleet.id, incident_type:form.incident_type, severity:form.severity,
        description:form.description.trim(), location_text:form.location_text.trim()||null,
        driver_id:form.driver_id||null, vehicle_id:form.vehicle_id||null,
        latitude:gps.latitude, longitude:gps.longitude, photo_path:photoPath,
        status:"open", reported_at:new Date().toISOString(), created_by:session.user.id
      };
      const {error} = await supabase.from("incidents").insert(payload);
      if (error) {
        if (photoPath) {
          const {error:cleanupError} = await supabase.storage.from("incident-photos").remove([photoPath]);
          setMessage("לא הצלחנו לדווח על האירוע: "+error.message+(cleanupError ? " בנוסף, מחיקת התמונה נכשלה: "+cleanupError.message : ""));
          photoPath = null;
        } else setMessage("לא הצלחנו לדווח על האירוע: "+error.message);
        return;
      }
      photoPath = null;
      setForm(emptyForm); setGps({latitude:null,longitude:null}); setPhotoFile(null); setShowForm(false);
      await loadIncidents(fleet.id); setMessage("האירוע דווח ונשמר במערכת.");
    } catch (error) {
      if (photoPath) {
        const {error:cleanupError} = await supabase.storage.from("incident-photos").remove([photoPath]);
        setMessage("דיווח האירוע נכשל: "+(error?.message||"שגיאה לא ידועה")+(cleanupError ? " בנוסף, מחיקת התמונה נכשלה: "+cleanupError.message : ""));
      } else setMessage("דיווח האירוע נכשל: "+(error?.message||"שגיאה לא ידועה"));
    } finally { setBusy(false); }
  }

  const canResolveIncidents = ["owner","fleet_manager","safety_manager"].includes(fleet?.role);

  async function resolveIncident(incident) {
    if (!fleet || !["owner","fleet_manager","safety_manager"].includes(fleet.role)) {
      setMessage("אין לחשבון שלך הרשאה לסמן אירוע כטופל."); return;
    }
    setBusy(true); setMessage("");
    const {error} = await supabase.from("incidents").update({status:"resolved",resolved_at:new Date().toISOString()}).eq("id",incident.id).eq("fleet_id",fleet.id);
    if (error) setMessage("לא הצלחנו לעדכן את האירוע: "+error.message);
    else { await loadIncidents(fleet.id); setMessage("האירוע סומן כטופל."); }
    setBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }

  if (loading) return <main className="auth-wrap"><section className="auth-card">טוען אירועי בטיחות...</section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header">
      <div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div>
      <div className="drivers-header-actions"><a className="nav-link" href="/"><ArrowRight size={16}/> לוח הבקרה</a><a className="nav-link" href="/tasks">משימות ונסיעות</a><button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button></div>
    </header>
    <section className="fleet-content">
      <div className="fleet-welcome"><div><small>בטיחות ותחקור</small><h2>אירועי בטיחות</h2><p>{fleet?.name||"הצי שלך"} · {incidents.filter(i=>i.status!=="resolved").length} אירועים פתוחים</p></div><span className="role-pill"><AlertTriangle size={14}/> דיווח ומעקב</span></div>
      {message && <div className="auth-message">{message}</div>}
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>דיווח אירוע חדש</h3><p>תעד תאונה, תקלה או מפגע בטיחותי</p></div><button className="primary-btn" onClick={()=>{setShowForm(!showForm);setMessage("");}}><Plus size={16}/> דיווח אירוע</button></div>
        {showForm && <form className="driver-form" onSubmit={submitIncident}>
          <div className="driver-form-title">פרטי האירוע</div>
          <div className="driver-form-grid">
            <label>סוג האירוע<select value={form.incident_type} onChange={e=>setForm({...form,incident_type:e.target.value})}><option>תקלה ברכב</option><option>תאונת דרכים</option><option>כמעט תאונה</option><option>מפגע בדרך</option><option>פגיעה במטען</option><option>אחר</option></select></label>
            <label>חומרה<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option value="low">נמוכה</option><option value="medium">בינונית</option><option value="high">גבוהה</option><option value="critical">קריטית</option></select></label>
            <label>נהג מעורב<select value={form.driver_id} onChange={e=>setForm({...form,driver_id:e.target.value})}><option value="">לא נבחר נהג</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
            <label>רכב מעורב<select value={form.vehicle_id} onChange={e=>setForm({...form,vehicle_id:e.target.value})}><option value="">לא נבחר רכב</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registration_number}</option>)}</select></label>
            <label className="task-wide">מיקום האירוע<input value={form.location_text} onChange={e=>setForm({...form,location_text:e.target.value})} placeholder="כתובת, כביש או נקודת ציון"/></label>
            <div className="task-wide"><button type="button" className="secondary-btn" disabled={gpsBusy} onClick={captureIncidentLocation}><MapPin size={14}/>{gpsBusy?"מקבל מיקום...":"צרף מיקום GPS נוכחי"}</button>{gps.latitude!==null&&<small>נקלט: {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}</small>}</div>
            <label className="task-wide">תמונה מהאירוע (לא חובה)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]||null;if(file&&(file.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))){setPhotoFile(null);e.target.value="";setMessage("אפשר לצרף JPG, PNG או WEBP עד 5MB.");}else setPhotoFile(file);}}/><small>קובץ תמונה בלבד, עד 5MB. התמונה נשמרת באופן פרטי.</small></label>
            <label className="task-wide">תיאור האירוע *<textarea required rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="מה קרה? האם יש נפגעים או נזק?"/></label>
          </div>
          <div className="driver-form-actions"><button className="primary-btn" disabled={busy}>{busy?"שומר...":"שליחת דיווח"}</button><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)}>ביטול</button></div>
        </form>}
      </section>
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div><h3>יומן אירועים</h3><p>דיווחים אחרונים וסטטוס הטיפול</p></div><span className="role-pill">{incidents.length} דיווחים</span></div>
        {incidents.length===0 ? <div className="fleet-empty"><AlertTriangle size={28}/><p>אין עדיין אירועי בטיחות בצי.</p><span>אפשר לדווח על אירוע חדש באמצעות הכפתור למעלה.</span></div> :
          <div className="task-list">{incidents.map(item=><article className="task-card" key={item.id}>
            <div className="task-card-top"><div><b>{item.incident_type}</b><small>{item.reported_at?new Date(item.reported_at).toLocaleString("he-IL"):"מועד לא צוין"}</small></div><span className={"task-status "+(item.status==="resolved"?"task-completed":"task-in_progress")}>{statusLabels[item.status]||item.status}</span></div>
            <div className="task-assignees"><span>חומרה: {severityLabels[item.severity]||item.severity}</span>{item.location_text&&<span><MapPin size={13}/>{item.location_text}</span>}</div>
            {item.latitude!=null&&item.longitude!=null&&<div className="task-assignees"><a className="nav-link" target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q="+item.latitude+","+item.longitude}>פתיחת מיקום האירוע במפה</a></div>}
            <p className="task-description">{item.description}</p>
            {item.photo_url&&<div className="task-assignees"><a className="nav-link" href={item.photo_url} target="_blank" rel="noreferrer">צפייה בתמונת האירוע</a></div>}
            {item.driver_id&&<div className="task-assignees"><span>נהג: {drivers.find(d=>d.id===item.driver_id)?.full_name||"לא ידוע"}</span></div>}
            {item.vehicle_id&&<div className="task-assignees"><span>רכב: {vehicles.find(v=>v.id===item.vehicle_id)?.registration_number||"לא ידוע"}</span></div>}
            {canResolveIncidents&&item.status!=="resolved"&&<div className="task-actions"><button className="primary-btn" disabled={busy} onClick={()=>resolveIncident(item)}><CheckCircle2 size={14}/> סימון כטופל</button></div>}
          </article>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · דיווחי הבטיחות נשמרים במסד הנתונים של הצי</p>
    </section>
  </main>;
}
