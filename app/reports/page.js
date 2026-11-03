"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ArrowRight, BarChart3, Download, RefreshCw, Route, Truck, Users } from "lucide-react";

const kmBetween = (a, b) => {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(Number(b.latitude) - Number(a.latitude));
  const dLng = rad(Number(b.longitude) - Number(a.longitude));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(Number(a.latitude))) * Math.cos(rad(Number(b.latitude))) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const distanceFor = points => points.length < 2 ? null : points.slice(1).reduce((sum, p, i) => sum + kmBetween(points[i], p), 0);
const durationFor = trip => trip.started_at && trip.ended_at ? Math.max(0, (new Date(trip.ended_at) - new Date(trip.started_at)) / 60000) : null;
const fmt = n => n == null ? "—" : n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("he-IL");

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fleetId, setFleetId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [driverFilter, setDriverFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [period, setPeriod] = useState("30");
  const [error, setError] = useState("");

  async function loadReport(id) {
    if (!id) return;
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const { data, error: tripError } = await supabase.from("trips")
      .select("id,status,started_at,ended_at,driver_id,vehicle_id,origin_address,destination_address")
      .eq("fleet_id", id).gte("started_at", since.toISOString()).order("started_at", { ascending: false }).limit(500);
    if (tripError) { setError("לא ניתן לטעון דוחות: " + tripError.message); return; }
    const { data: maintenanceRows, error: maintenanceError } = await supabase.from("maintenance_records").select("id,vehicle_id,maintenance_type,completed_at,scheduled_at,cost,status").eq("fleet_id",id).eq("status","completed").not("cost","is",null).gte("completed_at",since.toISOString().slice(0,10)).order("completed_at",{ascending:false}).limit(500);
    if (maintenanceError) { setError("לא ניתן לטעון עלויות תחזוקה: " + maintenanceError.message); return; }
    setMaintenance(maintenanceRows || []);
    const ids = [...new Set((data || []).map(t => t.driver_id).filter(Boolean))];
    const vehicleIds = [...new Set((data || []).map(t => t.vehicle_id).filter(Boolean))];
    const [driverRows, vehicleRows] = await Promise.all([
      ids.length ? supabase.from("drivers").select("id,full_name").in("id", ids) : Promise.resolve({ data: [] }),
      vehicleIds.length ? supabase.from("vehicles").select("id,registration_number").in("id", vehicleIds) : Promise.resolve({ data: [] })
    ]);
    const rows = await Promise.all((data || []).map(async trip => {
      const { data: points } = await supabase.from("trip_locations").select("latitude,longitude,recorded_at")
        .eq("trip_id", trip.id).order("recorded_at", { ascending: true }).limit(3000);
      return { ...trip, points: points || [], km: distanceFor(points || []), minutes: durationFor(trip) };
    }));
    setDrivers(driverRows.data || []);
    setVehicles(vehicleRows.data || []);
    setTrips(rows);
    setError("");
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setError("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const { data: member, error: memberError } = await supabase.from("fleet_members")
        .select("fleet_id").eq("user_id", data.session.user.id).limit(1).maybeSingle();
      if (memberError || !member) { setError("לא נמצא צי המשויך לחשבון."); setLoading(false); return; }
      setFleetId(member.fleet_id);
      await loadReport(member.fleet_id);
      setLoading(false);
    });
  }, [router]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(period));
    return trips.filter(t => (!t.started_at || new Date(t.started_at) >= cutoff) &&
      (driverFilter === "all" || t.driver_id === driverFilter) &&
      (vehicleFilter === "all" || t.vehicle_id === vehicleFilter));
  }, [trips, period, driverFilter, vehicleFilter]);
  const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - Number(period));
  const filteredMaintenance = maintenance.filter(r => (!r.completed_at || new Date(r.completed_at+"T00:00:00") >= cutoffDate) && (vehicleFilter === "all" || r.vehicle_id === vehicleFilter));
  const maintenanceSpend = filteredMaintenance.reduce((sum,r)=>sum+Number(r.cost||0),0);
  const maintenanceByVehicle = vehicles.map(v=>({ ...v, spend: filteredMaintenance.filter(r=>r.vehicle_id===v.id).reduce((sum,r)=>sum+Number(r.cost||0),0), jobs: filteredMaintenance.filter(r=>r.vehicle_id===v.id).length })).filter(v=>v.jobs).sort((a,b)=>b.spend-a.spend);
  const totalKm = filtered.reduce((s, t) => s + (t.km || 0), 0);
  const totalMinutes = filtered.reduce((s, t) => s + (t.minutes || 0), 0);
  const withDistance = filtered.filter(t => t.km != null).length;
  const byDriver = drivers.map(d => ({ ...d, count: filtered.filter(t => t.driver_id === d.id).length, km: filtered.filter(t => t.driver_id === d.id).reduce((s,t)=>s+(t.km||0),0) })).filter(d => d.count).sort((a,b)=>b.km-a.km);
  const byVehicle = vehicles.map(v => ({ ...v, count: filtered.filter(t => t.vehicle_id === v.id).length, km: filtered.filter(t => t.vehicle_id === v.id).reduce((s,t)=>s+(t.km||0),0) })).filter(v => v.count).sort((a,b)=>b.km-a.km);
  const date = v => v ? new Date(v).toLocaleDateString("he-IL") : "—";
  function exportCsv() {
    const headers = ["תאריך התחלה", "תאריך סיום", "נהג", "מספר רכב", "סטטוס", "מרחק משוער בק״מ", "משך בדקות", "נקודות GPS", "מוצא", "יעד"];
    const rows = filtered.map(t => [
      t.started_at || "", t.ended_at || "",
      drivers.find(d => d.id === t.driver_id)?.full_name || "לא צוין",
      vehicles.find(v => v.id === t.vehicle_id)?.registration_number || "לא צוין",
      t.status, t.km == null ? "" : t.km.toFixed(2), t.minutes == null ? "" : Math.round(t.minutes),
      t.points.length, t.origin_address || "", t.destination_address || ""
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => '"' + String(value ?? "").replace(/"/g, '""') + '"').join(",")).join("\\r\\n");
    const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trucksafe-trip-report-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <main dir="rtl" style={{ minHeight: "100vh", padding: 24, background: "#f5f7fb", color: "#172338" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0 }}>דוחות נסיעות</h1><p style={{ color: "#718096" }}>סיכום מרחקים וזמני נסיעה לפי נהג וכלי רכב</p></div>
      <div style={{ display: "flex", gap: 8 }}><button onClick={exportCsv} style={btn}><Download size={16}/> ייצוא לאקסל</button><button onClick={() => loadReport(fleetId)} style={btn}><RefreshCw size={16}/> רענון</button><button onClick={() => router.push("/")} style={btn}><ArrowRight size={16}/> לוח הבקרה</button></div>
    </header>
    {error && <p style={{ background: "#fff0f0", padding: 12, borderRadius: 10 }}>{error}</p>}
    {loading ? <p>טוען דוחות...</p> : <>
      <section style={{ ...panel, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>תקופה <select value={period} onChange={e=>setPeriod(e.target.value)} style={field}><option value="7">7 ימים</option><option value="30">30 ימים</option><option value="90">90 ימים</option><option value="365">שנה</option></select></label>
        <label>נהג <select value={driverFilter} onChange={e=>setDriverFilter(e.target.value)} style={field}><option value="all">כל הנהגים</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
        <label>רכב <select value={vehicleFilter} onChange={e=>setVehicleFilter(e.target.value)} style={field}><option value="all">כל כלי הרכב</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registration_number}</option>)}</select></label>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <Stat icon={<Route/>} title="נסיעות בתקופה" value={filtered.length}/>
        <Stat icon={<BarChart3/>} title="מרחק מצטבר משוער" value={fmt(totalKm) + " ק״מ"}/>
        <Stat icon={<Truck/>} title="זמן נסיעה מצטבר" value={Math.floor(totalMinutes/60) + " ש׳ " + Math.round(totalMinutes%60) + " ד׳"}/>
        <Stat icon={<Users/>} title="נסיעות עם GPS מספיק" value={withDistance}/>
        <Stat icon={<BarChart3/>} title="הוצאות תחזוקה בתקופה" value={maintenanceSpend.toLocaleString("he-IL")+" ₪"}/>
      </section>
      <section style={panel}>
        <h3 style={{marginTop:0}}>ביצועים לפי נהג</h3>
        {byDriver.length ? byDriver.map(d=><div key={d.id} style={line}><b>{d.full_name}</b><span>{d.count} נסיעות · {fmt(d.km)} ק״מ</span></div>) : <p>אין נתונים לתקופה שנבחרה.</p>}
      </section>
      <section style={panel}>
        <h3 style={{marginTop:0}}>ביצועים לפי רכב</h3>
        {byVehicle.length ? byVehicle.map(v=><div key={v.id} style={line}><b>{v.registration_number}</b><span>{v.count} נסיעות · {fmt(v.km)} ק״מ</span></div>) : <p>אין נתונים לתקופה שנבחרה.</p>}
      </section>
      <section style={panel}>
        <h3 style={{marginTop:0}}>הוצאות תחזוקה לפי רכב</h3>
        {maintenanceByVehicle.length ? maintenanceByVehicle.map(v=><div key={v.id} style={line}><b>{v.registration_number}</b><span>{v.jobs} טיפולים · {v.spend.toLocaleString("he-IL")} ₪</span></div>) : <p>אין הוצאות תחזוקה שהושלמו בתקופה ובסינון שנבחרו.</p>}
      </section>
      <section style={panel}>
        <h3 style={{marginTop:0}}>פירוט נסיעות</h3>
        {filtered.length ? filtered.map(t=><div key={t.id} style={line}><div><b>{drivers.find(d=>d.id===t.driver_id)?.full_name || "נהג לא ידוע"} · {vehicles.find(v=>v.id===t.vehicle_id)?.registration_number || "רכב לא ידוע"}</b><div style={{fontSize:13,color:"#718096"}}>{date(t.started_at)} · {t.status==="completed"?"הושלמה":t.status==="active"?"פעילה":t.status}</div></div><span>{t.km==null?"אין מספיק נקודות GPS":fmt(t.km)+" ק״מ"} · {t.minutes==null?"—":Math.round(t.minutes)+" דקות"}</span></div>) : <p>אין נסיעות מתאימות לסינון.</p>}
      </section>
      <p style={{fontSize:12,color:"#718096"}}>המרחק מחושב בקו בין נקודות GPS שנשמרו, ולא לפי כבישים. נסיעות ללא לפחות שתי נקודות GPS אינן נכללות בחישוב המרחק. הנתונים מוגבלים ל־500 נסיעות אחרונות בשנה האחרונה.</p>
    </>}
  </main>;
}
function Stat({icon,title,value}) { return <article style={{...panel,margin:0}}><div style={{color:"#3867e8"}}>{icon}</div><div style={{fontSize:13,color:"#718096",marginTop:8}}>{title}</div><strong style={{fontSize:22}}>{value}</strong></article>; }
const panel={background:"white",borderRadius:14,padding:18,marginBottom:14,boxShadow:"0 4px 20px #17233810"};
const btn={display:"inline-flex",alignItems:"center",gap:7,border:"1px solid #e1e7f0",background:"white",padding:"9px 12px",borderRadius:10,cursor:"pointer",color:"#172338"};
const field={display:"block",marginTop:5,padding:9,border:"1px solid #dce3ee",borderRadius:8,background:"white",minWidth:130};
const line={display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"12px 0",borderTop:"1px solid #edf0f5"};
