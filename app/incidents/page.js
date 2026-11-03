"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { Truck, ArrowRight, Plus, AlertTriangle, MapPin, LogOut, CheckCircle2 } from "lucide-react";

const emptyForm = { incident_type: "תקלה ברכב", severity: "medium", description: "", location_text: "" };
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
    const {data:membership,error} = await supabase.from("fleet_members").select("fleet_id,role").eq("user_id",user.id).limit(1).maybeSingle();
    if (error) { setMessage("לא הצלחנו לטעון את פרטי הצי: "+error.message); return; }
    if (!membership) { router.replace("/"); return; }
    const {data:current,error:fleetError} = await supabase.from("fleets").select("id,name").eq("id",membership.fleet_id).single();
    if (fleetError) { setMessage("שגיאה בטעינת הצי: "+fleetError.message); return; }
    setFleet({...current,role:membership.role});
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
      .select("id,incident_type,severity,description,location_text,status,reported_at,resolved_at,driver_id,vehicle_id")
      .eq("fleet_id",fleetId).order("reported_at",{ascending:false});
    if (error) setMessage("שגיאה בטעינת אירועי הבטיחות: "+error.message);
    else setIncidents(data||[]);
  }

  async function submitIncident(e) {
    e.preventDefault();
    if (!fleet || !session) return;
    setBusy(true); setMessage("");
    const payload = {
      fleet_id:fleet.id, incident_type:form.incident_type, severity:form.severity,
      description:form.description.trim(), location_text:form.location_text.trim()||null,
      status:"reported", reported_at:new Date().toISOString(), created_by:session.user.id
    };
    const {error} = await supabase.from("incidents").insert(payload);
    if (error) setMessage("לא הצלחנו לדווח על האירוע: "+error.message);
    else { setForm(emptyForm); setShowForm(false); await loadIncidents(fleet.id); setMessage("האירוע דווח ונשמר במערכת."); }
    setBusy(false);
  }

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
            <label className="task-wide">מיקום האירוע<input value={form.location_text} onChange={e=>setForm({...form,location_text:e.target.value})} placeholder="כתובת, כביש או נקודת ציון"/></label>
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
            <p className="task-description">{item.description}</p>
            {item.driver_id&&<div className="task-assignees"><span>נהג: {drivers.find(d=>d.id===item.driver_id)?.full_name||"לא ידוע"}</span></div>}
            {item.vehicle_id&&<div className="task-assignees"><span>רכב: {vehicles.find(v=>v.id===item.vehicle_id)?.registration_number||"לא ידוע"}</span></div>}
            {item.status!=="resolved"&&<div className="task-actions"><button className="primary-btn" disabled={busy} onClick={()=>resolveIncident(item)}><CheckCircle2 size={14}/> סימון כטופל</button></div>}
          </article>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · דיווחי הבטיחות נשמרים במסד הנתונים של הצי</p>
    </section>
  </main>;
}
