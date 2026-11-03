"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { Truck, ArrowRight, Plus, Wrench, RefreshCw, CalendarDays } from "lucide-react";

const blank = { vehicle_id: "", maintenance_type: "טיפול תקופתי", description: "", scheduled_at: "", completed_at: "", cost: "", odometer_km: "", status: "scheduled" };

export default function MaintenancePage() {
  const router = useRouter();
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false);
  const [fleet,setFleet]=useState(null), [vehicles,setVehicles]=useState([]), [records,setRecords]=useState([]);
  const [form,setForm]=useState(blank), [showForm,setShowForm]=useState(false), [message,setMessage]=useState("");

  useEffect(()=>{
    if(!isSupabaseConfigured){setMessage("החיבור למסד הנתונים אינו מוגדר.");setLoading(false);return;}
    let alive=true;
    supabase.auth.getSession().then(async ({data,error})=>{
      if(!alive)return;
      if(error || !data.session){router.replace("/");return;}
      const {data:member,error:me}=await supabase.from("fleet_members").select("fleet_id,role").eq("user_id",data.session.user.id).limit(1).maybeSingle();
      if(me || !member){setMessage(me?.message || "לא נמצא שיוך לצי.");setLoading(false);return;}
      const {data:current,error:fe}=await supabase.from("fleets").select("id,name").eq("id",member.fleet_id).single();
      if(fe){setMessage(fe.message);setLoading(false);return;}
      setFleet(current); await load(current.id); if(alive)setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(!s)router.replace("/");});
    return ()=>{alive=false;subscription.unsubscribe();};
  },[router]);

  async function load(id){
    const [v,r]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,odometer_km").eq("fleet_id",id).order("registration_number"),
      supabase.from("maintenance_records").select("id,vehicle_id,maintenance_type,description,scheduled_at,completed_at,cost,odometer_km,status,created_at").eq("fleet_id",id).order("scheduled_at",{ascending:true})
    ]);
    if(v.error || r.error){setMessage("שגיאה בטעינת הנתונים: "+(v.error?.message||r.error?.message));return;}
    setVehicles(v.data||[]);setRecords(r.data||[]);
  }
  async function save(e){
    e.preventDefault(); if(!fleet)return;
    setBusy(true);setMessage("");
    const payload={fleet_id:fleet.id,vehicle_id:form.vehicle_id,maintenance_type:form.maintenance_type,description:form.description.trim()||null,scheduled_at:form.scheduled_at||null,completed_at:form.completed_at||null,cost:form.cost===""?null:Number(form.cost),odometer_km:form.odometer_km===""?null:Number(form.odometer_km),status:form.status};
    const {error}=await supabase.from("maintenance_records").insert(payload);
    if(error)setMessage("לא הצלחנו לשמור: "+error.message);
    else{setForm(blank);setShowForm(false);await load(fleet.id);setMessage("רישום התחזוקה נשמר בהצלחה.");}
    setBusy(false);
  }
  async function markDone(record){
    setBusy(true);
    const {error}=await supabase.from("maintenance_records").update({status:"completed",completed_at:new Date().toISOString().slice(0,10)}).eq("id",record.id).eq("fleet_id",fleet.id);
    if(error)setMessage("לא הצלחנו לעדכן: "+error.message);else{await load(fleet.id);setMessage("הטיפול סומן כהושלם.");}
    setBusy(false);
  }
  const today=new Date().toISOString().slice(0,10);
  const pending=records.filter(r=>r.status!=="completed");
  const overdue=pending.filter(r=>r.scheduled_at && r.scheduled_at<today);
  const upcoming=pending.filter(r=>r.scheduled_at && r.scheduled_at>=today && r.scheduled_at<=new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  const date=v=>v?new Date(v+"T00:00:00").toLocaleDateString("he-IL"):"לא נקבע";
  const money=v=>v==null?"—":Number(v).toLocaleString("he-IL")+" ₪";
  if(loading)return <main className="auth-wrap"><section className="auth-card">טוען נתוני תחזוקה...</section></main>;
  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header"><div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>תחזוקת כלי רכב</small></div></div><a className="nav-link" href="/"><ArrowRight size={16}/> חזרה ללוח הבקרה</a></header>
    <section className="fleet-content">
      <div className="section-heading"><div><h2>טיפולים ותחזוקה</h2><p>מעקב אחר טיפולים מתוכננים, טיפולים שהושלמו ועלויות</p></div><button className="primary-button" onClick={()=>{setForm({...blank,vehicle_id:vehicles[0]?.id||""});setShowForm(true);}} disabled={!vehicles.length}><Plus size={17}/> הוספת טיפול</button></div>
      {message&&<div className="notice">{message}</div>}
      {!vehicles.length&&<div className="notice">עדיין לא הוגדרו כלי רכב בצי. יש להוסיף רכב לפני רישום טיפול.</div>}
      <div className="stats-grid">
        <article className="stat-card"><Wrench/><small>רישומי תחזוקה</small><strong>{records.length}</strong></article>
        <article className="stat-card"><CalendarDays/><small>טיפולים באיחור</small><strong>{overdue.length}</strong></article>
        <article className="stat-card"><CalendarDays/><small>טיפולים ב־30 הימים הקרובים</small><strong>{upcoming.length}</strong></article>
      </div>
      {showForm&&<form className="form-card" onSubmit={save}><h3>רישום טיפול חדש</h3>
        <label>רכב<select required value={form.vehicle_id} onChange={e=>setForm({...form,vehicle_id:e.target.value})}><option value="">בחירת רכב</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registration_number} · {[v.make,v.model].filter(Boolean).join(" ")}</option>)}</select></label>
        <label>סוג טיפול<input required value={form.maintenance_type} onChange={e=>setForm({...form,maintenance_type:e.target.value})}/></label>
        <label>תיאור<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <div className="form-grid"><label>תאריך מתוכנן<input type="date" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label><label>תאריך ביצוע<input type="date" value={form.completed_at} onChange={e=>setForm({...form,completed_at:e.target.value})}/></label><label>עלות בש״ח<input type="number" min="0" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/></label><label>קילומטראז׳ בעת הטיפול<input type="number" min="0" value={form.odometer_km} onChange={e=>setForm({...form,odometer_km:e.target.value})}/></label></div>
        <label>סטטוס<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="scheduled">מתוכנן</option><option value="completed">הושלם</option><option value="in_progress">בתהליך</option></select></label>
        <div className="form-actions"><button className="primary-button" disabled={busy||!form.vehicle_id}>{busy?"שומר...":"שמירת טיפול"}</button><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>ביטול</button></div>
      </form>}
      <section className="data-card"><div className="section-heading"><h3>רשימת טיפולים</h3><button className="secondary-button" onClick={()=>load(fleet.id)}><RefreshCw size={15}/> רענון</button></div>
        {!records.length?<p>אין עדיין רישומי תחזוקה.</p>:records.map(r=>{const vehicle=vehicles.find(v=>v.id===r.vehicle_id);const late=r.status!=="completed"&&r.scheduled_at&&r.scheduled_at<today;return <article className="data-row" key={r.id}><div><strong>{vehicle?.registration_number||"רכב לא ידוע"} · {r.maintenance_type}</strong><p>{r.description||"ללא תיאור"} · מועד: {date(r.scheduled_at)} · עלות: {money(r.cost)} · ק״מ: {r.odometer_km??"—"}</p></div><div className="row-actions"><span className={r.status==="completed"?"status-done":late?"status-late":"status-pending"}>{r.status==="completed"?"הושלם":late?"באיחור":r.status==="in_progress"?"בתהליך":"מתוכנן"}</span>{r.status!=="completed"&&<button className="secondary-button" disabled={busy} onClick={()=>markDone(r)}>סמן כהושלם</button>}</div></article>;})}
      </section>
    </section>
  </main>;
}
