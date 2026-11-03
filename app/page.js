"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Truck, ShieldCheck, LogOut, Plus, Users, Navigation, AlertTriangle, ClipboardList } from "lucide-react";

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
  const [activeTasks,setActiveTasks]=useState(0);
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
    const [v,d,tr,inc,ta]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,vehicle_type,status,assigned_driver_id").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("drivers").select("id,full_name,phone,status").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("trips").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).eq("status","active"),
      supabase.from("incidents").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).neq("status","resolved"),
      supabase.from("tasks").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).in("status",["pending","assigned","in_progress"])
    ]);
    if(v.error)setMessage("שגיאה בטעינת כלי הרכב: "+v.error.message); else setVehicles(v.data||[]);
    if(d.error)setMessage("שגיאה בטעינת הנהגים: "+d.error.message); else setDrivers(d.data||[]);
    if(tr.error)setMessage("שגיאה בטעינת הנסיעות: "+tr.error.message); else setActiveTrips(tr.count||0);
    if(inc.error)setMessage("שגיאה בטעינת אירועי בטיחות: "+inc.error.message); else setOpenIncidents(inc.count||0);
    if(ta.error)setMessage("שגיאה בטעינת המשימות: "+ta.error.message); else setActiveTasks(ta.count||0);
  }

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
    <header className="fleet-header"><div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div><div className="drivers-header-actions"><a className="nav-link" href="/drivers"><Users size={16}/> ניהול נהגים</a><a className="nav-link" href="/tasks"><ClipboardList size={16}/> משימות ונסיעות</a><button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button></div></header>
    <section className="fleet-content"><div className="fleet-welcome"><div><small>סביבת ניהול פעילה</small><h2>{fleet.name}</h2><p>שלום {session.user.user_metadata?.full_name||session.user.email}</p></div><span className="role-pill">{fleet.role==="owner"?"בעלים":fleet.role}</span></div>
      {message&&<div className="auth-message">{message}</div>}
      <div className="fleet-stats"><article><Truck/><strong>{vehicles.length}</strong><span>כלי רכב בצי</span></article><article><Users/><strong>{drivers.length}</strong><span>נהגים רשומים</span></article><article><ClipboardList/><strong>{activeTasks}</strong><span>משימות פתוחות</span></article><article><Navigation/><strong>{activeTrips}</strong><span>נסיעות פעילות</span></article><article><AlertTriangle/><strong>{openIncidents}</strong><span>אירועי בטיחות פתוחים</span></article></div>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>כלי הרכב שלי</h3><p>נתונים שנשמרים במסד הנתונים של הצי</p></div><button className="primary-btn" onClick={()=>setShowVehicle(!showVehicle)}><Plus size={16}/> הוספת רכב</button></div>
      {showVehicle&&<form className="vehicle-form" onSubmit={addVehicle}><label>מספר רישוי<input required value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="12-345-67"/></label><label>סוג רכב<select value={vehicleType} onChange={e=>setVehicleType(e.target.value)}><option>משאית</option><option>גורר</option><option>נגרר</option><option>מסחרית</option><option>רכב אחר</option></select></label><label>יצרן / דגם<input value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="לדוגמה: Volvo FH"/></label><label>נהג משויך<select value={assignedDriverId} onChange={e=>setAssignedDriverId(e.target.value)}><option value="">ללא נהג משויך</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label><button className="primary-btn" disabled={busy}>שמירת רכב</button></form>}
      {vehicles.length===0?<div className="fleet-empty">עדיין לא הוספת כלי רכב. לחץ על "הוספת רכב" כדי להתחיל.</div>:<div className="vehicle-list">{vehicles.map(v=><div className="vehicle-row" key={v.id}><Truck size={20}/><div><b>{v.registration_number}</b><small>{[v.make,v.model,v.vehicle_type].filter(Boolean).join(" · ")}{v.assigned_driver_id ? " · נהג: "+(drivers.find(d=>d.id===v.assigned_driver_id)?.full_name||"לא נמצא") : " · ללא נהג משויך"}</small></div><span>{v.status==="available"?"זמין":v.status==="assigned"?"משויך":v.status==="on_trip"?"בנסיעה":v.status==="maintenance"?"בטיפול":v.status==="inactive"?"לא פעיל":v.status}</span></div>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · מחובר למסד הנתונים · נתוני הצי מוצגים מהמערכת</p>
    </section>
  </main>;
}
