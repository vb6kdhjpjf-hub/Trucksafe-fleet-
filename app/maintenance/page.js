"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { Truck, ArrowRight, Plus, Wrench, RefreshCw, CalendarDays } from "lucide-react";

const blank = { vehicle_id: "", incident_id: "", maintenance_type: "טיפול תקופתי", description: "", scheduled_at: "", completed_at: "", cost: "", odometer_km: "", status: "scheduled" };

export default function MaintenancePage() {
  const router = useRouter();
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false);
  const [fleet,setFleet]=useState(null), [vehicles,setVehicles]=useState([]), [records,setRecords]=useState([]), [incidents,setIncidents]=useState([]);
  const [form,setForm]=useState(blank), [showForm,setShowForm]=useState(false), [message,setMessage]=useState("");
  const [compliance,setCompliance]=useState({});

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
    const [v,r,i]=await Promise.all([
      supabase.from("vehicles").select("id,registration_number,make,model,odometer_km,next_service_at,test_due_at,insurance_due_at,registration_due_at").eq("fleet_id",id).order("registration_number"),
      supabase.from("maintenance_records").select("id,vehicle_id,incident_id,maintenance_type,description,scheduled_at,completed_at,cost,odometer_km,status,created_at").eq("fleet_id",id).order("scheduled_at",{ascending:true}),
      supabase.from("incidents").select("id,vehicle_id,incident_type,description,status,reported_at").eq("fleet_id",id).neq("status","resolved").order("reported_at",{ascending:false})
    ]);
    if(v.error || r.error || i.error){setMessage("שגיאה בטעינת הנתונים: "+(v.error?.message||r.error?.message||i.error?.message));return;}
    setVehicles(v.data||[]);setIncidents(i.data||[]);setCompliance(Object.fromEntries((v.data||[]).map(x=>[x.id,{test_due_at:x.test_due_at||"",insurance_due_at:x.insurance_due_at||"",registration_due_at:x.registration_due_at||""}])));setRecords(r.data||[]);
  }
  async function save(e){
    e.preventDefault(); if(!fleet)return;
    setBusy(true);setMessage("");
    const payload={fleet_id:fleet.id,vehicle_id:form.vehicle_id,incident_id:form.incident_id||null,maintenance_type:form.maintenance_type,description:form.description.trim()||null,scheduled_at:form.scheduled_at||null,completed_at:form.completed_at||null,cost:form.cost===""?null:Number(form.cost),odometer_km:form.odometer_km===""?null:Number(form.odometer_km),status:form.status};
    const {error}=await supabase.from("maintenance_records").insert(payload);
    if(error)setMessage("לא הצלחנו לשמור: "+error.message);
    else{setForm(blank);setShowForm(false);await load(fleet.id);setMessage("רישום התחזוקה נשמר בהצלחה.");}
    setBusy(false);
  }
  async function saveCompliance(vehicle){
    setBusy(true);setMessage("");
    const values=compliance[vehicle.id]||{};
    const {error}=await supabase.from("vehicles").update({test_due_at:values.test_due_at||null,insurance_due_at:values.insurance_due_at||null,registration_due_at:values.registration_due_at||null}).eq("id",vehicle.id).eq("fleet_id",fleet.id);
    if(error)setMessage("לא הצלחנו לשמור את תאריכי הרכב: "+error.message);
    else{await load(fleet.id);setMessage("תאריכי הרכב נשמרו.");}
    setBusy(false);
  }
  function exportMaintenanceCosts(){
    const rows=[["רכב","סוג טיפול","תאריך ביצוע","עלות בשח","קילומטראז","סטטוס"]];
    completedRecords.forEach(r=>{const v=vehicles.find(x=>x.id===r.vehicle_id);rows.push([v?.registration_number||"",r.maintenance_type||"",r.completed_at||r.scheduled_at||"",Number(r.cost||0),r.odometer_km??"", "הושלם"]);});
    const csv="\\uFEFF"+rows.map(row=>row.map(value=>"\""+String(value??"").replace(/\"/g,"\"\"")+"\"").join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    const link=document.createElement("a");link.href=url;link.download="trucksafe-maintenance-costs.csv";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }
  async function markDone(record){
    setBusy(true);
    const {error}=await supabase.from("maintenance_records").update({status:"completed",completed_at:new Date().toISOString().slice(0,10)}).eq("id",record.id).eq("fleet_id",fleet.id);
    if(error)setMessage("לא הצלחנו לעדכן: "+error.message);else{await load(fleet.id);setMessage("הטיפול סומן כהושלם.");}
    setBusy(false);
  }
  async function markInProgress(record){
    setBusy(true);setMessage("");
    const {error}=await supabase.from("maintenance_records").update({status:"in_progress"}).eq("id",record.id).eq("fleet_id",fleet.id);
    if(error)setMessage("לא הצלחנו לעדכן: "+error.message);else{await load(fleet.id);setMessage("הטיפול סומן כבתהליך.");}
    setBusy(false);
  }
  const today=new Date().toISOString().slice(0,10);
  const pending=records.filter(r=>r.status!=="completed");
  const overdue=pending.filter(r=>r.scheduled_at && r.scheduled_at<today);
  const upcoming=pending.filter(r=>r.scheduled_at && r.scheduled_at>=today && r.scheduled_at<=new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  const date=v=>v?new Date(v+"T00:00:00").toLocaleDateString("he-IL"):"לא נקבע";
  const vehicleDue=vehicles.filter(v=>v.next_service_at && v.next_service_at<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)).sort((a,b)=>a.next_service_at.localeCompare(b.next_service_at));
  const money=v=>v==null?"—":Number(v).toLocaleString("he-IL")+" ₪";
  const completedRecords=records.filter(r=>r.status==="completed" && r.cost!=null);
  const totalMaintenanceCost=completedRecords.reduce((sum,r)=>sum+Number(r.cost||0),0);
  const costByVehicle=vehicles.map(v=>{const list=completedRecords.filter(r=>r.vehicle_id===v.id);return {vehicle:v,total:list.reduce((sum,r)=>sum+Number(r.cost||0),0),count:list.length};}).filter(x=>x.count>0).sort((x,y)=>y.total-x.total);
  const monthlyCosts=Array.from({length:6},(_,index)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-index);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");return {key,label:d.toLocaleDateString("he-IL",{month:"long",year:"numeric"}),amount:completedRecords.filter(r=>(r.completed_at||r.scheduled_at||r.created_at||"").slice(0,7)===key).reduce((sum,r)=>sum+Number(r.cost||0),0)};}).reverse();
  if(loading)return <main className="auth-wrap"><section className="auth-card">טוען נתוני תחזוקה...</section></main>;
  return <main className="fleet-home maintenance-page" dir="rtl">
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
        <label>תקלה קשורה (לא חובה)<select value={form.incident_id} onChange={e=>{const selected=incidents.find(x=>x.id===e.target.value);setForm(old=>({...old,incident_id:e.target.value,description:old.description||selected?.description||"",maintenance_type:selected?.incident_type||old.maintenance_type}));}}><option value="">ללא קישור לתקלה</option>{incidents.filter(x=>x.vehicle_id===form.vehicle_id).map(x=><option key={x.id} value={x.id}>{x.incident_type} · {x.description?.slice(0,70)||"ללא תיאור"}</option>)}</select><small>בחירת תקלה תמלא אוטומטית את סוג הטיפול והתיאור, אם השדות עדיין ריקים.</small></label>
        <label>סוג טיפול<input required value={form.maintenance_type} onChange={e=>setForm({...form,maintenance_type:e.target.value})}/></label>
        <label>תיאור<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <div className="form-grid"><label>תאריך מתוכנן<input type="date" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label><label>תאריך ביצוע<input type="date" value={form.completed_at} onChange={e=>setForm({...form,completed_at:e.target.value})}/></label><label>עלות בש״ח<input type="number" min="0" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/></label><label>קילומטראז׳ בעת הטיפול<input type="number" min="0" value={form.odometer_km} onChange={e=>setForm({...form,odometer_km:e.target.value})}/></label></div>
        <label>סטטוס<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="scheduled">מתוכנן</option><option value="completed">הושלם</option><option value="in_progress">בתהליך</option></select></label>
        <div className="form-actions"><button className="primary-button" disabled={busy||!form.vehicle_id}>{busy?"שומר...":"שמירת טיפול"}</button><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>ביטול</button></div>
      </form>}
      <section className="data-card"><h3>מסמכים ותוקף רכב</h3><p>הזן את מועדי הטסט, הביטוח ורישיון הרכב. TruckSafe תציג התראה כאשר מועד מתקרב או עבר.</p>{vehicles.map(v=>{const x=compliance[v.id]||{};const dates=[["test_due_at","טסט"],["insurance_due_at","ביטוח"],["registration_due_at","רישיון רכב"]];return <div className="compliance-vehicle" key={v.id}><strong>{v.registration_number} · {[v.make,v.model].filter(Boolean).join(" ")}</strong><div className="form-grid">{dates.map(([key,label])=><label key={key}>{label}<input type="date" value={x[key]||""} onChange={e=>setCompliance(old=>({...old,[v.id]:{...(old[v.id]||{}),[key]:e.target.value}}))}/></label>)}</div><div className="row-actions">{dates.map(([key,label])=>{const value=x[key];if(!value)return <span key={key} className="status-pending">{label}: לא הוזן</span>;const diff=Math.ceil((new Date(value+"T00:00:00")-new Date(today+"T00:00:00"))/86400000);return <span key={key} className={diff<0?"status-late":diff<=30?"status-pending":"status-done"}>{label}: {diff<0?"באיחור":diff<=30?"מתקרב":"בתוקף"} · {date(value)}</span>;})}</div><button className="primary-button" disabled={busy} onClick={()=>saveCompliance(v)}>שמירת תאריכים</button></div>;})}{!vehicles.length&&<p>אין כלי רכב להצגה.</p>}</section>
      {vehicleDue.length>0&&<section className="data-card"><h3>תזכורות לפי מועד הטיפול הבא ברכב</h3>{vehicleDue.map(v=><div className="data-row" key={v.id}><div><strong>{v.registration_number} · {[v.make,v.model].filter(Boolean).join(" ")}</strong><p>מועד טיפול הבא שהוגדר ברכב: {date(v.next_service_at)}</p></div><span className={v.next_service_at<today?"status-late":"status-pending"}>{v.next_service_at<today?"עבר מועד הטיפול":"מתקרב"}</span></div>)}</section>}<section className="data-card"><div className="section-heading"><h3>עלויות תחזוקה</h3><button className="secondary-button" onClick={exportMaintenanceCosts} disabled={!completedRecords.length}>ייצוא לאקסל (CSV)</button></div><p>סיכום עלויות של טיפולים שהושלמו.</p><div className="stats-grid"><article className="stat-card"><Wrench/><small>עלות מצטברת</small><strong>{money(totalMaintenanceCost)}</strong></article><article className="stat-card"><CalendarDays/><small>טיפולים עם עלות</small><strong>{completedRecords.length}</strong></article></div><h4>עלות לפי חודש</h4>{monthlyCosts.map(m=><div className="data-row" key={m.key}><strong>{m.label}</strong><strong>{money(m.amount)}</strong></div>)}<h4>עלות לפי רכב</h4>{costByVehicle.length?costByVehicle.map(x=><div className="data-row" key={x.vehicle.id}><div><strong>{x.vehicle.registration_number} · {[x.vehicle.make,x.vehicle.model].filter(Boolean).join(" ")}</strong><p>{x.count} טיפולים</p></div><strong>{money(x.total)}</strong></div>):<p>אין עדיין טיפולים שהושלמו עם עלות רשומה.</p>}</section><section className="data-card"><div className="section-heading"><h3>רשימת טיפולים</h3><button className="secondary-button" onClick={()=>load(fleet.id)}><RefreshCw size={15}/> רענון</button></div>
        {!records.length?<p>אין עדיין רישומי תחזוקה.</p>:records.map(r=>{const vehicle=vehicles.find(v=>v.id===r.vehicle_id);const late=r.status!=="completed"&&r.scheduled_at&&r.scheduled_at<today;return <article className="data-row" key={r.id}><div><strong>{vehicle?.registration_number||"רכב לא ידוע"} · {r.maintenance_type}</strong><p>{r.description||"ללא תיאור"} · מועד: {date(r.scheduled_at)} · עלות: {money(r.cost)} · ק״מ: {r.odometer_km??"—"}</p>{r.incident_id&&<small>קשור לתקלה: {incidents.find(x=>x.id===r.incident_id)?.incident_type||"תקלה שנסגרה או לא זמינה"}</small>}</div><div className="row-actions"><span className={r.status==="completed"?"status-done":late?"status-late":"status-pending"}>{r.status==="completed"?"הושלם":late?"באיחור":r.status==="in_progress"?"בתהליך":"מתוכנן"}</span>{r.status!=="completed"&&<>{r.status!=="in_progress"&&<button className="secondary-button" disabled={busy} onClick={()=>markInProgress(r)}>התחל טיפול</button>}<button className="secondary-button" disabled={busy} onClick={()=>markDone(r)}>סמן כהושלם</button></>}</div></article>;})}
      </section>
    </section>
  </main>;
}
