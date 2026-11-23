"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { csvDocument } from "../../lib/csv.mjs";
import { ArrowRight, RefreshCw, FileDown, Truck, AlertTriangle, Wrench, Clock3 } from "lucide-react";

function localDayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString(), label: now.toLocaleDateString("he-IL") };
}
function csvCell(value) { return '"' + String(value ?? "").replace(/"/g, '""') + '"'; }

export default function DailyReportPage() {
  const router = useRouter();
  const [fleet, setFleet] = useState(null);
  const [trips, setTrips] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");

  const load = useCallback(async (fleetId) => {
    const range = localDayRange(); setDay(range.label); setError("");
    const [t, i, m] = await Promise.all([
      supabase.from("trips").select("id,driver_id,vehicle_id,status,origin_address,destination_address,started_at,ended_at").eq("fleet_id", fleetId).gte("started_at", range.start).lt("started_at", range.end).order("started_at", { ascending: false }),
      supabase.from("incidents").select("id,severity,incident_type,description,status,reported_at").eq("fleet_id", fleetId).gte("reported_at", range.start).lt("reported_at", range.end).order("reported_at", { ascending: false }),
      supabase.from("maintenance_records").select("id,maintenance_type,description,cost,status,completed_at,scheduled_at").eq("fleet_id", fleetId).gte("created_at", range.start).lt("created_at", range.end).order("created_at", { ascending: false })
    ]);
    const errors = [t.error, i.error, m.error].filter(Boolean);
    if (errors.length) setError("חלק מהנתונים לא נטענו: " + errors.map(x => x.message).join(" · "));
    setTrips(t.data || []); setIncidents(i.data || []); setMaintenance(m.data || []);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setError("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error: authError }) => {
      if (!alive) return;
      if (authError || !data.session) { router.replace("/"); return; }
      const { data: member, error: memberError } = await supabase.from("fleet_members").select("fleet_id").eq("user_id", data.session.user.id).limit(1).maybeSingle();
      if (!alive) return;
      if (memberError || !member) { setError(memberError?.message || "לא נמצא צי לחשבון."); setLoading(false); return; }
      const { data: f } = await supabase.from("fleets").select("id,name").eq("id", member.fleet_id).maybeSingle();
      if (!alive) return;
      setFleet(f || { id: member.fleet_id, name: "הצי שלי" });
      await load(member.fleet_id);
      if (alive) setLoading(false);
    }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) router.replace("/"); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router, load]);

  function exportCsv() {
    const rows = [["סוג","שעה","פרטים","סטטוס"], ...trips.map(x => ["נסיעה", new Date(x.started_at).toLocaleTimeString("he-IL"), (x.origin_address || "") + " → " + (x.destination_address || ""), x.status]), ...incidents.map(x => ["אירוע בטיחות", new Date(x.reported_at).toLocaleTimeString("he-IL"), (x.incident_type || "") + " " + (x.description || ""), x.status]), ...maintenance.map(x => ["תחזוקה", x.completed_at || x.scheduled_at || "", (x.maintenance_type || "") + " " + (x.description || "") + " עלות " + (x.cost ?? 0), x.status])];
    const csv = csvDocument(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "trucksafe-daily-" + day.replace(/\D/g, "-") + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const card = { background: "white", border: "1px solid #e5eaf2", borderRadius: 14, padding: 16 };
  const active = trips.filter(x => x.status === "active").length;
  const completed = trips.filter(x => x.status === "completed").length;
  const cost = maintenance.reduce((sum, x) => sum + Number(x.cost || 0), 0);

  return <main dir="rtl" style={{ minHeight: "100vh", maxWidth: 1000, margin: "0 auto", padding: 20, background: "#f5f7fb", color: "#172338" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><h1 style={{ margin: 0 }}>דוח פעילות יומי</h1><p style={{ color: "#68778c", margin: "6px 0" }}>{fleet?.name || "TruckSafe"} · {day}</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={button} onClick={() => router.push("/") }><ArrowRight size={16}/> לוח בקרה</button><button style={button} onClick={() => fleet && load(fleet.id)}><RefreshCw size={16}/> רענון</button><button style={button} onClick={exportCsv}><FileDown size={16}/> ייצוא CSV</button></div>
    </header>
    {error && <p style={{ ...card, color: "#a12b2b" }}>{error}</p>}
    {loading ? <p>טוען נתונים...</p> : <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
        <div style={card}><Truck/><h2 style={{ margin: "8px 0 0" }}>{trips.length}</h2><span>נסיעות שהתחילו היום</span></div>
        <div style={card}><Clock3/><h2 style={{ margin: "8px 0 0" }}>{active}</h2><span>נסיעות פעילות</span></div>
        <div style={card}><Truck/><h2 style={{ margin: "8px 0 0" }}>{completed}</h2><span>נסיעות שהושלמו</span></div>
        <div style={card}><AlertTriangle/><h2 style={{ margin: "8px 0 0" }}>{incidents.length}</h2><span>אירועי בטיחות היום</span></div>
        <div style={card}><Wrench/><h2 style={{ margin: "8px 0 0" }}>{cost.toLocaleString("he-IL")} ₪</h2><span>עלות תחזוקה שנרשמה היום</span></div>
      </section>
      <section style={{ ...card, marginBottom: 14 }}><h2 style={{ fontSize: 19, marginTop: 0 }}>נסיעות היום</h2>{trips.length ? trips.map(x => <div key={x.id} style={line}><b>{x.origin_address || "מוצא לא צוין"} ← {x.destination_address || "יעד לא צוין"}</b><span>{new Date(x.started_at).toLocaleTimeString("he-IL")} · {x.status === "active" ? "פעילה" : x.status === "completed" ? "הושלמה" : x.status}</span></div>) : <p>אין נסיעות שהתחילו היום.</p>}</section>
      <section style={{ ...card, marginBottom: 14 }}><h2 style={{ fontSize: 19, marginTop: 0 }}>אירועי בטיחות</h2>{incidents.length ? incidents.map(x => <div key={x.id} style={line}><b>{x.incident_type || "אירוע"} · {x.severity || "חומרה לא צוינה"}</b><span>{new Date(x.reported_at).toLocaleTimeString("he-IL")} · {x.description || ""}</span></div>) : <p>לא דווחו אירועים היום.</p>}</section>
      <section style={card}><h2 style={{ fontSize: 19, marginTop: 0 }}>תחזוקה שנרשמה היום</h2>{maintenance.length ? maintenance.map(x => <div key={x.id} style={line}><b>{x.maintenance_type || "תחזוקה"} · {Number(x.cost || 0).toLocaleString("he-IL")} ₪</b><span>{x.description || ""} · {x.status}</span></div>) : <p>אין רישומי תחזוקה חדשים היום.</p>}</section>
      <p style={{ color: "#68778c", fontSize: 12 }}>הדוח מבוסס על שעת ישראל במכשיר שבו נפתח הדוח. הוא מציג נסיעות לפי מועד התחלה ורישומי תחזוקה לפי מועד יצירה.</p>
    </>}
  </main>;
}
const button = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #dce3ee", borderRadius: 9, padding: "9px 12px", background: "white", cursor: "pointer" };
const line = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #edf0f5", padding: "12px 0" };
