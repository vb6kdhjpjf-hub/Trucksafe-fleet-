"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Truck, ShieldCheck, LogOut, Plus, Users, Navigation, AlertTriangle, ClipboardList, BarChart3, Wrench, Route } from "lucide-react";

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
  const [liveLocations,setLiveLocations]=useState([]);
  const [showVehicle,setShowVehicle]=useState(false);
  const [registration,setRegistration]=useState("");
  const [vehicleType,setVehicleType]=useState("משאית");
  const [vehicleMake,setVehicleMake]=useState("");
  const [assignedDriverId,setAssignedDriverId]=useState("");
  const [routingVehicleType,setRoutingVehicleType]=useState("StraightTruck");
  const [heightCm,setHeightCm]=useState("");
  const [widthCm,setWidthCm]=useState("");
  const [lengthCm,setLengthCm]=useState("");
  const [grossWeightKg,setGrossWeightKg]=useState("");
  const [emptyWeightKg,setEmptyWeightKg]=useState("");
  const [axleCount,setAxleCount]=useState("");
  const [trailerCount,setTrailerCount]=useState("0");
  const [weightPerAxleKg,setWeightPerAxleKg]=useState("");

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
    const [v,d,tr,inc,incRows,ta,active,maint]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,vehicle_type,status,assigned_driver_id,test_due_at,insurance_due_at,registration_due_at,next_service_at,routing_vehicle_type,height_cm,width_cm,length_cm,gross_weight_kg,empty_weight_kg,axle_count,trailer_count,weight_per_axle_kg,is_demo").eq("fleet_id",current.id).order("created_at",{ascending:false}),
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
    if(ta.error)setMessage("שגיאה בטעינת המשימות: "+ta.error.message); else setActiveTasks(ta.count||0);
    if(maint.error)setMessage("שגיאה בטעינת תזכורות תחזוקה: "+maint.error.message); else setMaintenanceAlerts(maint.data||[]);
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

  async function addVehicle(e){
    e.preventDefault();setBusy(true);setMessage("");
    const optionalNumber=value=>value.trim()===""?null:Number(value);
    const routing={
      height_cm:optionalNumber(heightCm),
      width_cm:optionalNumber(widthCm),
      length_cm:optionalNumber(lengthCm),
      gross_weight_kg:optionalNumber(grossWeightKg),
      empty_weight_kg:optionalNumber(emptyWeightKg),
      axle_count:optionalNumber(axleCount),
      trailer_count:optionalNumber(trailerCount) ?? 0,
      weight_per_axle_kg:optionalNumber(weightPerAxleKg),
      routing_vehicle_type:routingVehicleType
    };
    const supplied=[heightCm,widthCm,lengthCm,grossWeightKg,emptyWeightKg,axleCount,weightPerAxleKg].some(value=>value.trim()!=="");
    if(supplied&&(
      !Number.isFinite(routing.height_cm)||routing.height_cm<100||routing.height_cm>600||
      !Number.isFinite(routing.width_cm)||routing.width_cm<100||routing.width_cm>350||
      !Number.isFinite(routing.length_cm)||routing.length_cm<200||routing.length_cm>3000||
      !Number.isFinite(routing.gross_weight_kg)||routing.gross_weight_kg<1000||routing.gross_weight_kg>100000||
      !Number.isFinite(routing.empty_weight_kg)||routing.empty_weight_kg<500||routing.empty_weight_kg>routing.gross_weight_kg||
      !Number.isInteger(routing.axle_count)||routing.axle_count<2||routing.axle_count>12||
      !Number.isInteger(routing.trailer_count)||routing.trailer_count<0||routing.trailer_count>3||
      (!Number.isFinite(routing.weight_per_axle_kg)||routing.weight_per_axle_kg<500||routing.weight_per_axle_kg>30000)||
      !["StraightTruck","Tractor"].includes(routing.routing_vehicle_type)
    )){
      setMessage("פרטי הניתוב חלקיים או לא תקינים. יש למלא גובה, רוחב, אורך, משקל כולל מותר, משקל ריק ומספר סרנים בטווחים המוצגים, או להשאיר את כל פרטי הניתוב ריקים.");
      setBusy(false);
      return;
    }
    const payload={fleet_id:fleet.id,registration_number:registration.trim(),vehicle_type:vehicleType,make:vehicleMake.trim()||null,status:"available",assigned_driver_id:assignedDriverId||null,
      ...(supplied?routing:{height_cm:null,width_cm:null,length_cm:null,gross_weight_kg:null,empty_weight_kg:null,axle_count:null,trailer_count:0,weight_per_axle_kg:null,routing_vehicle_type:null})
    };
    const {error}=await supabase.from("vehicles").insert(payload);
    if(error)setMessage("לא הצלחנו להוסיף רכב: "+error.message);
    else {
      setRegistration("");setVehicleMake("");setAssignedDriverId("");setShowVehicle(false);
      setRoutingVehicleType("StraightTruck");setHeightCm("");setWidthCm("");setLengthCm("");setGrossWeightKg("");setEmptyWeightKg("");setAxleCount("");setTrailerCount("0");setWeightPerAxleKg("");
      await loadFleet(session.user);setMessage("הרכב נוסף לצי.");
    }
    setBusy(false);
  }

  async function markVehicleAsDemo(vehicle) {
    if (!fleet?.id || !["owner", "fleet_manager"].includes(fleet.role)) {
      setMessage("אין לחשבון הרשאה לעדכן את פרטי הרכב.");
      return;
    }
    const confirmed = window.confirm("לסמן את משאית MAN כרכב הדגמה בלבד ולאפס את מספר הנגררים ל־0? הנתונים לא ישמשו לניווט אמיתי.");
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .update({ is_demo: true, trailer_count: 0, updated_at: new Date().toISOString() })
        .eq("id", vehicle.id)
        .eq("fleet_id", fleet.id)
        .select("id,is_demo,trailer_count")
        .maybeSingle();
      if (error) {
        setMessage("העדכון נחסם על ידי הרשאות המערכת: " + error.message);
      } else if (!data) {
        setMessage("לא בוצע עדכון. ייתכן שאין לך הרשאת בעלים או שהרכב אינו שייך לצי הפעיל.");
      } else {
        await loadFleet(session.user);
        setMessage("המשאית סומנה כרכב הדגמה בלבד ומספר הנגררים עודכן ל־0. נתוני המידות והמשקלים נשארו לא מאומתים.");
      }
    } catch (error) {
      setMessage("לא הצלחנו לעדכן את הרכב: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
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
      {(() => { const today=new Date(); today.setHours(0,0,0,0); const due=[]; vehicles.forEach(v=>{[["test_due_at","טסט"],["insurance_due_at","ביטוח"],["registration_due_at","רישיון רכב"],["next_service_at","טיפול תקופתי"]].forEach(([key,label])=>{if(!v[key])return;const date=new Date(v[key]+"T00:00:00");const days=Math.ceil((date-today)/86400000);if(days<=30)due.push({id:v.id+key,vehicle:v.registration_number,label,date:v[key],days});});});const driverDue=drivers.filter(d=>d.license_expires_at).map(d=>{const days=Math.ceil((new Date(d.license_expires_at+"T00:00:00")-today)/86400000);return {id:d.id+"license",vehicle:d.full_name,label:"תוקף רישיון נהיגה",date:d.license_expires_at,days,type:"driver"};}).filter(x=>x.days<=30);const all=[...due.map(x=>({...x,type:"vehicle"})),...driverDue,...maintenanceAlerts.map(x=>({id:x.id,vehicle:vehicles.find(v=>v.id===x.vehicle_id)?.registration_number||"רכב לא ידוע",label:x.maintenance_type||"תחזוקה",date:x.scheduled_at,days:x.scheduled_at?Math.ceil((new Date(x.scheduled_at+"T00:00:00")-today)/86400000):null,type:"maintenance"}))].sort((a,b)=>(a.days??9999)-(b.days??9999));return <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>התראות בטיחות ותחזוקה</h3><p>מסמכים שפג תוקפם או עומדים לפוג, וטיפולים שטרם הושלמו</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><a className="nav-link" href="/drivers">ניהול נהגים ({driverDue.length} רישיונות)</a><a className="nav-link" href="/maintenance">ניהול תחזוקה</a></div></div>{all.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין כרגע התראות פתוחות.</p></div>:<div className="vehicle-list">{all.map(x=><div className="vehicle-row" key={x.id}><AlertTriangle size={19}/><div><b>{x.vehicle} · {x.label}</b><small>{x.type==="maintenance"?"טיפול מתוכנן":"תוקף מסמך"} · {x.date||"ללא תאריך"}</small></div><span className={x.days!==null&&x.days<0?"status-late":"status-pending"}>{x.days===null?"ממתין":x.days<0?"באיחור "+Math.abs(x.days)+" ימים":x.days===0?"היום":"בעוד "+x.days+" ימים"}</span></div>)}</div>}</section>; })()}
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מרכז אירועי בטיחות</h3><p>אירועים פתוחים אחרונים לפי חומרה ומועד דיווח</p></div><a className="nav-link" href="/incidents">ניהול אירועים</a></div>
      {incidentAlerts.length===0?<div className="fleet-empty"><ShieldCheck size={24}/><p>אין אירועי בטיחות פתוחים כרגע.</p></div>:<div className="vehicle-list">{incidentAlerts.map(item=><div className="vehicle-row" key={item.id}><AlertTriangle size={19}/><div><b>{item.incident_type||"אירוע בטיחות"} · {vehicles.find(v=>v.id===item.vehicle_id)?.registration_number||"רכב לא ידוע"}</b><small>{item.description||"ללא תיאור"} · {item.reported_at?new Date(item.reported_at).toLocaleString("he-IL"):"תאריך לא ידוע"}</small></div><span className={["high","critical"].includes(String(item.severity||"").toLowerCase())?"status-late":"status-pending"}>{({low:"נמוכה",medium:"בינונית",high:"גבוהה",critical:"קריטית"})[String(item.severity||"").toLowerCase()]||item.severity||"לא צוינה"}</span></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>מיקומי נהגים בזמן אמת</h3><p>המיקום האחרון שנשמר בכל נסיעה פעילה</p></div><span className="role-pill">{liveLocations.length} מיקומים</span></div>
      {liveLocations.length===0?<div className="fleet-empty"><Navigation size={26}/><p>עדיין אין נקודות GPS בנסיעות הפעילות.</p><span>כדי לראות נהג כאן, יש להתחיל מעקב GPS במסך משימות ונסיעות.</span></div>:<div className="vehicle-list">{liveLocations.map(loc=><div className="vehicle-row" key={loc.id}><Navigation size={20}/><div><b>{loc.driver} · {loc.vehicle}</b><small>עודכן: {new Date(loc.recorded_at).toLocaleString("he-IL")} · {loc.speed_kmh==null?"מהירות לא זמינה":Math.round(Number(loc.speed_kmh))+" קמ״ש"}</small><small style={{color:!loc.recorded_at||Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"#b42318":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"#a15c00":"#16803c",fontWeight:600}}>{!loc.recorded_at?"זמן עדכון לא ידוע":Date.now()-new Date(loc.recorded_at).getTime()>10*60*1000?"המיקום לא עודכן מעל 10 דקות":Date.now()-new Date(loc.recorded_at).getTime()>2*60*1000?"המיקום מתעכב — מעל 2 דקות":"מיקום מעודכן"}</small><small>{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}</small></div><a className="nav-link" target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q="+loc.latitude+","+loc.longitude}>פתיחה במפה</a></div>)}</div>}
      </section>
      <section className="fleet-panel"><div className="fleet-panel-head"><div><h3>כלי הרכב שלי</h3><p>נתונים שנשמרים במסד הנתונים של הצי</p></div><button className="primary-btn" onClick={()=>setShowVehicle(!showVehicle)}><Plus size={16}/> הוספת רכב</button></div>
      {showVehicle&&<form className="vehicle-form" onSubmit={addVehicle}>
        <label>מספר רישוי<input required value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="12-345-67"/></label>
        <label>סוג רכב<select value={vehicleType} onChange={e=>setVehicleType(e.target.value)}><option>משאית</option><option>גורר</option><option>נגרר</option><option>מסחרית</option><option>רכב אחר</option></select></label>
        <label>יצרן / דגם<input value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="לדוגמה: Volvo FH"/></label>
        <label>נהג משויך<select value={assignedDriverId} onChange={e=>setAssignedDriverId(e.target.value)}><option value="">ללא נהג משויך</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
        <div style={{gridColumn:"1 / -1",borderTop:"1px solid #e5eaf1",paddingTop:12,marginTop:4}}>
          <b>נתוני משאית לניווט (אופציונלי)</b>
          <p style={{fontSize:12,color:"#718096",margin:"5px 0 10px"}}>יש להזין לפי רישיון הרכב ומדידה בפועל. נתונים חלקיים לא יישמרו כפרופיל ניתוב.</p>
        </div>
        <label>מבנה רכב<select value={routingVehicleType} onChange={e=>setRoutingVehicleType(e.target.value)}><option value="StraightTruck">משאית קשיחה</option><option value="Tractor">גורר / ראש גורר</option></select></label>
        <label>גובה כולל (ס״מ)<input type="number" min="100" max="600" step="1" value={heightCm} onChange={e=>setHeightCm(e.target.value)} placeholder="לפי מדידה"/></label>
        <label>רוחב כולל (ס״מ)<input type="number" min="100" max="350" step="1" value={widthCm} onChange={e=>setWidthCm(e.target.value)} placeholder="כולל מראות אם נדרש"/></label>
        <label>אורך כולל (ס״מ)<input type="number" min="200" max="3000" step="1" value={lengthCm} onChange={e=>setLengthCm(e.target.value)} placeholder="כולל נגרר"/></label>
        <label>משקל כולל מותר (ק״ג)<input type="number" min="1000" max="100000" step="100" value={grossWeightKg} onChange={e=>setGrossWeightKg(e.target.value)} placeholder="לפי רישיון הרכב"/></label>
        <label>משקל רכב ריק (ק״ג)<input type="number" min="500" max="100000" step="100" value={emptyWeightKg} onChange={e=>setEmptyWeightKg(e.target.value)} placeholder="ללא מטען"/></label>
        <label>מספר סרנים<input type="number" min="2" max="12" step="1" value={axleCount} onChange={e=>setAxleCount(e.target.value)} placeholder="לפי רישיון הרכב"/></label>
        <label>מספר נגררים<input type="number" min="0" max="3" step="1" value={trailerCount} onChange={e=>setTrailerCount(e.target.value)}/></label>
        <label>משקל מרבי לסרן (ק״ג)<input type="number" min="500" max="30000" step="100" value={weightPerAxleKg} onChange={e=>setWeightPerAxleKg(e.target.value)} placeholder="לפי רישיון / נתון מאומת"/></label>
        <button className="primary-btn" disabled={busy}>שמירת רכב</button>
      </form>}
      {vehicles.length===0?<div className="fleet-empty">עדיין לא הוספת כלי רכב. לחץ על "הוספת רכב" כדי להתחיל.</div>:<div className="vehicle-list">{vehicles.map(v=><div className="vehicle-row" key={v.id}><Truck size={20}/><div><b>{v.registration_number}</b><small>{[v.make,v.model,v.vehicle_type].filter(Boolean).join(" · ")}{v.assigned_driver_id ? " · נהג: "+(drivers.find(d=>d.id===v.assigned_driver_id)?.full_name||"לא נמצא") : " · ללא נהג משויך"}</small>{v.is_demo&&<small style={{color:"#9a6700",fontWeight:700}}>רכב הדגמה בלבד · אין להשתמש לניווט אמיתי</small>}</div>{!v.is_demo&&String(v.make||"").toLowerCase()==="man"&&["owner","fleet_manager","dispatcher"].includes(fleet.role)&&<button type="button" className="nav-link" disabled={busy} onClick={()=>markVehicleAsDemo(v)}>סמן כרכב הדגמה</button>}<span>{v.status==="available"?"זמין":v.status==="assigned"?"משויך":v.status==="on_trip"?"בנסיעה":v.status==="maintenance"?"בטיפול":v.status==="inactive"?"לא פעיל":v.status}</span></div>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · מחובר למסד הנתונים · נתוני הצי מוצגים מהמערכת</p>
    </section>
  </main>;
}
