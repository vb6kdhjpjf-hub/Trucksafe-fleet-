"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Truck, ShieldCheck, LogOut, Plus, Users, Navigation, AlertTriangle, ClipboardList, BarChart3, Wrench, Route, Pencil } from "lucide-react";

export default function Home() {
  const [session,setSession]=useState(null);
  const [fleet,setFleet]=useState(null);
  const [loading,setLoading]=useState(true);
  const [workspaceChecked,setWorkspaceChecked]=useState(false);
  const [workspaceError,setWorkspaceError]=useState("");
  const fleetLoadRef=useRef(0);
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [recoveryMode,setRecoveryMode]=useState(false);
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
  const [lockedVehicleIds,setLockedVehicleIds]=useState([]);
  const [lockStatusAvailable,setLockStatusAvailable]=useState(false);
  const [liveLocations,setLiveLocations]=useState([]);
  const [showVehicle,setShowVehicle]=useState(false);
  const [registration,setRegistration]=useState("");
  const [vehicleType,setVehicleType]=useState("משאית");
  const [vehicleMake,setVehicleMake]=useState("");
  const [assignedDriverId,setAssignedDriverId]=useState("");
  const [testDueAt,setTestDueAt]=useState("");
  const [insuranceDueAt,setInsuranceDueAt]=useState("");
  const [registrationDueAt,setRegistrationDueAt]=useState("");
  const [nextServiceAt,setNextServiceAt]=useState("");
  const [editingVehicleId,setEditingVehicleId]=useState(null);

  async function loadFleet(user) {
    const requestId=++fleetLoadRef.current;
    setWorkspaceChecked(false);
    setWorkspaceError("");
    const isCurrent=()=>requestId===fleetLoadRef.current;
    let membership=null;
    const membershipResult=await supabase.from("fleet_members").select("fleet_id,role").eq("user_id",user.id).limit(1).maybeSingle();
    if(!isCurrent())return;
    membership=membershipResult.data;
    let current=null;
    let role=membership?.role||"owner";
    if(membershipResult.error||!membership){
      // Recover an existing owner's workspace before ever offering to create a new one.
      const ownedResult=await supabase.from("fleets").select("id,name").eq("owner_user_id",user.id).limit(1).maybeSingle();
      if(!isCurrent())return;
      if(ownedResult.error){
        setFleet(null);
        setWorkspaceError("לא הצלחנו לבדוק את הארגון הקיים. לא ניצור ארגון חדש כדי למנוע כפילות. פרטים: "+ownedResult.error.message);
        setWorkspaceChecked(true);
        return;
      }
      current=ownedResult.data;
      if(!current&&membershipResult.error){
        setFleet(null);
        setWorkspaceError("לא הצלחנו לטעון את החברות בארגון. נסה לטעון מחדש. פרטים: "+membershipResult.error.message);
        setWorkspaceChecked(true);
        return;
      }
    } else {
      const fleetResult=await supabase.from("fleets").select("id,name").eq("id",membership.fleet_id).single();
      if(!isCurrent())return;
      if(fleetResult.error){
        setFleet(null);
        setWorkspaceError("הארגון קיים אך לא הצלחנו לטעון אותו. לא נבקש ליצור ארגון נוסף. פרטים: "+fleetResult.error.message);
        setWorkspaceChecked(true);
        return;
      }
      current=fleetResult.data;
    }
    if(!current){
      setFleet(null);
      setWorkspaceChecked(true);
      return;
    }
    setFleet({...current,role});
    setWorkspaceChecked(true);
    const [v,d,tr,inc,incRows,ta,active,maint,lockRows]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,vehicle_type,status,assigned_driver_id,test_due_at,insurance_due_at,registration_due_at,next_service_at").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("drivers").select("id,full_name,phone,status,license_number,license_class,license_expires_at").eq("fleet_id",current.id).order("created_at",{ascending:false}),
      supabase.from("trips").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).eq("status","active"),
      supabase.from("incidents").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).in("status",["open","investigating"]),
      supabase.from("incidents").select("id,incident_type,severity,description,status,reported_at,vehicle_id").eq("fleet_id",current.id).in("status",["open","investigating"]).order("reported_at",{ascending:false}).limit(8),
      supabase.from("tasks").select("id",{count:"exact",head:true}).eq("fleet_id",current.id).in("status",["pending","assigned","in_progress"]),
      supabase.from("trips").select("id,driver_id,vehicle_id").eq("fleet_id",current.id).eq("status","active"),
      supabase.from("maintenance_records").select("id,vehicle_id,maintenance_type,scheduled_at,status,description").eq("fleet_id",current.id).neq("status","completed").order("scheduled_at",{ascending:true}).limit(30),
      supabase.from("incidents").select("vehicle_id").eq("fleet_id",current.id).in("status",["open","investigating"])
    ]);
    if(v.error)setMessage("שגיאה בטעינת כלי הרכב: "+v.error.message); else setVehicles(v.data||[]);
    if(d.error)setMessage("שגיאה בטעינת הנהגים: "+d.error.message); else setDrivers(d.data||[]);
    if(tr.error)setMessage("שגיאה בטעינת הנסיעות: "+tr.error.message); else setActiveTrips(tr.count||0);
    if(inc.error)setMessage("שגיאה בטעינת אירועי בטיחות: "+inc.error.message); else setOpenIncidents(inc.count||0);
    if(incRows.error)setMessage("שגיאה בטעינת פירוט אירועי בטיחות: "+incRows.error.message); else setIncidentAlerts(incRows.data||[]);
    if(ta.error)setMessage("שגיאה בטעינת המשימות: "+ta.error.message); else setActiveTasks(ta.count||0);
    if(maint.error)setMessage("שגיאה בטעינת תזכורות תחזוקה: "+maint.error.message); else setMaintenanceAlerts(maint.data||[]);
    if(lockRows.error){setLockStatusAvailable(false);setLockedVehicleIds([]);setMessage("לא הצלחנו לאמת נעילות בטיחות לכלי הרכב: "+lockRows.error.message);} else {setLockedVehicleIds([...new Set((lockRows.data||[]).map(row=>row.vehicle_id).filter(Boolean))]);setLockStatusAvailable(true);}
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
    let alive=true;
    const searchParams=new URLSearchParams(window.location.search);
    const hashParams=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const recoveryLink=searchParams.get("reset")==="1"||searchParams.get("type")==="recovery"||hashParams.get("type")==="recovery";
    if(recoveryLink)setRecoveryMode(true);

    // Subscribe before reading the session so a PASSWORD_RECOVERY event is not missed.
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{
      if(event==="PASSWORD_RECOVERY"){
        setRecoveryMode(true);
        setMessage("קישור האיפוס אומת. הזן סיסמה חדשה.");
      }
      setSession(next);
      if(!next){
        setFleet(null);
        setWorkspaceChecked(false);
        setVehicles([]);
        setDrivers([]);
        setLiveLocations([]);
        setLockedVehicleIds([]);
        setLockStatusAvailable(false);
        if(event==="SIGNED_OUT")setLoading(false);
      }
    });

    // Validate the persisted token with the Auth server before trusting its user ID.
    // This prevents a deleted/expired account's cached browser session from opening
    // the "create organization" flow or being mistaken for a new user.
    supabase.auth.getUser().then(async ({data,error})=>{
      if(!alive)return;
      if(error){
        setMessage("פג תוקף ההתחברות או שהחשבון אינו זמין. יש להתחבר מחדש עם החשבון הפעיל.");
        await supabase.auth.signOut();
        if(alive){setSession(null);setFleet(null);setLoading(false);}
        return;
      }
      const {data:{session:currentSession}}=await supabase.auth.getSession();
      if(!alive)return;
      setSession(currentSession);
      if(data.user&&!recoveryLink)await loadFleet(data.user);
      if(alive)setLoading(false);
    });
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);

  async function authenticate(e){
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const cleanEmail=email.trim().toLowerCase();
      const result=mode==="signup"
        ? await supabase.auth.signUp({email:cleanEmail,password,options:{data:{full_name:name.trim()},emailRedirectTo:"https://trucksafe-fleet-v1.vercel.app/"}})
        : await supabase.auth.signInWithPassword({email:cleanEmail,password});
      if(result.error){
        const msg=result.error.message||"Unknown authentication error";
        const lower=msg.toLowerCase();
        if(lower.includes("invalid login credentials")) setMessage("המייל או הסיסמה אינם נכונים. בדוק את הפרטים או השתמש באיפוס סיסמה.");
        else if(lower.includes("email not confirmed")) setMessage("כתובת המייל עדיין לא אומתה. בדוק את תיבת הדואר ואת תיקיית הספאם.");
        else if(lower.includes("too many requests")) setMessage("בוצעו יותר מדי ניסיונות. המתן מעט ונסה שוב.");
        else setMessage("ההתחברות נכשלה: "+msg);
      } else if(mode==="signup"&&!result.data.session){
        const existingUser=result.data.user;
        if(existingUser?.email_confirmed_at||existingUser?.confirmed_at){
          setMode("login");
          setMessage("החשבון הזה כבר קיים ומאומת. אין צורך להירשם שוב — עבור להתחברות והזן את הסיסמה הקיימת.");
        } else if(Array.isArray(existingUser?.identities)&&existingUser.identities.length===0){
          setMode("login");
          setMessage("כבר קיים חשבון עם כתובת המייל הזו, אך הוא עדיין לא אומת. שליחת המיילים מוגבלת כרגע; נסה שוב מאוחר יותר או השתמש בחשבון המאומת.");
        } else {
          setMessage("בקשת ההרשמה התקבלה. אם כתובת המייל עדיין לא אומתה, בדוק את תיבת הדואר ואת תיקיית הספאם.");
        }
      } else {
        setMessage(mode==="signup"?"החשבון נוצר בהצלחה.":"התחברת בהצלחה.");
        if(result.data.session){setSession(result.data.session);await loadFleet(result.data.session.user);}
      }
    } catch(error) {
      setMessage("לא הצלחנו להשלים את ההתחברות. בדוק את החיבור לאינטרנט ונסה שוב. פירוט: "+(error?.message||"שגיאה לא ידועה"));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset(){
    if(!email.trim()){setMessage("יש להזין תחילה את כתובת המייל.");return;}
    setBusy(true);setMessage("");
    try {
      const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:"https://trucksafe-fleet-v1.vercel.app/?reset=1"});
      if(error)setMessage("לא הצלחנו לשלוח קישור לאיפוס סיסמה: "+error.message);
      else setMessage("אם קיימת כתובת כזו במערכת, נשלח אליה קישור לאיפוס סיסמה. בדוק גם בתיקיית הספאם.");
    } catch(error) {
      setMessage("שליחת קישור האיפוס נכשלה: "+(error?.message||"שגיאה לא ידועה"));
    } finally {setBusy(false);}
  }

  async function saveNewPassword(e){
    e.preventDefault();
    if(newPassword.length<6){setMessage("הסיסמה החדשה חייבת להכיל לפחות 6 תווים.");return;}
    setBusy(true);setMessage("");
    try {
      const {data,error}=await supabase.auth.updateUser({password:newPassword});
      if(error)setMessage("לא הצלחנו לעדכן את הסיסמה: "+error.message);
      else {
        setRecoveryMode(false);
        setNewPassword("");
        window.history.replaceState({},document.title,window.location.pathname);
        const user=data.user||(await supabase.auth.getUser()).data.user;
        if(user) await loadFleet(user);
        setMessage("הסיסמה עודכנה בהצלחה. כעת אפשר להמשיך למערכת.");
      }
    } catch(error) {
      setMessage("עדכון הסיסמה נכשל: "+(error?.message||"שגיאה לא ידועה"));
    } finally {setBusy(false);}
  }

  async function createFleet(e){
    e.preventDefault();setBusy(true);setMessage("");
    const {error}=await supabase.from("fleets").insert({name:fleetName.trim(),owner_user_id:session.user.id});
    if(error)setMessage("לא הצלחנו ליצור צי: "+error.message);
    else {await loadFleet(session.user);setMessage("הצי נוצר בהצלחה.");}
    setBusy(false);
  }

  const canManageVehicles = ["owner", "fleet_manager"].includes(fleet?.role);

  function resetVehicleForm(){
    setRegistration("");
    setVehicleType("משאית");
    setVehicleMake("");
    setAssignedDriverId("");
    setTestDueAt("");
    setInsuranceDueAt("");
    setRegistrationDueAt("");
    setNextServiceAt("");
    setEditingVehicleId(null);
    setShowVehicle(false);
  }

  function editVehicle(vehicle){
    setRegistration(vehicle.registration_number||"");
    setVehicleType(vehicle.vehicle_type||"משאית");
    setVehicleMake([vehicle.make,vehicle.model].filter(Boolean).join(" "));
    setAssignedDriverId(vehicle.assigned_driver_id||"");
    setTestDueAt(vehicle.test_due_at||"");
    setInsuranceDueAt(vehicle.insurance_due_at||"");
    setRegistrationDueAt(vehicle.registration_due_at||"");
    setNextServiceAt(vehicle.next_service_at||"");
    setEditingVehicleId(vehicle.id);
    setShowVehicle(true);
    setMessage("");
    window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
  }

  async function saveVehicle(e){
    e.preventDefault();
    if(!canManageVehicles){setMessage("אין לך הרשאה לעדכן כלי רכב.");return;}
    if(!registration.trim()||!testDueAt||!insuranceDueAt||!registrationDueAt){
      setMessage("יש להשלים מספר רישוי ותאריכי טסט, ביטוח ורישיון רכב.");
      return;
    }
    setBusy(true);setMessage("");
    const payload={
      registration_number:registration.trim(),
      vehicle_type:vehicleType,
      make:vehicleMake.trim()||null,
      assigned_driver_id:assignedDriverId||null,
      test_due_at:testDueAt,
      insurance_due_at:insuranceDueAt,
      registration_due_at:registrationDueAt,
      next_service_at:nextServiceAt||null
    };
    try{
      const result=editingVehicleId
        ? await supabase.from("vehicles").update(payload).eq("id",editingVehicleId).eq("fleet_id",fleet.id)
        : await supabase.from("vehicles").insert({...payload,fleet_id:fleet.id,status:"available"});
      if(result.error)throw result.error;
      resetVehicleForm();
      await loadFleet(session.user);
      setMessage(editingVehicleId?"פרטי הרכב עודכנו.":"הרכב נוסף לצי.");
    }catch(error){
      setMessage("לא הצלחנו לשמור את פרטי הרכב: "+(error?.message||"שגיאה לא ידועה"));
    }finally{
      setBusy(false);
    }
  }

  async function signOut(){await supabase.auth.signOut();setMessage("התנתקת מהמערכת.");}

  if(!isSupabaseConfigured)return <main className="auth-wrap"><section className="auth-card"><Truck size={36}/><h1>TruckSafe Fleet</h1><p>החיבור למסד הנתונים עדיין לא הוגדר. יש לבדוק את משתני הסביבה ב-Vercel.</p></section></main>;
  if(loading)return <main className="auth-wrap"><section className="auth-card">טוען את סביבת TruckSafe...</section></main>;

  if(recoveryMode)return <main className="auth-wrap"><section className="auth-card">
    <div className="auth-brand"><span><Truck size={25}/></span><div><h1>TruckSafe</h1><small>איפוס סיסמה</small></div></div>
    <h2>בחירת סיסמה חדשה</h2><p>הזן סיסמה חדשה לחשבון שלך.</p>
    <form onSubmit={saveNewPassword} className="auth-form">
      <label>סיסמה חדשה<input type="password" minLength={6} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="לפחות 6 תווים"/></label>
      <button className="primary-btn" disabled={busy}>{busy?"מעדכן...":"שמירת סיסמה חדשה"}</button>
    </form>
    {message&&<div className="auth-message">{message}</div>}
  </section></main>;

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
    {mode==="login"&&<button type="button" className="auth-switch" disabled={busy} onClick={sendPasswordReset}>שכחתי סיסמה – שליחת קישור לאיפוס</button>}
    {message&&<div className="auth-message">{message}</div>}
    <small className="secure-note"><ShieldCheck size={14}/> החיבור מאובטח באמצעות Supabase</small>
  </section></main>;

  if(!fleet&&!workspaceChecked)return <main className="auth-wrap"><section className="auth-card">בודק את הארגון וההרשאות שלך...</section></main>;

  if(!fleet&&workspaceError)return <main className="auth-wrap"><section className="auth-card">
    <div className="auth-brand"><span><Truck size={25}/></span><div><h1>TruckSafe</h1><small>בדיקת סביבת העבודה</small></div></div>
    <h2>לא ניצור ארגון כפול</h2><p>{workspaceError}</p>
    <button className="primary-btn" disabled={busy} onClick={()=>loadFleet(session.user)}>בדיקה מחדש</button>
    <button className="auth-switch" onClick={signOut}>התנתקות</button>
  </section></main>;

  if(!fleet)return <main className="auth-wrap"><section className="auth-card">
    <div className="auth-brand"><span><Truck size={25}/></span><div><h1>TruckSafe</h1><small>הקמת סביבת העבודה</small></div></div>
    <h2>לא נמצא ארגון בחשבון</h2><p>בדקנו גם חברות בארגון וגם ארגונים שבבעלותך. רק אם זו סביבת עבודה חדשה, אפשר ליצור ארגון.</p>
    <form onSubmit={createFleet} className="auth-form"><label>שם הצי / החברה<input required value={fleetName} onChange={e=>setFleetName(e.target.value)} placeholder="לדוגמה: צי ההובלה שלי"/></label><button className="primary-btn" disabled={busy}>{busy?"יוצר צי...":"יצירת הצי והמשך"}</button></form>
    {message&&<div className="auth-message">{message}</div>}<button className="auth-switch" onClick={signOut}>התנתקות</button>
  </section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header"><div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div><div className="drivers-header-actions"><a className="nav-link" href="/drivers"><Users size={16}/> ניהול נהגים</a><a className="nav-link" href="/tasks"><ClipboardList size={16}/> משימות ונסיעות</a><a className="nav-link" href="/map"><Navigation size={16}/> מפת נהגים</a><a className="nav-link" href="/routing"><Route size={16}/> ניווט משאיות</a><a className="nav-link" href="/road-restrictions"><AlertTriangle size={16}/> מגבלות דרך</a><a className="nav-link" href="/daily-report"><ClipboardList size={16}/> דוח יומי</a><a className="nav-link" href="/history"><ClipboardList size={16}/> היסטוריית נסיעות</a><a className="nav-link" href="/reports"><BarChart3 size={16}/> דוחות נסיעות</a><a className="nav-link" href="/maintenance"><Wrench size={16}/> תחזוקת רכבים</a><a className="nav-link" href="/incidents"><AlertTriangle size={16}/> אירועי בטיחות</a><button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button></div></header>
    <section className="fleet-content"><div className="fleet-welcome"><div><small>סביבת ניהול פעילה</small><h2>{fleet.name}</h2><p>שלום {session.user.user_metadata?.full_name||session.user.email}</p></div><span className="role-pill">{fleet.role==="owner"?"בעלים":fleet.role}</span></div>
      {message&&<div className="auth-message">{message}</div>}
      <div className="fleet-stats"><article><Truck/><strong>{vehicles.length}</strong><span>כלי רכב בצי</span></article><article><Users/><strong>{drivers.length}</strong><span>נהגים רשומים</span></article><article><ClipboardList/><strong>{activeTasks}</strong><span>משימות פתוחות</span></article><article><Navigation/><strong>{activeTrips}</strong><span>נסיעות פעילות</span></article><article><AlertTriangle/><strong>{openIncidents}</strong><span>אירועי בטיחות פתוחים</span></article></div>
      {(() => {
        const today=new Date(); today.setHours(0,0,0,0);
        const due=[];
        vehicles.forEach(v=>{
          [["test_due_at","טסט"],["insurance_due_at","ביטוח"],["registration_due_at","רישיון רכב"]].forEach(([key,label])=>{
            if(!v[key]){due.push({id:v.id+key,vehicle:v.registration_number,label,date:null,days:null,type:"vehicle",missing:true});return;}
            const date=new Date(v[key]+"T00:00:00");
            const days=Math.ceil((date-today)/86400000);
            if(days<=30)due.push({id:v.id+key,vehicle:v.registration_number,label,date:v[key],days,type:"vehicle",missing:false});
          });
          if(v.next_service_at){
            const days=Math.ceil((new Date(v.next_service_at+"T00:00:00")-today)/86400000);
            if(days<=30)due.push({id:v.id+"next_service_at",vehicle:v.registration_number,label:"טיפול תקופתי",date:v.next_service_at,days,type:"maintenance",missing:false});
          }
        });
        const driverDue=drivers.map(d=>{
          const days=d.license_expires_at?Math.ceil((new Date(d.license_expires_at+"T00:00:00")-today)/86400000):null;
          return {id:d.id+"license",vehicle:d.full_name,label:"תוקף רישיון נהיגה",date:d.license_expires_at,days,type:"driver",missing:!d.license_expires_at};
        }).filter(x=>x.missing||x.days<=30);
        const all=[...due,...driverDue,...maintenanceAlerts.map(x=>({id:x.id,vehicle:vehicles.find(v=>v.id===x.vehicle_id)?.registration_number||"רכב לא ידוע",label:x.maintenance_type||"תחזוקה",date:x.scheduled_at,days:x.scheduled_at?Math.ceil((new Date(x.scheduled_at+"T00:00:00")-today)/86400000):null,type:"maintenance",missing:false}))].sort((a,b)=>(a.missing?-1:(a.days??9999))-(b.missing?-1:(b.days??9999)));
        return <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>התראות בטיחות ותחזוקה</h3><p>מסמכים חסרים, שפג תוקפם או עומדים לפוג, וטיפולים שטרם הושלמו</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><a className="nav-link" href="/drivers">ניהול נהגים ({driverDue.length} התראות רישיון)</a><a className="nav-link" href="/maintenance">ניהול תחזוקה</a></div></div>{all.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין כרגע התראות פתוחות.</p></div>:<div className="vehicle-list">{all.map(x=><div className="vehicle-row" key={x.id}><AlertTriangle size={19}/><div><b>{x.vehicle} · {x.label}</b><small>{x.type==="maintenance"?"טיפול מתוכנן":x.missing?"חסר נתון חובה":"תוקף מסמך"} · {x.date||"ללא תאריך"}</small></div><span className={x.missing||(x.days!==null&&x.days<0)?"status-late":"status-pending"}>{x.missing?"חסר תאריך — יש להשלים":x.days===null?"ממתין":x.days<0?"באיחור "+Math.abs(x.days)+" ימים":x.days===0?"היום":"בעוד "+x.days+" ימים"}</span></div>)}</div>}</section>;
      })()}
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מרכז אירועי בטיחות</h3><p>אירועים פתוחים אחרונים לפי חומרה ומועד דיווח</p></div><a className="nav-link" href="/incidents">ניהול אירועים</a></div>
      {incidentAlerts.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין אירועי בטיחות פתוחים כרגע.</p></div>:<div className="vehicle-list">{incidentAlerts.map(item=><div className="vehicle-row" key={item.id}><AlertTriangle size={19}/><div><b>{item.incident_type||"אירוע בטיחות"} · {vehicles.find(v=>v.id===item.vehicle_id)?.registration_number||"רכב לא ידוע"}</b><small>{item.description||"ללא תיאור"} · {item.reported_at?new Date(item.reported_at).toLocaleString("he-IL"):"תאריך לא ידוע"}</small></div><span className={["high","critical"].includes(String(item.severity||"").toLowerCase())?"status-late":"status-pending"}>{({low:"נמוכה",medium:"בינונית",high:"גבוהה",critical:"קריטית"})[String(item.severity||"").toLowerCase()]||item.severity||"לא צוינה"}</span></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מיקומי נהגים בזמן אמת</h3><p>המיקום האחרון שנשמר בכל נסיעה פעילה</p></div><span className="role-pill">{liveLocations.length} מיקומים</span></div>
      {liveLocations.length===0?<div className="fleet-empty"><Navigation size={26}/><p>עדיין אין נקודות GPS בנסיעות הפעילות.</p><span>כדי לראות נהג כאן, יש להתחיל מעקב GPS במסך משימות ונסיעות.</span></div>:<div className="vehicle-list">{liveLocations.map(loc=><div className="vehicle-row" key={loc.id}><Navigation size={20}/><div><b>{loc.driver} · {loc.vehicle}</b><small>עודכן: {new Date(loc.recorded_at).toLocaleString("he-IL")} · {loc.speed_kmh==null?"מהירות לא זמינה":Math.round(Number(loc.speed_kmh))+" קמ״ש"}</small><small style={{color:!loc.recorded_at||Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"#b42318":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"#a15c00":"#16803c",fontWeight:600}}>{!loc.recorded_at?"זמן עדכון לא ידוע":Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"המיקום לא עודכן מעל 10 דקות":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"המיקום מתעכב — מעל 2 דקות":"מיקום מעודכן"}</small><small>{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}</small></div><a className="nav-link" target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q="+loc.latitude+","+loc.longitude}>פתיחה במפה</a></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>כלי הרכב שלי</h3><p>נתונים שנשמרים במסד הנתונים של הצי</p></div>{canManageVehicles&&<button className="primary-btn" onClick={()=>{if(showVehicle)resetVehicleForm();else{resetVehicleForm();setShowVehicle(true);}}}><Plus size={16}/> הוספת רכב</button>}</div>
      {showVehicle&&canManageVehicles&&<form className="vehicle-form" onSubmit={saveVehicle}>
        <h3 className="vehicle-form-title">{editingVehicleId?"עדכון פרטי רכב ומסמכים":"הוספת רכב לצי"}</h3>
        <p className="vehicle-form-note">יש להזין תאריכי תוקף מדויקים לפי המסמכים המקוריים. תאריך חסר או שפג תוקפו ימנע פתיחת נסיעה.</p>
        <label>מספר רישוי *<input required maxLength={20} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="12-345-67"/></label>
        <label>סוג רכב<select value={vehicleType} onChange={e=>setVehicleType(e.target.value)}><option>משאית</option><option>גורר</option><option>נגרר</option><option>מסחרית</option><option>רכב אחר</option></select></label>
        <label>יצרן / דגם<input maxLength={100} value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="לדוגמה: Volvo FH"/></label>
        <label>נהג משויך<select value={assignedDriverId} onChange={e=>setAssignedDriverId(e.target.value)}><option value="">ללא נהג משויך</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
        <label>טסט בתוקף עד *<input type="date" required value={testDueAt} onChange={e=>setTestDueAt(e.target.value)}/></label>
        <label>ביטוח בתוקף עד *<input type="date" required value={insuranceDueAt} onChange={e=>setInsuranceDueAt(e.target.value)}/></label>
        <label>רישיון רכב בתוקף עד *<input type="date" required value={registrationDueAt} onChange={e=>setRegistrationDueAt(e.target.value)}/></label>
        <label>טיפול תקופתי הבא<input type="date" value={nextServiceAt} onChange={e=>setNextServiceAt(e.target.value)}/></label>
        <div className="vehicle-form-actions"><button className="primary-btn" disabled={busy}>{busy?"שומר...":editingVehicleId?"שמירת עדכון":"שמירת רכב"}</button><button type="button" className="secondary-btn" disabled={busy} onClick={resetVehicleForm}>ביטול</button></div>
      </form>}
      {vehicles.length===0?<div className="fleet-empty">עדיין לא הוספת כלי רכב. לחץ על "הוספת רכב" כדי להתחיל.</div>:<div className="vehicle-list">{vehicles.map(v=><div className="vehicle-row" key={v.id}><Truck size={20}/><div><b>{v.registration_number}</b><small>{[v.make,v.model,v.vehicle_type].filter(Boolean).join(" · ")}{v.assigned_driver_id ? " · נהג: "+(drivers.find(d=>d.id===v.assigned_driver_id)?.full_name||"לא נמצא") : " · ללא נהג משויך"}</small><small className="vehicle-compliance-line">טסט: {v.test_due_at||"חסר"} · ביטוח: {v.insurance_due_at||"חסר"} · רישיון רכב: {v.registration_due_at||"חסר"}</small></div><span className={!lockStatusAvailable||lockedVehicleIds.includes(v.id)?"status-late":""}>{!lockStatusAvailable?"מצב נעילה לא מאומת":lockedVehicleIds.includes(v.id)?"נעול עקב אירוע בטיחות":v.status==="available"?"זמין":v.status==="assigned"?"משויך":v.status==="on_trip"?"בנסיעה":v.status==="maintenance"?"בטיפול":v.status==="inactive"?"לא פעיל":v.status}</span>{canManageVehicles&&<button type="button" className="secondary-btn" onClick={()=>editVehicle(v)}><Pencil size={14}/> עדכון מסמכים</button>}</div>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · מחובר למסד הנתונים · נתוני הצי מוצגים מהמערכת</p>
    </section>
  </main>;
}
