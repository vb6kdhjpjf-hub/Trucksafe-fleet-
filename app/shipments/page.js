"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { validateDeliveryPhotoFiles, findDeliveryPhotoEntry } from "../../lib/delivery-proof-photos.mjs";
import { ArrowRight, ClipboardList, Plus, Truck, UserRound, MapPin, FileText, Package, CheckCircle2, Printer, PenLine, RefreshCw, X, ShieldCheck, Scale } from "lucide-react";

const units = [
  ["pallet","משטחים"],["carton","קרטונים"],["package","חבילות"],["piece","יחידות"],
  ["roll","גלילים"],["bundle","אגדים"],["container","מכולות"],["kg","ק״ג"],["tonne","טון"]
];
const emptyLine = () => ({ description:"", item_code:"", unit:"pallet", planned_quantity:"" });
const emptyStop = (count=1) => ({ address:"", allocations:Array.from({length:count},()=> "") });
const emptyForm = () => ({ customer_name:"", customer_reference:"", delivery_reference:"", scheduled_at:"", assigned_driver_id:"", assigned_vehicle_id:"", notes:"", lines:[emptyLine()], stops:[emptyStop()] });
const eventKey = () => crypto.randomUUID();

function SignaturePad({ canvasRef, onClear, onChange, disabled=false }) {
  const drawing = useRef(false);
  const last = useRef(null);
  function point(event) {
    const canvas=canvasRef.current, rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*(canvas.width/rect.width),y:(event.clientY-rect.top)*(canvas.height/rect.height)};
  }
  function start(event) {
    const canvas=canvasRef.current,ctx=canvas.getContext("2d");
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    drawing.current=true; last.current=point(event); ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y);
  }
  function move(event) {
    if(!drawing.current)return;
    event.preventDefault(); const ctx=canvasRef.current.getContext("2d"),p=point(event);
    ctx.strokeStyle="#14243b";ctx.lineWidth=2.4;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.lineTo(p.x,p.y);ctx.stroke();last.current=p;onChange(true);
  }
  function end(){drawing.current=false;last.current=null;}
  function clear(){const c=canvasRef.current;c.getContext("2d").clearRect(0,0,c.width,c.height);onChange(false);onClear?.();}
  return <div className="proof-signature"><div className="proof-signature-head"><b>חתימת מקבל הסחורה</b><button type="button" className="secondary-btn" onClick={clear} disabled={disabled}><X size={14}/> ניקוי חתימה</button></div><canvas ref={canvasRef} width={720} height={220} style={disabled?{pointerEvents:"none",opacity:0.7}:undefined} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="אזור חתימה של מקבל הסחורה"/><small>יש לחתום בתוך המסגרת. החתימה נשמרת באופן פרטי כחלק מאישור המסירה.</small></div>;
}

function DeliveryProofPanel({ fleetId, shipment, stop, canOverride, busy, setBusy, notify, onSaved }) {
  const [recipient,setRecipient]=useState("");
  const [note,setNote]=useState("");
  const [exception,setException]=useState("");
  const [palletsDelivered,setPalletsDelivered]=useState("0");
  const [palletsReceived,setPalletsReceived]=useState("0");
  const [palletsDamaged,setPalletsDamaged]=useState("0");
  const [photos,setPhotos]=useState([]);
  const [hasSignature,setHasSignature]=useState(false);
  const [attemptLocked,setAttemptLocked]=useState(false);
  const padRef=useRef(null);
  // Keep one idempotency key and stable private object paths for this mounted
  // proof attempt. If the server commits but the response is lost, retrying
  // must return the original note rather than issue a second document.
  const proofAttempt=useRef({eventKey:eventKey(),signaturePath:null,signatureBlob:null,signatureUploaded:false,photoEntries:[]});
  async function uploadOrConfirmExisting(objectPath,body,contentType){
    const storage=supabase.storage.from("delivery-proof-private");
    const {error}=await storage.upload(objectPath,body,{contentType,upsert:false});
    if(!error)return;
    const parts=objectPath.split("/");
    const fileName=parts.pop();
    const {data,error:listError}=await storage.list(parts.join("/"),{search:fileName,limit:20});
    if(!listError&&(data||[]).some(item=>item.name===fileName))return;
    throw error;
  }
  async function submit(event){
    event.preventDefault();
    if(busy)return;
    if(hasSignature&&!recipient.trim()){notify("יש להזין את שם מקבל הסחורה לפני שמירת החתימה.","error");return;}
    if(!hasSignature&&(!canOverride||exception.trim().length<5)){notify("נדרשת חתימת מקבל. רק בעלים או מנהל צי יכולים לתעד חריגת חתימה מנומקת.","error");return;}
    const numbers=[palletsDelivered,palletsReceived,palletsDamaged].map(Number);
    if(numbers.some(n=>!Number.isFinite(n)||n<0)||numbers[2]>numbers[1]){notify("יש לבדוק את כמויות המשטחים שהוחזרו והפגומים.","error");return;}
    const photoIssue=validateDeliveryPhotoFiles(photos);
    if(photoIssue){
      const messages={too_many:"אפשר לצרף עד 8 תמונות לאישור מסירה.",invalid_file:"אפשר לצרף רק PNG, JPG או WEBP, עד 10MB לכל תמונה.",total_too_large:"הנפח הכולל של התמונות לאישור אחד מוגבל ל־40MB. אפשר לבחור פחות תמונות או להקטין אותן.",invalid_selection:"בחירת התמונות אינה תקינה."};
      notify(messages[photoIssue]||messages.invalid_selection,"error");return;
    }
    // Freeze the payload once an upload or RPC may have started. A timeout is
    // ambiguous: the server may already have committed the note. Retrying with
    // edited data and the same idempotency key must never be possible.
    setAttemptLocked(true);
    setBusy(true);
    const prefix=fleetId+"/"+shipment.id+"/"+stop.id+"/";
    try{
      let signaturePath=null;
      if(hasSignature){
        const attempt=proofAttempt.current;
        if(!attempt.signatureBlob){
          const canvas=padRef.current;
          attempt.signatureBlob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("לא ניתן להפיק קובץ חתימה")),"image/png"));
        }
        if(!attempt.signaturePath)attempt.signaturePath=prefix+crypto.randomUUID()+".png";
        signaturePath=attempt.signaturePath;
        if(!attempt.signatureUploaded){
          await uploadOrConfirmExisting(signaturePath,attempt.signatureBlob,"image/png");
          attempt.signatureUploaded=true;
        }
      }
      const attempt=proofAttempt.current;
      const photoPaths=[];
      for(let i=0;i<photos.length;i++){
        const file=photos[i];
        // Match the actual File object, not its name/size/timestamp: two
        // different photos can share that metadata but must never share a path.
        let entry=findDeliveryPhotoEntry(attempt.photoEntries,file);
        if(!entry){
          const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
          entry={file,path:prefix+crypto.randomUUID()+"."+ext,uploaded:false};
          attempt.photoEntries.push(entry);
        }
        if(!entry.uploaded){
          await uploadOrConfirmExisting(entry.path,entry.file,entry.file.type);
          entry.uploaded=true;
        }
        photoPaths.push(entry.path);
      }
      const {data,error}=await supabase.rpc("complete_delivery_document",{
        p_fleet_id:fleetId,p_shipment_id:shipment.id,p_stop_id:stop.id,p_event_key:proofAttempt.current.eventKey,
        p_recipient_name:hasSignature?recipient.trim():null,p_signature_object_path:signaturePath,
        p_photo_object_paths:photoPaths,p_gps_latitude:null,p_gps_longitude:null,
        p_recipient_note:note.trim()||null,p_exception_reason:hasSignature?null:exception.trim(),
        p_pallets_delivered:numbers[0],p_pallets_received:numbers[1],p_pallets_damaged:numbers[2]
      });
      if(error)throw error;
      notify("אישור המסירה נשמר. תעודת משלוח "+data.note_number+" הופקה בהצלחה.","success");
      await onSaved();
    }catch(error){notify("לא ניתן להשלים את אישור המסירה: "+(error.message||"שגיאה לא ידועה"),"error");}
    finally{setBusy(false);}
  }
  return <form className="proof-panel" onSubmit={submit}>
    <h4><PenLine size={17}/> אישור מסירה ותעודת משלוח</h4>
    <p>השלם את פרטי המסירה. חתימת המקבל נדרשת; חריגה מחייבת אישור מנהל ותיעוד סיבה.</p>
    <label>שם מקבל הסחורה<input disabled={attemptLocked} maxLength={160} value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="שם מלא"/></label>
    <SignaturePad canvasRef={padRef} onChange={setHasSignature} onClear={()=>setHasSignature(false)} disabled={attemptLocked}/>
    {canOverride&&!hasSignature&&<label>סיבת חריגה — מדוע לא התקבלה חתימה?<textarea disabled={attemptLocked} rows={2} maxLength={1000} value={exception} onChange={e=>setException(e.target.value)} placeholder="הסבר ותיעוד אישור מנהל"/></label>}
    <div className="proof-grid">
      <label>משטחים שנמסרו<input disabled={attemptLocked} type="number" min="0" step="0.001" value={palletsDelivered} onChange={e=>setPalletsDelivered(e.target.value)}/></label>
      <label>משטחים שהתקבלו בחזרה<input disabled={attemptLocked} type="number" min="0" step="0.001" value={palletsReceived} onChange={e=>setPalletsReceived(e.target.value)}/></label>
      <label>משטחים פגומים<input disabled={attemptLocked} type="number" min="0" step="0.001" value={palletsDamaged} onChange={e=>setPalletsDamaged(e.target.value)}/></label>
    </div>
    <label>הערת מסירה (לא חובה)<textarea disabled={attemptLocked} rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="הערה למשרד או ללקוח"/></label>
    <label>תמונות מסירה (לא חובה)<input disabled={attemptLocked} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>setPhotos(Array.from(e.target.files||[]))}/></label>
    <small>עד 8 תמונות, 10MB לכל תמונה ועד 40MB בסך הכול. פורמטים: PNG, JPG או WEBP.</small>
    {photos.length>0&&<small>{photos.length} תמונות נבחרו · {(photos.reduce((total,file)=>total+file.size,0)/1024/1024).toFixed(1)}MB</small>}
    {attemptLocked&&<small>פרטי הניסיון נעולים כדי לאפשר ניסיון חוזר בטוח ללא שינוי נתוני המסירה.</small>}
    <button className="primary-btn" disabled={busy}><CheckCircle2 size={16}/>{busy?"שומר אישור...":attemptLocked?"ניסיון חוזר לשמירה":"שמירת אישור והפקת תעודה"}</button>
  </form>;
}

function DeliveryNotePrint({ note, onClose }) {
  const s=note.document_snapshot||{}, issuer=s.issuer||{}, customer=s.customer||{}, stop=s.stop||{}, proof=s.proof||{}, pallet=s.pallet_exchange||{};
  const cancelled=(note.adjustments||[]).some(a=>a.adjustment_type==="cancellation");
  const corrections=(note.adjustments||[]).filter(a=>a.adjustment_type==="correction");
  return <div className="delivery-print-overlay">
    <div className="delivery-print-actions"><button className="secondary-btn" onClick={onClose}>חזרה</button><button className="primary-btn" onClick={()=>window.print()}><Printer size={16}/> הדפסה / שמירה כ־PDF</button></div>
    <article className="delivery-print-page" dir="rtl">
      {cancelled&&<div className="delivery-cancelled-stamp">תעודת משלוח זו בוטלה</div>}
      <div className="delivery-print-top"><div><h1>{issuer.name||s.fleet_name||"תעודת משלוח"}</h1><p>{issuer.business_id&&"ח.פ./ע.מ.: "+issuer.business_id}{issuer.address&&" · "+issuer.address}</p><p>{issuer.phone||""} {issuer.email||""}</p></div><div className="delivery-note-number"><span>תעודת משלוח</span><b>{s.note_number||note.note_number}</b><small>{new Date(s.issued_at||note.issued_at).toLocaleString("he-IL")}</small></div></div>
      <hr/>
      <div className="delivery-print-customer"><div><small>לקוח</small><b>{customer.name||"—"}</b><span>אסמכתת לקוח: {customer.reference||"—"}</span><span>הזמנת משלוח: {customer.delivery_reference||"—"}</span></div><div><small>כתובת מסירה</small><b>{stop.address||"—"}</b><span>תחנה {stop.sequence_no||"—"}</span></div></div>
      <table className="delivery-print-table"><thead><tr><th>#</th><th>תיאור פריט</th><th>יחידה</th><th>מתוכנן</th><th>נמסר</th><th>פגום</th><th>נדחה</th><th>הוחזר</th></tr></thead><tbody>{(s.cargo_lines||[]).map((line,i)=><tr key={i}><td>{i+1}</td><td>{line.description}</td><td>{units.find(u=>u[0]===line.unit)?.[1]||line.unit}</td><td>{line.planned_quantity}</td><td>{line.delivered_quantity}</td><td>{line.damaged_quantity}</td><td>{line.rejected_quantity}</td><td>{line.returned_quantity}</td></tr>)}</tbody></table>
      <div className="delivery-pallet-summary"><b>החלפת משטחים</b><span>נמסרו: {pallet.delivered||0}</span><span>התקבלו: {pallet.received||0}</span><span>פגומים: {pallet.damaged||0}</span><span>יתרה: {pallet.outstanding||0}</span></div>
      <div className="delivery-print-proof"><div><b>אישור מקבל</b><p>{proof.recipient_name||"לא התקבלה חתימה"}</p>{note.signatureUrl&&<img className="delivery-signature-image" src={note.signatureUrl} alt="חתימת מקבל הסחורה"/>}<small>{proof.status==="signed"?"חתימה נשמרה באופן מאובטח":"חריגת חתימה באישור מנהל"}</small></div><div><b>הערות</b><p>{proof.recipient_note||proof.exception_reason||"—"}</p></div></div>
      {(note.photoUrls||[]).length>0&&<section className="delivery-print-photos"><b>תמונות מאישור המסירה</b><div>{note.photoUrls.map((url,index)=><figure key={url}><img src={url} alt={"תיעוד מסירה "+(index+1)}/><figcaption>תמונה {index+1}</figcaption></figure>)}</div></section>}
      {corrections.length>0&&<div className="delivery-print-adjustments"><b>תיעוד תיקונים נלווים</b>{corrections.map(a=><p key={a.id}>{a.reason} · {new Date(a.created_at).toLocaleString("he-IL")}</p>)}</div>}
      <footer>מסמך זה הוא תעודת משלוח ואינו חשבונית מס.</footer>
    </article>
  </div>;
}

export default function ShipmentsPage(){
  const router=useRouter();
  const [user,setUser]=useState(null),[fleet,setFleet]=useState(null);
  const [shipments,setShipments]=useState([]),[drivers,setDrivers]=useState([]),[vehicles,setVehicles]=useState([]);
  const [notes,setNotes]=useState([]),[settings,setSettings]=useState(null);
  const [form,setForm]=useState(emptyForm),[showForm,setShowForm]=useState(false);
  const [results,setResults]=useState({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState(""),[messageKind,setMessageKind]=useState("info");
  const [selectedNote,setSelectedNote]=useState(null);
  const [settingsForm,setSettingsForm]=useState({issuer_name:"",business_id:"",address:"",phone:"",email:"",number_prefix:"DL"});
  const [showSettings,setShowSettings]=useState(false);
  const role=fleet?.role||"";
  const canManage=["owner","fleet_manager","dispatcher"].includes(role);
  const canOverride=["owner","fleet_manager"].includes(role);
  const notify=(text,kind="info")=>{setMessage(text);setMessageKind(kind);};
  const loadData=useCallback(async(currentUser)=>{
    const {data,error}=await resolveFleetWorkspace(supabase,currentUser.id);
    if(error){if(["AUTH_REQUIRED","NO_FLEET"].includes(error.code))router.replace("/");else notify("לא ניתן לאמת את סביבת הצי: "+error.message,"error");return;}
    const currentFleet=data.fleet;setFleet(currentFleet);
    const [ship,drv,veh,lines,stops,stopLines,doc,config,adjustments]=await Promise.all([
      supabase.from("shipments").select("id,fleet_id,customer_name,customer_reference,delivery_reference,status,scheduled_at,assigned_driver_id,assigned_vehicle_id,notes,created_at").eq("fleet_id",currentFleet.id).order("created_at",{ascending:false}).limit(100),
      supabase.from("drivers").select("id,full_name,status").eq("fleet_id",currentFleet.id).order("full_name"),
      supabase.from("vehicles").select("id,registration_number,status").eq("fleet_id",currentFleet.id).order("registration_number"),
      supabase.from("shipment_lines").select("id,fleet_id,shipment_id,line_no,item_code,description,unit,planned_quantity").eq("fleet_id",currentFleet.id).order("line_no"),
      supabase.from("shipment_stops").select("id,fleet_id,shipment_id,sequence_no,stop_type,address,scheduled_at,status,completed_at,exception_reason").eq("fleet_id",currentFleet.id).order("sequence_no"),
      supabase.from("shipment_stop_lines").select("id,fleet_id,shipment_id,stop_id,shipment_line_id,planned_quantity,delivered_quantity,damaged_quantity,rejected_quantity,returned_quantity").eq("fleet_id",currentFleet.id),
      supabase.from("delivery_notes").select("id,fleet_id,shipment_id,stop_id,note_number,document_snapshot,issued_at").eq("fleet_id",currentFleet.id).order("issued_at",{ascending:false}).limit(100),
      supabase.from("delivery_note_settings").select("issuer_name,issuer_business_id,issuer_address,issuer_phone,issuer_email,number_prefix,next_number").eq("fleet_id",currentFleet.id).maybeSingle(),
      supabase.from("delivery_note_adjustments").select("id,delivery_note_id,adjustment_type,reason,payload,created_at").eq("fleet_id",currentFleet.id).order("created_at",{ascending:false})
    ]);
    for(const r of [ship,drv,veh,lines,stops,stopLines,doc,config,adjustments])if(r.error){notify("שגיאה בטעינת נתוני משלוחים: "+r.error.message,"error");return;}
    const lineMap=new Map((lines.data||[]).map(x=>[x.id,x]));
    const adjustmentMap=new Map();
    for(const adjustment of adjustments.data||[])(adjustmentMap.get(adjustment.delivery_note_id)||adjustmentMap.set(adjustment.delivery_note_id,[]).get(adjustment.delivery_note_id)).push(adjustment);
    const enrichedNotes=(doc.data||[]).map(note=>({...note,adjustments:adjustmentMap.get(note.id)||[]}));
    const noteMap=new Map(enrichedNotes.map(x=>[x.stop_id,x]));
    const built=(ship.data||[]).map(s=>({
      ...s,lines:(lines.data||[]).filter(l=>l.shipment_id===s.id),
      stops:(stops.data||[]).filter(st=>st.shipment_id===s.id).map(st=>({
        ...st,items:(stopLines.data||[]).filter(sl=>sl.stop_id===st.id).map(sl=>({...sl,line:lineMap.get(sl.shipment_line_id)})),
        deliveryNote:noteMap.get(st.id)||null
      }))
    }));
    setShipments(built);setDrivers(drv.data||[]);setVehicles(veh.data||[]);setNotes(enrichedNotes);
    setSettings(config.data||null);
    if(config.data)setSettingsForm({issuer_name:config.data.issuer_name||"",business_id:config.data.issuer_business_id||"",address:config.data.issuer_address||"",phone:config.data.issuer_phone||"",email:config.data.issuer_email||"",number_prefix:config.data.number_prefix||"DL"});
    else setSettingsForm({issuer_name:currentFleet.name||"",business_id:"",address:"",phone:"",email:"",number_prefix:"DL"});
  },[router]);
  useEffect(()=>{
    if(!isSupabaseConfigured){notify("החיבור למסד הנתונים אינו מוגדר.","error");setLoading(false);return;}
    let alive=true;
    supabase.auth.getSession().then(async({data,error})=>{
      if(!alive)return;if(error||!data.session){router.replace("/");return;}
      setUser(data.session.user);await loadData(data.session.user);if(alive)setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!next)router.replace("/");});
    return()=>{alive=false;subscription.unsubscribe();};
  },[router,loadData]);

  function updateLine(index,field,value){
    setForm(old=>({...old,lines:old.lines.map((line,i)=>i===index?{...line,[field]:value}:line)}));
  }
  function addLine(){
    setForm(old=>({...old,lines:[...old.lines,emptyLine()],stops:old.stops.map(s=>({...s,allocations:[...s.allocations,""]}))}));
  }
  function addStop(){
    setForm(old=>({...old,stops:[...old.stops,emptyStop(old.lines.length)]}));
  }
  function updateStop(index,field,value){
    setForm(old=>({...old,stops:old.stops.map((stop,i)=>i===index?{...stop,[field]:value}:stop)}));
  }
  function updateAllocation(stopIndex,lineIndex,value){
    setForm(old=>({...old,stops:old.stops.map((stop,i)=>i===stopIndex?{...stop,allocations:stop.allocations.map((q,j)=>j===lineIndex?value:q)}:stop)}));
  }
  async function createShipment(e){
    e.preventDefault();if(!canManage||busy)return;
    const lines=form.lines.map(l=>({...l,planned_quantity:Number(l.planned_quantity)}));
    const stops=form.stops.map(s=>({...s,items:s.allocations.map((q,i)=>({line_index:i,planned_quantity:Number(q)})).filter(x=>x.planned_quantity>0)}));
    if(!form.customer_name.trim()||lines.some(l=>!l.description.trim()||!Number.isFinite(l.planned_quantity)||l.planned_quantity<=0)||stops.some(s=>!s.address.trim()||!s.items.length)){
      notify("יש למלא לקוח, פריטים, כמויות וכתובת לכל תחנה.","error");return;
    }
    for(let i=0;i<lines.length;i++){
      const total=stops.reduce((sum,s)=>sum+(s.items.find(x=>x.line_index===i)?.planned_quantity||0),0);
      if(Math.abs(total-lines[i].planned_quantity)>0.000001){notify("החלוקה בין התחנות חייבת להיות שווה לכמות הכוללת בפריט: "+lines[i].description,"error");return;}
    }
    setBusy(true);
    try{
      const {data,error}=await supabase.rpc("create_shipment",{
        p_fleet_id:fleet.id,p_customer_name:form.customer_name.trim(),p_customer_reference:form.customer_reference.trim()||null,
        p_delivery_reference:form.delivery_reference.trim()||null,p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,
        p_assigned_driver_id:form.assigned_driver_id||null,p_assigned_vehicle_id:form.assigned_vehicle_id||null,
        p_notes:form.notes.trim()||null,p_lines:lines,p_stops:stops.map(s=>({address:s.address.trim(),stop_type:"delivery",items:s.items}))
      });
      if(error)throw error;
      setForm(emptyForm());setShowForm(false);notify("המשלוח נוצר ונשמר בהצלחה.","success");await loadData(user);
    }catch(error){notify("לא ניתן ליצור משלוח: "+error.message,"error");}
    finally{setBusy(false);}
  }
  async function recordStop(shipment,stop){
    if(busy)return;
    const draft=results[stop.id]||{};
    const payload=stop.items.map(item=>{
      const value=draft[item.id]||{};
      return {stop_line_id:item.id,delivered_quantity:Number(value.delivered_quantity??item.planned_quantity),
        damaged_quantity:Number(value.damaged_quantity??0),rejected_quantity:Number(value.rejected_quantity??0),returned_quantity:Number(value.returned_quantity??0)};
    });
    const short=stop.items.some((item,i)=>payload[i].delivered_quantity+payload[i].damaged_quantity+payload[i].rejected_quantity<Number(item.planned_quantity));
    if(short&&!String(draft.exception_reason||"").trim()){notify("במסירה חלקית, פגומה או דחויה יש לציין סיבה.","error");return;}
    setBusy(true);
    try{
      const {error}=await supabase.rpc("record_shipment_stop_result",{p_fleet_id:fleet.id,p_shipment_id:shipment.id,p_stop_id:stop.id,p_event_key:eventKey(),p_results:payload,p_exception_reason:draft.exception_reason||null});
      if(error)throw error;
      notify("כמויות המסירה נשמרו. כעת ניתן להשלים אישור מסירה ולהפיק תעודה.","success");await loadData(user);
    }catch(error){notify("לא ניתן לשמור את תוצאות הפריקה: "+error.message,"error");}
    finally{setBusy(false);}
  }
  async function saveSettings(e){
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      const {error}=await supabase.rpc("update_delivery_note_settings",{p_fleet_id:fleet.id,p_issuer_name:settingsForm.issuer_name,
        p_business_id:settingsForm.business_id||null,p_address:settingsForm.address||null,p_phone:settingsForm.phone||null,
        p_email:settingsForm.email||null,p_number_prefix:settingsForm.number_prefix.toUpperCase()});
      if(error)throw error;notify("פרטי המנפיק נשמרו.","success");await loadData(user);
    }catch(error){notify("לא ניתן לשמור פרטי מנפיק: "+error.message,"error");}
    finally{setBusy(false);}
  }
  async function openNote(note){
    const storage=supabase.storage.from("delivery-proof-private");
    const proof=note.document_snapshot?.proof||{};
    const paths=Array.isArray(proof.photo_object_paths)?proof.photo_object_paths:[];
    const signaturePromise=proof.signature_object_path
      ?storage.createSignedUrl(proof.signature_object_path,300)
      :Promise.resolve({data:null,error:null});
    const photoPromises=paths.map(path=>storage.createSignedUrl(path,300));
    const [signature,...photos]=await Promise.all([signaturePromise,...photoPromises]);
    if(signature.error||photos.some(result=>result.error)){
      notify("לא ניתן לטעון את כל קובצי אישור המסירה. בדוק הרשאות אחסון ונסה שוב.","error");
      return;
    }
    setSelectedNote({...note,signatureUrl:signature.data?.signedUrl||null,photoUrls:photos.map(result=>result.data.signedUrl)});
  }
  async function adjustNote(note,type){
    const reason=window.prompt(type==="cancellation"?"סיבת ביטול תעודת המשלוח:":"סיבת תיקון לתעודת המשלוח:");
    if(!reason||reason.trim().length<3)return;
    setBusy(true);
    try{
      const {error}=await supabase.rpc("add_delivery_note_adjustment",{p_fleet_id:fleet.id,p_delivery_note_id:note.id,p_event_key:eventKey(),
        p_adjustment_type:type,p_reason:reason.trim(),p_payload:type==="correction"?{correction_note:reason.trim()}:{}});
      if(error)throw error;notify(type==="cancellation"?"הביטול תועד בהיסטוריה; התעודה המקורית נשמרה ללא שינוי.":"התיקון תועד בנפרד; התעודה המקורית נשמרה ללא שינוי.","success");
      await loadData(user);
    }catch(error){notify("לא ניתן לתעד את הפעולה: "+error.message,"error");}
    finally{setBusy(false);}
  }
  if(selectedNote)return <DeliveryNotePrint note={selectedNote} onClose={()=>setSelectedNote(null)}/>;
  if(loading)return <main className="fleet-home"><div className="fleet-content"><p>טוען משלוחים...</p></div></main>;
  return <main className="fleet-home">
    <header className="fleet-header"><a href="/" className="auth-brand"><span><Truck size={23}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></a><div className="drivers-header-actions">
      <a className="nav-link" href="/"><ArrowRight size={15}/> ראשי</a><a className="nav-link" href="/daily-work"><Scale size={15}/> תוכניות עבודה</a>
      <a className="nav-link" href="/drivers"><UserRound size={15}/> נהגים</a><a className="nav-link" href="/tasks"><ClipboardList size={15}/> משימות</a>
    </div></header>
    <section className="fleet-content shipments-page">
      <div className="fleet-welcome"><div><small>תפעול משלוחים ואספקות</small><h2>משלוחים ותעודות משלוח</h2><p>{fleet?.name} · {shipments.length} משלוחים אחרונים</p></div>
      {canManage&&<button className="primary-btn" onClick={()=>{setShowForm(v=>!v);notify("");}}><Plus size={16}/> משלוח חדש</button>}</div>
      {message&&<div className="auth-message" role="status" style={messageKind==="success"?{background:"#eaf8f1",color:"#18794e"}:messageKind==="error"?{background:"#fff0f0",color:"#9b1c1c"}:{}}>{message}</div>}
      {canOverride&&<div className="fleet-panel"><div className="shipments-section-head"><div><h3>פרטי מנפיק ומספור תעודות</h3><p>הפרטים יופיעו בצילום המסמך בעת ההנפקה. שינוי פרטים לא משנה תעודות שכבר הונפקו.</p></div><button className="secondary-btn" onClick={()=>setShowSettings(v=>!v)}>{showSettings?"סגירה":"הגדרות מנפיק"}</button></div>
      {showSettings&&<form className="shipment-form-grid" onSubmit={saveSettings}>
        <label>שם העסק / החברה<input required maxLength={160} value={settingsForm.issuer_name} onChange={e=>setSettingsForm({...settingsForm,issuer_name:e.target.value})}/></label>
        <label>ח.פ. / ע.מ.<input maxLength={40} value={settingsForm.business_id} onChange={e=>setSettingsForm({...settingsForm,business_id:e.target.value})}/></label>
        <label>כתובת<input maxLength={300} value={settingsForm.address} onChange={e=>setSettingsForm({...settingsForm,address:e.target.value})}/></label>
        <label>טלפון<input maxLength={40} value={settingsForm.phone} onChange={e=>setSettingsForm({...settingsForm,phone:e.target.value})}/></label>
        <label>דוא״ל<input type="email" maxLength={254} value={settingsForm.email} onChange={e=>setSettingsForm({...settingsForm,email:e.target.value})}/></label>
        <label>קידומת מספור (2–10 תווים)<input required pattern="[A-Za-z0-9]{2,10}" maxLength={10} value={settingsForm.number_prefix} onChange={e=>setSettingsForm({...settingsForm,number_prefix:e.target.value.toUpperCase()})}/></label>
        <button className="primary-btn" disabled={busy}>שמירת פרטי מנפיק</button>
      </form>}</div>}
      {showForm&&canManage&&<form className="fleet-panel" onSubmit={createShipment}>
        <div className="shipments-section-head"><div><h3>יצירת משלוח</h3><p>הכמויות מתחלקות בין התחנות; אין המרה אוטומטית בין משטחים למשקל.</p></div></div>
        <div className="shipment-form-grid">
          <label>שם לקוח / נקודת אספקה<input required maxLength={160} value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})}/></label>
          <label>מספר הזמנת לקוח<input maxLength={120} value={form.customer_reference} onChange={e=>setForm({...form,customer_reference:e.target.value})}/></label>
          <label>אסמכתת משלוח<input maxLength={120} value={form.delivery_reference} onChange={e=>setForm({...form,delivery_reference:e.target.value})}/></label>
          <label>מועד מתוכנן<input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label>
          <label>נהג<select value={form.assigned_driver_id} onChange={e=>setForm({...form,assigned_driver_id:e.target.value})}><option value="">ללא שיוך כרגע</option>{drivers.filter(d=>d.status==="active").map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
          <label>רכב<select value={form.assigned_vehicle_id} onChange={e=>setForm({...form,assigned_vehicle_id:e.target.value})}><option value="">ללא שיוך כרגע</option>{vehicles.filter(v=>["available","assigned"].includes(v.status)).map(v=><option key={v.id} value={v.id}>{v.registration_number}</option>)}</select></label>
          <label className="shipment-wide">הערות<input maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        </div>
        <div className="shipments-section-head"><div><h3>פריטי מטען</h3><p>אפשר לערבב יחידות שונות באותו משלוח.</p></div><button type="button" className="secondary-btn" onClick={addLine}><Plus size={14}/> הוספת פריט</button></div>
        {form.lines.map((line,i)=><div className="shipment-line-editor" key={i}>
          <b>{i+1}</b><label>תיאור פריט<input required value={line.description} maxLength={200} onChange={e=>updateLine(i,"description",e.target.value)}/></label>
          <label>מק״ט<input value={line.item_code} maxLength={80} onChange={e=>updateLine(i,"item_code",e.target.value)}/></label>
          <label>יחידה<select value={line.unit} onChange={e=>updateLine(i,"unit",e.target.value)}>{units.map(u=><option key={u[0]} value={u[0]}>{u[1]}</option>)}</select></label>
          <label>כמות כוללת<input type="number" min="0.001" step="0.001" required value={line.planned_quantity} onChange={e=>updateLine(i,"planned_quantity",e.target.value)}/></label>
          {form.lines.length>1&&<button type="button" className="secondary-btn" onClick={()=>setForm(old=>({...old,lines:old.lines.filter((_,j)=>j!==i),stops:old.stops.map(s=>({...s,allocations:s.allocations.filter((_,j)=>j!==i)}))}))}>הסרה</button>}
        </div>)}
        <div className="shipments-section-head"><div><h3>תחנות פריקה וחלוקת כמויות</h3><p>הסכום בכל התחנות חייב להיות שווה לכמות המתוכננת בכל פריט.</p></div><button type="button" className="secondary-btn" onClick={addStop}><Plus size={14}/> הוספת תחנה</button></div>
        {form.stops.map((stop,i)=><div className="shipment-stop-editor" key={i}>
          <div className="shipment-stop-editor-head"><b>תחנה {i+1}</b>{form.stops.length>1&&<button type="button" className="secondary-btn" onClick={()=>setForm(old=>({...old,stops:old.stops.filter((_,j)=>j!==i)}))}>הסרת תחנה</button>}</div>
          <label>כתובת / נקודת פריקה<input required maxLength={300} value={stop.address} onChange={e=>updateStop(i,"address",e.target.value)}/></label>
          <div className="shipment-allocation-grid">{form.lines.map((line,j)=><label key={j}>{line.description||"פריט "+(j+1)} · {units.find(u=>u[0]===line.unit)?.[1]}<input type="number" min="0" step="0.001" value={stop.allocations[j]||""} onChange={e=>updateAllocation(i,j,e.target.value)} placeholder="כמות בתחנה"/></label>)}</div>
        </div>)}
        <div className="shipment-form-actions"><button className="primary-btn" disabled={busy}>{busy?"שומר...":"שמירת משלוח"}</button><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)}>ביטול</button></div>
      </form>}
      <div className="shipments-section-head"><div><h3>משלוחים פעילים והיסטוריה</h3><p>הצג כמויות מתוכננות, תוצאות מסירה ואישורים.</p></div><span>{shipments.length} משלוחים</span></div>
      {shipments.length===0?<div className="fleet-panel fleet-empty"><Package size={32}/><p>אין משלוחים להצגה כרגע.</p><span>{canManage?"צור משלוח ראשון כדי להתחיל.":"משלוחים שישויכו אליך יופיעו כאן."}</span></div>:
      shipments.map(shipment=><article className="fleet-panel shipment-card" key={shipment.id}>
        <div className="fleet-panel-head"><div><h3>{shipment.customer_name}</h3><p>אסמכתה: {shipment.delivery_reference||shipment.customer_reference||"—"} · {shipment.scheduled_at?new Date(shipment.scheduled_at).toLocaleString("he-IL"):"ללא מועד"}</p></div><span className="task-status">{({planned:"מתוכנן",assigned:"שויך לנהג",in_transit:"בדרך",partially_delivered:"נמסר חלקית",delivered:"נמסר",delivery_exception:"חריגת מסירה",cancelled:"בוטל"})[shipment.status]||shipment.status}</span></div>
        <div className="shipment-cargo-summary">{shipment.lines.map(line=><span key={line.id}><Package size={14}/>{line.description}: {Number(line.planned_quantity).toLocaleString("he-IL")} {units.find(u=>u[0]===line.unit)?.[1]||line.unit}</span>)}</div>
        {shipment.stops.map(stop=><section className="shipment-stop-card" key={stop.id}>
          <div className="shipment-stop-title"><div><b><MapPin size={15}/> {stop.sequence_no}. {stop.address}</b><small>{stop.status==="pending"?"ממתינה":stop.status==="in_progress"?"בתהליך":stop.status==="completed"?"הושלמה":stop.status==="partially_completed"?"הושלמה חלקית":stop.status}</small></div>{stop.deliveryNote&&<button className="secondary-btn" onClick={()=>openNote(stop.deliveryNote)}><FileText size={14}/> {stop.deliveryNote.note_number}</button>}</div>
          {stop.items.map(item=>{
            const draft=results[stop.id]?.[item.id]||{};
            return <div className="shipment-result-row" key={item.id}><div><b>{item.line?.description||"פריט"}</b><small>מתוכנן: {Number(item.planned_quantity).toLocaleString("he-IL")} {units.find(u=>u[0]===item.line?.unit)?.[1]||item.line?.unit}</small></div>
              {["pending","in_progress"].includes(stop.status)&&<div className="shipment-result-inputs">
                <label>נמסר<input type="number" min="0" step="0.001" value={draft.delivered_quantity??item.planned_quantity} onChange={e=>setResults(old=>({...old,[stop.id]:{...old[stop.id],[item.id]:{...old[stop.id]?.[item.id],delivered_quantity:e.target.value}}}))}/></label>
                <label>פגום<input type="number" min="0" step="0.001" value={draft.damaged_quantity??0} onChange={e=>setResults(old=>({...old,[stop.id]:{...old[stop.id],[item.id]:{...old[stop.id]?.[item.id],damaged_quantity:e.target.value}}}))}/></label>
                <label>נדחה<input type="number" min="0" step="0.001" value={draft.rejected_quantity??0} onChange={e=>setResults(old=>({...old,[stop.id]:{...old[stop.id],[item.id]:{...old[stop.id]?.[item.id],rejected_quantity:e.target.value}}}))}/></label>
                <label>הוחזר<input type="number" min="0" step="0.001" value={draft.returned_quantity??0} onChange={e=>setResults(old=>({...old,[stop.id]:{...old[stop.id],[item.id]:{...old[stop.id]?.[item.id],returned_quantity:e.target.value}}}))}/></label>
              </div>}
              {["completed","partially_completed"].includes(stop.status)&&<small>נמסר {item.delivered_quantity} · פגום {item.damaged_quantity} · נדחה {item.rejected_quantity} · הוחזר {item.returned_quantity}</small>}
            </div>;
          })}
          {["pending","in_progress"].includes(stop.status)&&<div className="shipment-stop-complete"><label>סיבת חוסר / פגם / דחייה (אם יש)<input maxLength={1000} value={results[stop.id]?.exception_reason||""} onChange={e=>setResults(old=>({...old,[stop.id]:{...old[stop.id],exception_reason:e.target.value}}))}/></label><button className="primary-btn" disabled={busy} onClick={()=>recordStop(shipment,stop)}><CheckCircle2 size={15}/> שמירת תוצאות פריקה</button></div>}
          {["completed","partially_completed"].includes(stop.status)&&!stop.deliveryNote&&<DeliveryProofPanel fleetId={fleet.id} shipment={shipment} stop={stop} canOverride={canOverride} busy={busy} setBusy={setBusy} notify={notify} onSaved={()=>loadData(user)}/>}
        </section>)}
      </article>)}
      {notes.length>0&&<section className="fleet-panel"><div className="shipments-section-head"><div><h3>תעודות משלוח שהונפקו</h3><p>המסמכים נשמרים בצילום מצב מקורי וניתנים להדפסה.</p></div></div>
        {notes.map(note=>{const cancelled=(note.adjustments||[]).some(a=>a.adjustment_type==="cancellation");const correctionCount=(note.adjustments||[]).filter(a=>a.adjustment_type==="correction").length;return <div className="delivery-note-row" key={note.id}><div><b>{note.note_number} · {cancelled?"בוטלה":correctionCount?"נרשם תיקון":"פעילה"}</b><small>{note.document_snapshot?.customer?.name||"לקוח"} · {new Date(note.issued_at).toLocaleString("he-IL")}</small></div><button className="secondary-btn" onClick={()=>openNote(note)}><Printer size={14}/> הצגה / PDF</button>{canOverride&&<><button className="secondary-btn" disabled={busy} onClick={()=>adjustNote(note,"correction")}>תיעוד הערת תיקון</button>{!cancelled&&<button className="secondary-btn" disabled={busy} onClick={()=>adjustNote(note,"cancellation")}>תיעוד ביטול</button>}</>}</div>})}
      </section>}
      <p className="fleet-foot">TruckSafe Fleet V1 · מסמכים חתומים ובלתי־ניתנים לשינוי · תעודת משלוח אינה חשבונית מס</p>
    </section>
  </main>;
}

function ScaleIcon(){return <Package size={15}/>;}
