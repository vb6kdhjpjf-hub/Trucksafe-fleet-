"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Truck, ShieldCheck, LogOut, Plus, Users, Navigation, AlertTriangle, ClipboardList, BarChart3, Wrench } from "lucide-react";

export default function Home() {
  const [session,setSession]=useState(null);
  const [fleet,setFleet]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [name,setName]=useState("");
  const [fleetName,setFleetName]=useState("");
  const [message,setMessage]=useState("");
  const [vehicles,setVehicles]=useState([]);
  const [drivers,setDrivers]=useState([]);
  const [activeTrips,setActiveTrips]=useState(0);
  const [openIncidents,setOpenIncidents]=useState(0);
  const [incidentAlerts,setIncidentAlerts]=useState([]);
  const [activeTasks,setActiveTasks]=useState(0);
  const [maintenanceAlerts,setMaintenanceAlerts]=useState([]);
  const [liveLocations,setLiveLocations]=useState([]);
  const [showVehicle,setShowVehicle]=useState(false);
  const [registration,setRegistration]=useState("");
  const [vehicleType,setVehicleType]=useState("משאית");
  const [vehicleMake,setVehicleMake]=useState("");
  const [assignedDriverId,setAssignedDriverId]=useState("");

  async function loadFleet(user) {
    const {data:membership,error}=await supabase.from("fleet_members").select("fleet_id,role").eq("user_id",user.id).limit(1).maybeSingle();
    if(error){setMessage("לא הצלחנו לטעון את פרטי הצי: "+error.message);return;}
    if(!membership){setFleet(null);return;}
    const {data:current,error:fleetError}=await supabase.from("fleets").select("id,name").eq("id",membership.fleet_id).single();
    if(fleetError){setMessage("שגיאה בטעינת הצי: "+fleetError.message);return;}
    setFleet({...current,role:membership.role});
    const [v,d,tr,inc,incRows,ta,active,maint]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,vehicle_type,status,assigned_driver_id,test_due_at,insurance_due_at,registration_due_at,next_service_at").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("drivers").select("id,full_name,phone,status,license_number,license_class,license_expires_at").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("trips").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).eq("status","active"),
      supabase.from("incidents").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).neq("status","resolved"),
      supabase.from("incidents").select("id,incident_type,severity,description,status,reported_at,vehicle_id").eq("fleet_id",current.id).neq("status","resolved").order("reported_at",{ascending:false}).limit(8),
      supabase.from("tasks").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).in("status",["pending","assigned","in_progress"]),
      supabase.from("trips").select("id,driver_id,vehicle_id").eq("fleet_id",current.id).eq("status","active"),
      supabase.from("maintenance_records").select("id,vehicle_id,maintenance_type,scheduled_at,status,description").eq("fleet_id",current.id).neq("status","completed").order("scheduled_at",{ascending:true}).limit(30)
    ]);
    if(v.error)setMessage("שגיאה בטעינת כלי הרכב: "+v.error.message); else setVehicles(v.data||[]);
    if(d.error)setMessage("שגיאה בטעינת הנהגים: "+d.error.message); else setDrivers(d.data||[]);
    if(tr.error)setMessage("שגיאה בטעינת הנסיעות: "+tr.error.message); else setActiveTrips(tr.count||0);
    if(inc.error)setMessage("שגיאה בטעינת אירועי בטיחות: "+inc.error.message); else setOpenIncidents(inc.count||0);
    if(incRows.error)setMessage("שגיאה בטעינת פירוט אירועי בטיחות: "+incRows.error.message); else setIncidentAlerts(incRows.data||[]);
    if(ta.error)setMessage("שגיאה בטעינת המשימות: "+ta.error.message); else setActiveTasks(ta.count||0);\n    if(maint.error)setMessage("שגיאה בטעינת תזכורות תחזוקה: "+maint.error.message); else setMaintenanceAlerts(maint.data||[]);
    if(active.error){setMessage("שגיאה בטעינת מיקומי נסיעות: "+active.error.message);setLiveLocations([]);} else if(active.data?.length){
      const points=await Promise.all(active.data.map(async trip=>{
        const {data:loc,error:locError}=await supabase.from("trip_locations").select("latitude,longitude,speed_kmh,heading_degrees,recorded_at").eq("trip_id",trip.id).order("recorded_at",{ascending:false}).limit(1).maybeSingle();
        return locError||!loc?null:{...trip,...loc,driver: (d.data||[]).find(x=>x.id===trip.driver_id)?.full_name||"נהג לא ידוע",vehicle:(v.data||[]).find(x=>x.id===trip.vehicle_id)?.registration_number||"רכב לא ידוע"};
      }));
      setLiveLocations(points.filter(Boolean));
    } else setLiveLocations([]);
  }

  async function refreshLiveLocations() {
    if(!fleet?.id) return;
    const {data:trips,error}=await supabase.from("trips").select("id,driver_id,vehicle_id").eq("fleet_id",fleet.id).eq("status","active");
    if(error) return;
    const points=await Promise.all((trips||[]).map(async trip=>{
      const {data:loc,error:locError}=await supabase.from("trip_locations").select("id,latitude,longitude,speed_kmh,recorded_at").eq("trip_id",trip.id).order("recorded_at",{ascending:false}).limit(1).maybeSingle();
      if(locError||!loc) return null;
      return {...trip,...loc,driver:drivers.find(d=>d.id===trip.driver_id)?.full_name||"נהג לא ידוע",vehicle:vehicles.find(v=>v.id===trip.vehicle_id)?.registration_number||"רכב לא ידוע"};
    }));
    setLiveLocations(points.filter(Boolean));
  }

  useEffect(()=>{
    if(!session||!fleet?.id) return;
    refreshLiveLocations();
    const refreshTimer=setInterval(refreshLiveLocations,15000);
    return ()=>clearInterval(refreshTimer);
  },[session?.user?.id,fleet?.id,drivers,vehicles]);

  useEffect(()=>{
    if(!isSupabaseConfigured){setLoading(false);return;}
    supabase.auth.getSession().then(async ({data})=>{setSession(data.session);if(data.session)await loadFleet(data.session.user);setLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange(async (_event,next)=>{setSession(next);if(next)await loadFleet(next.user);else{setFleet(null);setVehicles([]);setDrivers([]);}setLoading(false);});
    return ()=>subscription.unsubscribe();
  },[]);

  async function authenticate(e){
    e.preventDefault();setBusy(true);setMessage("");
    const result=mode==="signup"
      ? await supabase.auth.signUp({email,password,options:{data:{full_name:name}}})
      : await supabase.auth.signInWithPassword({email,password});
    if(result.error)setMessage(result.error.message);
    else if(mode==="signup"&&!result.data.session)setMessage("נשלח אליך מייל לאימות החשבון. אשר אותו ואז התחבר.");
    else setMessage(mode==="signup"?"החשבון נוצר בהצלחה.":"התחברת בהצלחה.");
    setBusy(false);
  }

  async function createFleet(e){
    e.preventDefault();setBusy(true);setMessage("");
    const {error}=await supabase.from("fleets").insert({name:fleetName.trim(),owner_user_id:session.user.id});
    if(error)setMessage("לא הצלחנו ליצור צי: "+error.message);
    else {await loadFleet(session.user);setMessage("הצי נוצר בהצלחה.");}
    setBusy(false);
  }

  async function addVehicle(e){
    e.preventDefault();setBusy(true);setMessage("");
    const {error}=await supabase.from("vehicles").insert({fleet_id:fleet.id,registration_number:registration.trim(),vehicle_type:vehicleType,make:vehicleMake.trim()||null,status:"available",assigned_driver_id:assignedDriverId||null});
    if(error)setMessage("לא הצלחנו להוסיף רכב: "+error.message);
    else {setRegistration("");setVehicleMake("");setAssignedDriverId("");setShowVehicle(false);await loadFleet(session.user);setMessage("הרכב נוסף לצי.");}
    setBusy(false);
  }

  async function signOut(){await supabase.auth.signOut();setMessage("התנתקת מהמערכת.");}

  if(!isSupabaseConfigured)return <main className="auth-wrap"><section className="auth-card"><Truck size={36}/><h1>TruckSafe Fleet</h1><p>החיבור למסד הנתונים עדיין לא הוגדר. יש לבדוק את משתני הסביבה ב-Vercel.</p></section></main>;
  if(loading)return <main className="auth-wrap"><section className="auth-card">טוען את סביבת TruckSafe...</section></main>;

  if(!session)return <main className="auth-wrap"><section className="auth-card">
    <div className="auth-brand"><span><Truck size={25}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם ובטוח</small></div></div>
    <h2>{mode==="login"?"כניסה למערכת":"יצירת חשבון חדש"}</h2><p>התחבר כדי לנהל את כלי הרכב, הנהגים והמשימות שלך.</p>
    <form onSubmit={authenticate} className="auth-form">
      {mode==="signup"&&<label>שם מלא<input required value={name} onChange={e=>setName(e.target.value)} placeholder="השם שלך"/></label>}
      <label>כתובת אימייל<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
      <label>סיסמה<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="לפחות 6 תווים"/></label>
      <button className="primary-btn" disabled={busy}>{busy?"נא להמתין...":mode==="login"?"התחברות":"יצירת חשבון"}</button>
    </form>
    <button className="auth-switch" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("");}}>{mode==="login"?"אין לך חשבון? יצירת חשבון":"כבר יש לך חשבון? התחברות"}</button>
    {message&&<div className="auth-message">{message}</div>}
    <small className="secure-note"><ShieldCheck size={14}/> החיבור מאובטח באמצעות Supabase</small>
  </section></main>;

  if(!fleet)return <main className="auth-wrap"><section className="auth-card">
    <div className="auth-brand"><span><Truck size={25}/></span><div><h1>TruckSafe</h1><small>הקמת סביבת העבודה</small></div></div>
    <h2>יוצרים את הצי הראשון שלך</h2><p>תן שם לצי או לחברת ההובלה. החשבון שלך יוגדר כבעלים של הצי.</p>
    <form onSubmit={createFleet} className="auth-form"><label>שם הצי / החברה<input required value={fleetName} onChange={e=>setFleetName(e.target.value)} placeholder="לדוגמה: צי ההובלה שלי"/></label><button className="primary-btn" disabled={busy}>{busy?"יוצר צי...":"יצירת הצי והמשך"}</button></form>
    {message&&<div className="auth-message">{message}</div>}<button className="auth-switch" onClick={signOut}>התנתקות</button>
  </section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header"><div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div><div className="drivers-header-actions"><a className="nav-link" href="/drivers"><Users size={16}/> ניהול נהגים</a><a className="nav-link" href="/tasks"><ClipboardList size={16}/> משימות ונסיעות</a><a className="nav-link" href="/map"><Navigation size={16}/> מפת נהגים</a><a className="nav-link" href="/history"><ClipboardList size={16}/> היסטוריית נסיעות</a><a className="nav-link" href="/reports"><BarChart3 size={16}/> דוחות נסיעות</a><a className="nav-link" href="/maintenance"><Wrench size={16}/> תחזוקת רכבים</a><a className="nav-link" href="/incidents"><AlertTriangle size={16}/> אירועי בטיחות</a><button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button></div></header>
    <section className="fleet-content"><div className="fleet-welcome"><div><small>סביבת ניהול פעילה</small><h2>{fleet.name}</h2><p>שלום {session.user.user_metadata?.full_name||session.user.email}</p></div><span className="role-pill">{fleet.role==="owner"?"בעלים":fleet.role}</span></div>
      {message&&<div className="auth-message">{message}</div>}
      <div className="fleet-stats"><article><Truck/><strong>{vehicles.length}</strong><span>כלי רכב בצי</span></article><article><Users/><strong>{drivers.length}</strong><span>נהגים רשומים</span></article><article><ClipboardList/><strong>{activeTasks}</strong><span>משימות פתוחות</span></article><article><Navigation/><strong>{activeTrips}</strong><span>נסיעות פעילות</span></article><article><AlertTriangle/><strong>{openIncidents}</strong><span>אירועי בטיחות פתוחים</span></article></div>
      {(() => { const today=new Date(); today.setHours(0,0,0,0); const due=[]; vehicles.forEach(v=>{[["test_due_at","טסט"],["insurance_due_at","ביטוח"],["registration_due_at","רישיון רכב"],["next_service_at","טיפול תקופתי"]].forEach(([key,label])=>{if(!v[key])return;const date=new Date(v[key]+"T00:00:00");const days=Math.ceil((date-today)/86400000);if(days<=30)due.push({id:v.id+key,vehicle:v.registration_number,label,date:v[key],days});});});const driverDue=drivers.filter(d=>d.license_expires_at).map(d=>{const days=Math.ceil((new Date(d.license_expires_at+"T00:00:00")-today)/86400000);return {id:d.id+"license",vehicle:d.full_name,label:"תוקף רישיון נהיגה",date:d.license_expires_at,days,type:"driver"};}).filter(x=>x.days<=30);const all=[...due.map(x=>({...x,type:"vehicle"})),...driverDue,...maintenanceAlerts.map(x=>({id:x.id,vehicle:vehicles.find(v=>v.id===x.vehicle_id)?.registration_number||"רכב לא ידוע",label:x.maintenance_type||"תחזוקה",date:x.scheduled_at,days:x.scheduled_at?Math.ceil((new Date(x.scheduled_at+"T00:00:00")-today)/86400000):null,type:"maintenance"}))].sort((a,b)=>(a.days??9999)-(b.days??9999));return <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>התראות בטיחות ותחזוקה</h3><p>מסמכים שפג תוקפם או עומדים לפוג, וטיפולים שטרם הושלמו</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><a className="nav-link" href="/drivers">ניהול נהגים ({driverDue.length} רישיונות)</a><a className="nav-link" href="/maintenance">ניהול תחזוקה</a></div></div>{all.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין כרגע התראות פתוחות.</p></div>:<div className="vehicle-list">{all.map(x=><div className="vehicle-row" key={x.id}><AlertTriangle size={19}/><div><b>{x.vehicle} · {x.label}</b><small>{x.type==="maintenance"?"טיפול מתוכנן":"תוקף מסמך"} · {x.date||"ללא תאריך"}</small></div><span className={x.days!==null&&x.days<0?"status-late":"status-pending"}>{x.days===null?"ממתין":x.days<0?"באיחור "+Math.abs(x.days)+" ימים":x.days===0?"היום":"בעוד "+x.days+" ימים"}</span></div>)}</div>}</section>; })()}
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מרכז אירועי בטיחות</h3><p>אירועים פתוחים אחרונים לפי חומרה ומועד דיווח</p></div><a className="nav-link" href="/incidents">ניהול אירועים</a></div>
      {incidentAlerts.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין אירועי בטיחות פתוחים כרגע.</p></div>:<div className="vehicle-list">{incidentAlerts.map(item=><div className="vehicle-row" key={item.id}><AlertTriangle size={19}/><div><b>{item.incident_type||"אירוע בטיחות"} · {vehicles.find(v=>v.id===item.vehicle_id)?.registration_number||"רכב לא ידוע"}</b><small>{item.description||"ללא תיאור"} · {item.reported_at?new Date(item.reported_at).toLocaleString("he-IL"):"תאריך לא ידוע"}</small></div><span className={["high","critical"].includes(String(item.severity||"").toLowerCase())?"status-late":"status-pending"}>{({low:"נמוכה",medium:"בינונית",high:"גבוהה",critical:"קריטית"})[String(item.severity||"").toLowerCase()]||item.severity||"לא צוינה"}</span></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מיקומי נהגים בזמן אמת</h3><p>המיקום האחרון שנשמר בכל נסיעה פעילה</p></div><span className="role-pill">{liveLocations.length} מיקומים</span></div>
      {liveLocations.length===0?<div className="fleet-empty"><Navigation size={26}/><p>עדיין אין נקודות GPS בנסיעות הפעילות.</p><span>כדי לראות נהג כאן, יש להתחיל מעקב GPS במסך משימות ונסיעות.</span></div>:<div className="vehicle-list">{liveLocations.map(loc=><div className="vehicle-row" key={loc.id}><Navigation size={20}/><div><b>{loc.driver} · {loc.vehicle}</b><small>עודכן: {new Date(loc.recorded_at).toLocaleString("he-IL")} · {loc.speed_kmh==null?"מהירות לא זמינה":Math.round(Number(loc.speed_kmh))+" קמ״ש"}</small><small style={{color:!loc.recorded_at||Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"#b42318":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"#a15c00":"#16803c",fontWeight:600}}>{!loc.recorded_at?"זמן עדכון לא ידוע":Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"המיקום לא עודכן מעל 10 דקות":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"המיקום מתעכב — מעל 2 דקות":"מיקום מעודכן"}</small><small>{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}</small></div><a className="nav-link" target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q="+loc.latitude+","+loc.longitude}>פתיחה במפה</a></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>כלי הרכב שלי</h3><p>נתונים שנשמרים במסד הנתונים של הצי</p></div><button className="primary-btn" onClick={()=>setShowVehicle(!showVehicle)}><Plus size={16}/> הוספת רכב</button></div>
      {showVehicle&&<form className="vehicle-form" onSubmit={addVehicle}><label>מספר רישוי<input required value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="12-345-67"/></label><label>סוג רכב<select value={vehicleType} onChange={e=>setVehicleType(e.target.value)}><option>משאית</option><option>גורר</option><option>נגרר</option><option>מסחרית</option><option>רכב אחר</option></select></label><label>יצרן / דגם<input value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="לדוגמה: Volvo FH"/></label><label>נהג משויך<select value={assignedDriverId} onChange={e=>setAssignedDriverId(e.target.value)}><option value="">ללא נהג משויך</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label><button className="primary-btn" disabled={busy}>שמירת רכב</button></form>}
      {vehicles.length===0?<div className="fleet-empty">עדיין לא הוספת כלי רכב. לחץ על "הוספת רכב" כדי להתחיל.</div>:<div className="vehicle-list">{vehicles.map(v=><div className="vehicle-row" key={v.id}><Truck size={20}/><div><b>{v.registration_number}</b><small>{[v.make,v.model,v.vehicle_type].filter(Boolean).join(" · ")}{v.assigned_driver_id ? " · נהג: "+(drivers.find(d=>d.id===v.assigned_driver_id)?.full_name||"לא נמצא") : " · ללא נהג משויך"}</small></div><span>{v.status==="available"?"זמין":v.status==="assigned"?"משויך":v.status==="on_trip"?"בנסיעה":v.status==="maintenance"?"בטיפול":v.status==="inactive"?"לא פעיל":v.status}</span></div>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · מחובר למסד הנתונים · נתוני הצי מוצגים מהמערכת</p>
    </section>
  </main>;
}
