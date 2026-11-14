"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const kinds=[["crane","מנוף"],["aerial_platform","במת הרמה / סל"],["concrete_pump","משאבת בטון"],["other_special","ציוד מיוחד אחר"]];
const num=v=>v.trim()===""?null:Number(v);
const empty={vehicle_id:"",equipment_kind:"crane",manufacturer:"",model:"",serial_number:"",travel_height_cm:"",travel_width_cm:"",travel_length_cm:"",working_height_cm:"",working_width_cm:"",working_length_cm:"",max_outreach_cm:"",max_lifting_capacity_kg:"",axle_configuration:""};

export default function SpecialEquipmentPage(){
 const [fleet,setFleet]=useState(null),[vehicles,setVehicles]=useState([]),[rows,setRows]=useState([]),[form,setForm]=useState(empty),[chart,setChart]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[notes,setNotes]=useState({});
 async function load(){
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){setMessage("יש להתחבר למערכת כדי לנהל ציוד מיוחד.");return;}
  const {data:members,error:memberError}=await supabase.from("fleet_members").select("fleet_id,role").eq("user_id",user.id).limit(2);
  if(memberError||!members?.length){setMessage("לא נמצא צי משויך לחשבון.");return;}
  if(members.length!==1){setMessage("לחשבון משויכים כמה ציים. יש לבחור צי במפורש לפני המשך.");return;}
  if(!["owner","fleet_manager"].includes(members[0].role)){setMessage("רק בעלים או מנהל צי יכולים לנהל ציוד מיוחד.");return;}
  const {data:f,error:fError}=await supabase.from("fleets").select("id,name").eq("id",members[0].fleet_id).single();
  if(fError){setMessage("לא ניתן לטעון את הצי.");return;}
  setFleet({...f,role:members[0].role});
  const [v,e]=await Promise.all([
   supabase.from("vehicles").select("id,registration_number,body_type,is_demo,registration_verification_status").eq("fleet_id",f.id).order("registration_number"),
   supabase.from("vehicle_special_equipment").select("*").eq("fleet_id",f.id).order("updated_at",{ascending:false})
  ]);
  if(v.error||e.error){setMessage("לא ניתן לטעון כלי רכב או ציוד מיוחד. בדוק הרשאות ומסד נתונים.");return;}
  setVehicles(v.data||[]);
  const rowsWithChartLinks=await Promise.all((e.data||[]).map(async row=>{
   if(!row.lifting_chart_document_path)return {...row,chartUrl:null};
   const {data:link,error:linkError}=await supabase.storage.from("vehicle-registrations").createSignedUrl(row.lifting_chart_document_path,300);
   return {...row,chartUrl:linkError?null:link?.signedUrl||null};
  }));
  setRows(rowsWithChartLinks);
 }
 useEffect(()=>{load();},[]);
 function chooseVehicle(id){
  const vehicle=vehicles.find(v=>v.id===id);
  const expectedKind=vehicle?.body_type==="aerial_platform"?"aerial_platform":vehicle?.body_type==="concrete_pump"?"concrete_pump":(vehicle?.body_type==="other_special"||vehicle?.body_type==="low_loader")?"other_special":"crane";
  const existing=rows.find(r=>r.vehicle_id===id);
  setForm(existing?{vehicle_id:id,equipment_kind:existing.equipment_kind,manufacturer:existing.manufacturer||"",model:existing.model||"",serial_number:existing.serial_number||"",travel_height_cm:String(existing.travel_height_cm??""),travel_width_cm:String(existing.travel_width_cm??""),travel_length_cm:String(existing.travel_length_cm??""),working_height_cm:String(existing.working_height_cm??""),working_width_cm:String(existing.working_width_cm??""),working_length_cm:String(existing.working_length_cm??""),max_outreach_cm:String(existing.max_outreach_cm??""),max_lifting_capacity_kg:String(existing.max_lifting_capacity_kg??""),axle_configuration:existing.axle_configuration||""}:{...empty,vehicle_id:id,equipment_kind:expectedKind});
  setChart(null);
 }
 const update=(key,value)=>setForm(current=>({...current,[key]:value}));
 const field=(label,key,props={})=><label style={{display:"grid",gap:5}}>{label}<input type={props.type||"text"} min={props.min} max={props.max} step={props.step} required={props.required||false} value={form[key]} onChange={e=>update(key,e.target.value)}/></label>;
 async function save(event){
  event.preventDefault();
  if(!fleet||!form.vehicle_id)return;
  const vehicle=vehicles.find(v=>v.id===form.vehicle_id);
  if(!vehicle||vehicle.is_demo){setMessage("לא ניתן לשמור ציוד לרכב הדגמה או לרכב שאינו בצי.");return;}
  const values={travel_height_cm:num(form.travel_height_cm),travel_width_cm:num(form.travel_width_cm),travel_length_cm:num(form.travel_length_cm),working_height_cm:num(form.working_height_cm),working_width_cm:num(form.working_width_cm),working_length_cm:num(form.working_length_cm),max_outreach_cm:num(form.max_outreach_cm),max_lifting_capacity_kg:num(form.max_lifting_capacity_kg)};
  if(!values.travel_height_cm||!values.travel_width_cm||!values.travel_length_cm||!form.axle_configuration.trim()){setMessage("חובה למלא מידות נסיעה ותצורת סרנים.");return;}
  if(["crane","aerial_platform","concrete_pump"].includes(form.equipment_kind)&&!chart&&!rows.some(r=>r.vehicle_id===vehicle.id&&r.lifting_chart_document_path)){setMessage("למנוף, סל או משאבת בטון נדרש תרשים יצרן.");return;}
  if(["crane","aerial_platform","concrete_pump"].includes(form.equipment_kind)&&(!values.working_height_cm||!values.working_width_cm||!values.working_length_cm||values.max_outreach_cm===null||!values.max_lifting_capacity_kg)){setMessage("למנוף, סל או משאבת בטון חובה למלא גובה, רוחב ואורך עבודה, שלוחה וכושר הרמה לפי מסמך היצרן.");return;}
  setBusy(true);setMessage("");
  try{
   let chartPath=rows.find(r=>r.vehicle_id===vehicle.id)?.lifting_chart_document_path||null;
   if(chart){
    if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(chart.type)||chart.size>8*1024*1024)throw new Error("תרשים היצרן חייב להיות PDF/JPEG/PNG/WEBP עד 8MB.");
    const safeName=chart.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"lifting-chart.pdf";
    chartPath=`${fleet.id}/${vehicle.id}/${crypto.randomUUID()}-${safeName}`;
    const {error}=await supabase.storage.from("vehicle-registrations").upload(chartPath,chart,{contentType:chart.type,upsert:false});
    if(error)throw error;
   }
   const payload={fleet_id:fleet.id,vehicle_id:vehicle.id,equipment_kind:form.equipment_kind,manufacturer:form.manufacturer.trim()||null,model:form.model.trim()||null,serial_number:form.serial_number.trim()||null,...values,axle_configuration:form.axle_configuration.trim(),lifting_chart_document_path:chartPath};
   const {error}=await supabase.from("vehicle_special_equipment").upsert(payload,{onConflict:"fleet_id,vehicle_id"});
   if(error)throw error;
   setChart(null);await load();setMessage("פרטי הציוד נשמרו ונשלחו לבדיקה מחדש. הם עדיין אינם מאושרים לניווט.");
  }catch(error){setMessage("לא ניתן לשמור את הציוד: "+(error?.message||"שגיאה לא ידועה"));}
  finally{setBusy(false);}
 }
 async function review(row,decision){
  const note=(notes[row.id]||"").trim();if(note.length<5){setMessage("יש לכתוב הערת בדיקה באורך 5 תווים לפחות.");return;}
  setBusy(true);setMessage("");
  const {error}=await supabase.rpc("review_vehicle_special_equipment",{p_equipment_id:row.id,p_decision:decision,p_note:note});
  if(error)setMessage("בדיקת הציוד נכשלה: "+error.message);
  else{await load();setNotes(x=>({...x,[row.id]:""}));setMessage(decision==="verified"?"הציוד עבר בדיקה פנימית. אין בכך אישור חוקי או אישור מסלול.":"הציוד נדחה ולא ניתן להשתמש בו לניתוב.");}
  setBusy(false);
 }
 return <main dir="rtl" style={{maxWidth:1100,margin:"0 auto",padding:20,fontFamily:"Arial,sans-serif",color:"#182230"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1>ציוד מיוחד ומנופים</h1><p>הפרדה בין מידות נסיעה למידות עבודה ותיעוד מסמכי יצרן</p></div><a href="/" style={{padding:10,border:"1px solid #ccd5df",borderRadius:8,textDecoration:"none"}}>חזרה לניהול הצי</a></header>
  {message&&<p role="status" style={{background:"#f2f4f7",padding:12,borderRadius:8}}>{message}</p>}
  <section style={{border:"1px solid #d0d5dd",borderRadius:12,padding:16,marginTop:16}}>
   <h2>הוספה / עדכון פרופיל ציוד</h2><p>עדכון נתונים מאפס את סטטוס האימות ודורש בדיקה חוזרת.</p>
   <form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
    <label>רכב<select required value={form.vehicle_id} onChange={e=>chooseVehicle(e.target.value)}><option value="">בחר רכב</option>{vehicles.filter(v=>!v.is_demo).map(v=><option key={v.id} value={v.id}>{v.registration_number} · {v.body_type||"ללא סיווג"}</option>)}</select></label>
    <label>סוג ציוד<select value={form.equipment_kind} onChange={e=>update("equipment_kind",e.target.value)}>{kinds.map(([id,label])=><option key={id} value={id}>{id==="other_special"&&vehicles.find(v=>v.id===form.vehicle_id)?.body_type==="low_loader"?"מוביל חריג / low-loader":label}</option>)}</select></label>
    {field("יצרן","manufacturer")}{field("דגם","model")}{field("מספר סידורי","serial_number")}
    <div style={{gridColumn:"1 / -1",borderTop:"1px solid #eaecf0",paddingTop:10,fontWeight:700}}>תצורת נסיעה — כשהציוד מקופל ומוכן לנסיעה</div>
    {field("גובה נסיעה (ס״מ)","travel_height_cm",{type:"number",min:100,max:600,step:1,required:true})}
    {field("רוחב נסיעה (ס״מ)","travel_width_cm",{type:"number",min:100,max:350,step:1,required:true})}
    {field("אורך נסיעה (ס״מ)","travel_length_cm",{type:"number",min:200,max:3000,step:1,required:true})}
    {field("תצורת סרנים / חלוקה","axle_configuration",{required:true})}
    <div style={{gridColumn:"1 / -1",borderTop:"1px solid #eaecf0",paddingTop:10,fontWeight:700}}>תצורת עבודה — אינה משמשת כמידות נסיעה</div>
    {field("גובה עבודה מרבי (ס״מ)","working_height_cm",{type:"number",min:100,max:10000,step:1})}
    {field("רוחב עבודה (ס״מ)","working_width_cm",{type:"number",min:100,max:10000,step:1})}
    {field("אורך עבודה (ס״מ)","working_length_cm",{type:"number",min:100,max:10000,step:1})}
    {field("שלוחת עבודה מרבית (ס״מ)","max_outreach_cm",{type:"number",min:0,max:100000,step:1})}
    {field("כושר הרמה מרבי (ק״ג)","max_lifting_capacity_kg",{type:"number",min:0,max:1000000,step:1})}
    <label style={{gridColumn:"1 / -1"}}>תרשים הרמה / מסמך יצרן (PDF/JPEG/PNG/WEBP, עד 8MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setChart(e.target.files?.[0]||null)}/></label>
    <button disabled={busy} style={{padding:12,border:0,borderRadius:8,background:"#175cd3",color:"white",fontWeight:700}}>שמירת פרופיל ושליחה לבדיקה</button>
   </form>
  </section>
  <section style={{marginTop:22}}><h2>פרופילי ציוד קיימים</h2>
   {rows.length===0?<p>עדיין לא הוגדר ציוד מיוחד בצי.</p>:rows.map(row=><article key={row.id} style={{border:"1px solid #d0d5dd",borderRadius:10,padding:14,marginBottom:12}}>
    <h3>{vehicles.find(v=>v.id===row.vehicle_id)?.registration_number||"רכב לא ידוע"} · {kinds.find(k=>k[0]===row.equipment_kind)?.[1]||row.equipment_kind}</h3>
    <p>נסיעה: {row.travel_height_cm} × {row.travel_width_cm} × {row.travel_length_cm} ס״מ · עבודה: גובה {row.working_height_cm||"—"} ס״מ · שלוחה {row.max_outreach_cm||"—"} ס״מ · כושר הרמה {row.max_lifting_capacity_kg||"—"} ק״ג</p>
    <p>יצרן: {row.manufacturer||"—"} · דגם: {row.model||"—"} · מספר סידורי: {row.serial_number||"—"} · סרנים: {row.axle_configuration||"—"}</p>
    {row.lifting_chart_document_path&&(row.chartUrl?<a href={row.chartUrl} target="_blank" rel="noopener noreferrer">פתיחת תרשים היצרן (קישור מאובטח ל־5 דקות)</a>:<small>לא ניתן ליצור קישור צפייה למסמך. בדוק הרשאת מנהל וגישה לאחסון הפרטי.</small>)}
    <strong>סטטוס: {row.evidence_status==="verified"?"מאומת פנימית":row.evidence_status==="rejected"?"נדחה":"ממתין לבדיקה"}</strong>
    {row.evidence_status==="pending"&&<div style={{display:"grid",gap:8,maxWidth:420,marginTop:10}}><p>לפני אישור, פתח את תרשים היצרן המאובטח והשווה את נתוני הנסיעה, שלושת ממדי העבודה, השלוחה וכושר ההרמה למסמכי הרכב. במוביל חריג, ודא שמידות התצורה הנגררת והסרנים תואמות למסמכים. האישור הוא בדיקה פנימית בלבד.</p><textarea rows={2} maxLength={1000} placeholder="מה נבדק? הערה של לפחות 5 תווים" value={notes[row.id]||""} onChange={e=>setNotes(x=>({...x,[row.id]:e.target.value}))}/><div style={{display:"flex",gap:8}}><button disabled={busy} onClick={()=>review(row,"verified")}>אישור בדיקה פנימית</button><button disabled={busy} onClick={()=>review(row,"rejected")}>דחייה</button></div></div>}
    <small style={{display:"block",marginTop:8,color:"#667085"}}>אימות פנימי בלבד — אינו אישור משרד התחבורה, היתר הרמה או אישור שמסלול מתאים לנסיעה.</small>
   </article>)}
  </section>
 </main>;
}
