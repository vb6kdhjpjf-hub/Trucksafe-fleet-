"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { Truck, ArrowRight, Plus, Pencil, Phone, IdCard, CalendarDays, Users, LogOut } from "lucide-react";

const emptyForm = { full_name: "", phone: "", license_number: "", license_class: "", license_expires_at: "" };

export default function DriversPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      setSession(data.session);
      await loadWorkspace(data.session.user);
      if (alive) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next) router.replace("/");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  async function loadWorkspace(user) {
    const { data: membership, error } = await supabase.from("fleet_members").select("fleet_id,role").eq("user_id", user.id).limit(1).maybeSingle();
    if (error) { setMessage("לא הצלחנו לטעון את פרטי הצי: " + error.message); return; }
    if (!membership) { router.replace("/"); return; }
    const { data: current, error: fleetError } = await supabase.from("fleets").select("id,name").eq("id", membership.fleet_id).single();
    if (fleetError) { setMessage("שגיאה בטעינת הצי: " + fleetError.message); return; }
    setFleet({ ...current, role: membership.role });
    await loadDrivers(current.id);
  }

  async function loadDrivers(fleetId) {
    const { data, error } = await supabase.from("drivers")
      .select("id,full_name,phone,license_number,license_class,license_expires_at,status,created_at")
      .eq("fleet_id", fleetId).order("created_at", { ascending: false });
    if (error) setMessage("שגיאה בטעינת הנהגים: " + error.message);
    else setDrivers(data || []);
  }

  function startAdd() { setEditing(null); setForm(emptyForm); setShowForm(true); setMessage(""); }
  function startEdit(driver) {
    setEditing(driver);
    setForm({
      full_name: driver.full_name || "", phone: driver.phone || "",
      license_number: driver.license_number || "", license_class: driver.license_class || "",
      license_expires_at: driver.license_expires_at || ""
    });
    setShowForm(true); setMessage("");
  }

  async function saveDriver(e) {
    e.preventDefault();
    if (!fleet) return;
    if (!form.full_name.trim()) { setMessage("יש להזין שם מלא לנהג."); return; }
    setBusy(true); setMessage("");
    try {
      const payload = {
        full_name: form.full_name.trim(), phone: form.phone.trim() || null,
        license_number: form.license_number.trim() || null,
        license_class: form.license_class.trim() || null,
        license_expires_at: form.license_expires_at || null
      };
      const wasEditing = Boolean(editing);
      const result = wasEditing
        ? await supabase.from("drivers").update(payload).eq("id", editing.id).eq("fleet_id", fleet.id)
        : await supabase.from("drivers").insert({ ...payload, fleet_id: fleet.id, status: "active" });
      if (result.error) { setMessage("לא הצלחנו לשמור את הנהג: " + result.error.message); return; }
      setShowForm(false); setEditing(null); setForm(emptyForm);
      await loadDrivers(fleet.id); setMessage(wasEditing ? "פרטי הנהג עודכנו." : "הנהג נוסף לצי בהצלחה.");
    } catch (error) {
      setMessage("שמירת הנהג נכשלה: " + (error?.message || "שגיאה לא ידועה"));
    } finally { setBusy(false); }
  }

  async function toggleStatus(driver) {
    if (!fleet || !driver?.id) return;
    const nextStatus = driver.status === "active" ? "off_duty" : "active";
    setBusy(true); setMessage("");
    try {
      if (nextStatus === "off_duty") {
        const { data: activeTrips, error: tripError } = await supabase.from("trips")
          .select("id").eq("fleet_id", fleet.id).eq("driver_id", driver.id).eq("status", "active").limit(1);
        if (tripError) { setMessage("לא ניתן לבדוק נסיעות פעילות: " + tripError.message); return; }
        if (activeTrips?.length) {
          setMessage("לא ניתן להשבית נהג במהלך נסיעה פעילה. יש לסיים את הנסיעה תחילה.");
          return;
        }
      }
      const { error } = await supabase.from("drivers").update({ status: nextStatus })
        .eq("id", driver.id).eq("fleet_id", fleet.id);
      if (error) { setMessage("לא הצלחנו לעדכן את סטטוס הנהג: " + error.message); return; }
      await loadDrivers(fleet.id);
      setMessage(nextStatus === "active" ? "הנהג סומן כפעיל." : "הנהג סומן כלא פעיל.");
    } catch (error) {
      setMessage("עדכון סטטוס הנהג נכשל: " + (error?.message || "שגיאה לא ידועה"));
    } finally { setBusy(false); }
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const licenseAlerts = drivers.filter(d=>d.license_expires_at).map(driver=>({...driver,days:Math.ceil((new Date(driver.license_expires_at+"T00:00:00")-today)/86400000)})).filter(driver=>driver.days<=30).sort((a,b)=>a.days-b.days);
  const expiredLicenses=licenseAlerts.filter(driver=>driver.days<0);
  const soonLicenses=licenseAlerts.filter(driver=>driver.days>=0);
  const canManageDrivers = ["owner", "fleet_manager"].includes(fleet?.role);
  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }

  if (loading) return <main className="auth-wrap"><section className="auth-card">טוען את רשימת הנהגים...</section></main>;

  return <main className="fleet-home" dir="rtl">
    <header className="fleet-header">
      <div className="auth-brand"><span><Truck size={24}/></span><div><h1>TruckSafe</h1><small>ניהול צי חכם</small></div></div>
      <div className="drivers-header-actions">
        <a className="nav-link" href="/"><ArrowRight size={16}/> חזרה ללוח הבקרה</a>
        <button className="logout-btn" onClick={signOut}><LogOut size={16}/> יציאה</button>
      </div>
    </header>
    <section className="fleet-content">
      <div className="fleet-welcome"><div><small>ניהול כוח אדם</small><h2>הנהגים שלי</h2><p>{fleet?.name || "הצי שלך"} · {drivers.length} נהגים רשומים</p></div><span className="role-pill"><Users size={14}/> {canManageDrivers ? "ניהול נהגים" : "צפייה בנהגים"}</span></div>
      {message && <div className="auth-message">{message}</div>}
      <section className="fleet-panel">
        <div className="fleet-panel-head"><div>{licenseAlerts.length>0&&<section className="fleet-panel" style={{borderRight:"4px solid #d97706"}}>
        <div className="fleet-panel-head"><div><h3>התראות תוקף רישיונות נהיגה</h3><p>רישיונות שפג תוקפם או יפוגו בתוך 30 יום</p></div><span className="role-pill">{licenseAlerts.length} התראות</span></div>
        {expiredLicenses.length>0&&<div className="auth-message" style={{background:"#fff0f0",color:"#9b1c1c"}}><b>{expiredLicenses.length} רישיונות שפג תוקפם</b></div>}
        {soonLicenses.length>0&&<div className="auth-message" style={{background:"#fff7e6",color:"#8a5700"}}><b>{soonLicenses.length} רישיונות שעומדים לפוג</b></div>}
        <div className="driver-list">{licenseAlerts.map(driver=><article className="driver-row" key={driver.id+"-expiry"}><div className="driver-avatar">{(driver.full_name||"?").trim().charAt(0)}</div><div className="driver-main"><b>{driver.full_name}</b><div className="driver-details"><span><CalendarDays size={13}/>תוקף עד {new Date(driver.license_expires_at+"T00:00:00").toLocaleDateString("he-IL")}</span></div></div><span className={driver.days<0?"status-late":"status-pending"}>{driver.days<0?"פג לפני "+Math.abs(driver.days)+" ימים":driver.days===0?"פג היום":"נותרו "+driver.days+" ימים"}</span>{canManageDrivers && <button className="secondary-btn" onClick={()=>startEdit(driver)}>עדכון פרטים</button>}</article>)}</div>
      </section>}
      <h3>רשימת נהגים</h3><p>פרטי קשר, רישיון וסטטוס העסקה</p></div>{canManageDrivers && <button className="primary-btn" onClick={startAdd}><Plus size={16}/> הוספת נהג</button>}</div>
        {showForm && canManageDrivers && <form className="driver-form" onSubmit={saveDriver}>
          <div className="driver-form-title">{editing ? "עריכת פרטי נהג" : "הוספת נהג חדש"}</div>
          <div className="driver-form-grid">
            <label>שם מלא *<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="שם הנהג"/></label>
            <label>טלפון<input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="050-0000000"/></label>
            <label>מספר רישיון<input value={form.license_number} onChange={e=>setForm({...form,license_number:e.target.value})} placeholder="מספר רישיון נהיגה"/></label>
            <label>דרגת רישיון<input value={form.license_class} onChange={e=>setForm({...form,license_class:e.target.value})} placeholder="לדוגמה: C / C+E"/></label>
            <label>תוקף רישיון<input type="date" value={form.license_expires_at} onChange={e=>setForm({...form,license_expires_at:e.target.value})}/></label>
          </div>
          <div className="driver-form-actions"><button className="primary-btn" disabled={busy}>{busy ? "שומר..." : "שמירת נהג"}</button><button type="button" className="secondary-btn" onClick={()=>{setShowForm(false);setEditing(null);setForm(emptyForm);}}>ביטול</button></div>
        </form>}
        {drivers.length === 0 ? <div className="fleet-empty"><Users size={30}/><p>לא נמצאו נהגים להצגה.</p><span>{canManageDrivers ? "אפשר להוסיף נהג חדש לצי." : "אם ציפית לראות נהגים נוספים, פנה למנהל הצי לבדיקת ההרשאות."}</span></div> :
          <div className="driver-list">{drivers.map(driver => <article className="driver-row" key={driver.id}>
            <div className="driver-avatar">{(driver.full_name || "?").trim().charAt(0)}</div>
            <div className="driver-main"><b>{driver.full_name}</b><div className="driver-details">
              {driver.phone && <span><Phone size={13}/>{driver.phone}</span>}
              {driver.license_number && <span><IdCard size={13}/>רישיון {driver.license_number}{driver.license_class ? " · " + driver.license_class : ""}</span>}
              {driver.license_expires_at && <span><CalendarDays size={13}/>תוקף עד {new Date(driver.license_expires_at + "T00:00:00").toLocaleDateString("he-IL")}</span>}
            </div></div>
            <span className={driver.status === "active" ? "driver-status active" : "driver-status inactive"}>{driver.status === "active" ? "פעיל" : "לא פעיל"}</span>
            {canManageDrivers && <div className="driver-actions"><button title="עריכת נהג" onClick={()=>startEdit(driver)}><Pencil size={15}/></button><button disabled={busy} onClick={()=>toggleStatus(driver)}>{driver.status === "active" ? "השבתה" : "הפעלה"}</button></div>}
          </article>)}</div>}
      </section>
      <p className="fleet-foot">TruckSafe Fleet V1 · פרטי הנהגים נשמרים במסד הנתונים של הצי</p>
    </section>
  </main>;
}
