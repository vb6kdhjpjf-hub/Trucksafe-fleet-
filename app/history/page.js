"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ArrowRight, History, MapPin, RefreshCw } from "lucide-react";

export default function TripHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fleetId, setFleetId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState("");

  async function loadHistory(id) {
    if (!id) return;
    const { data, error: tripError } = await supabase.from("trips")
      .select("id,status,origin_address,destination_address,started_at,ended_at,driver_id,vehicle_id")
      .eq("fleet_id", id).order("started_at", { ascending: false }).limit(100);
    if (tripError) { setError("לא ניתן לטעון היסטוריית נסיעות: " + tripError.message); return; }
    const tripIds = (data || []).map(trip => trip.id);
    const { data: historyRows, error: historyError } = tripIds.length
      ? await supabase.rpc("get_trip_history_data", { p_fleet_id: id, p_trip_ids: tripIds })
      : { data: [], error: null };
    if (historyError) { setError("לא ניתן לטעון נקודות GPS: " + historyError.message); return; }
    const historyByTrip = new Map((historyRows || []).map(row => [row.trip_id, row]));
    const rows = (data || []).map(trip => {
      const history = historyByTrip.get(trip.id);
      return {
        ...trip,
        driverName: history?.driver_name || "לא צוין",
        vehicleName: history?.vehicle_registration || "לא צוין",
        points: Array.isArray(history?.points) ? history.points : []
      };
    });
    setTrips(rows);
    setError("");
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setError("החיבור למסד הנתונים אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError || !data.session) { router.replace("/"); return; }
      const { data: membership, error: membershipError } = await supabase.from("fleet_members")
        .select("fleet_id").eq("user_id", data.session.user.id).limit(1).maybeSingle();
      if (!alive) return;
      if (membershipError || !membership) { setError(membershipError ? "שגיאה בטעינת שיוך הצי: " + membershipError.message : "לא נמצא צי המשויך לחשבון."); setLoading(false); return; }
      setFleetId(membership.fleet_id);
      await loadHistory(membership.fleet_id);
      if (alive) setLoading(false);
    }).catch(error => {
      if (alive) { setError("שגיאה בטעינת ההיסטוריה: " + error.message); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) router.replace("/");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  const date = value => value ? new Date(value).toLocaleString("he-IL") : "—";
  return <main dir="rtl" style={{ minHeight: "100vh", padding: 24, background: "#f5f7fb", color: "#172338" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0 }}>היסטוריית נסיעות</h1><p style={{ color: "#718096" }}>עד 100 הנסיעות האחרונות, כולל מסלולי GPS שנשמרו</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => loadHistory(fleetId)} style={btn}><RefreshCw size={16}/> רענון</button>
        <button onClick={() => router.push("/")} style={btn}><ArrowRight size={16}/> לוח הבקרה</button>
      </div>
    </header>
    {error && <p style={{ background: "#fff0f0", padding: 12, borderRadius: 10 }}>{error}</p>}
    {loading ? <p>טוען היסטוריה...</p> : trips.length === 0 ? <p>עדיין לא נרשמו נסיעות בצי.</p> : trips.map(trip =>
      <article key={trip.id} style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 12, boxShadow: "0 4px 20px #17233810" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div><b>{trip.driverName}</b> · {trip.vehicleName}<div style={{ color: "#718096", fontSize: 13 }}>{date(trip.started_at)} · {trip.status === "active" ? "נסיעה פעילה" : trip.status === "completed" ? "הסתיימה" : trip.status}</div></div>
          <span style={{ background: trip.status === "active" ? "#e8f1ff" : "#edf7ef", padding: "5px 10px", borderRadius: 20, height: "fit-content" }}>{trip.status === "active" ? "פעילה" : trip.status === "completed" ? "הושלמה" : trip.status}</span>
        </div>
        <p style={{ marginBottom: 8 }}>{trip.origin_address || "מוצא לא צוין"} ← {trip.destination_address || "יעד לא צוין"}</p>
        <div style={{ color: "#718096", fontSize: 13 }}>סיום: {date(trip.ended_at)} · נקודות GPS: {trip.points.length}</div>
        <button onClick={() => setExpanded(old => ({ ...old, [trip.id]: !old[trip.id] }))} style={{ ...btn, marginTop: 12 }}><History size={16}/>{expanded[trip.id] ? "הסתר נקודות GPS" : "הצג נקודות GPS"}</button>
        {expanded[trip.id] && <div style={{ marginTop: 12, borderTop: "1px solid #edf0f5", paddingTop: 10 }}>
          {trip.points.length === 0 ? <p>לא נשמרו נקודות GPS בנסיעה זו.</p> : trip.points.map((point, index) =>
            <div key={index} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", fontSize: 13, borderBottom: "1px solid #f0f2f6" }}>
              <span>{date(point.recorded_at)}</span>
              {Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && Number(point.latitude) >= -90 && Number(point.latitude) <= 90 && Number(point.longitude) >= -180 && Number(point.longitude) <= 180 ? <a target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q=" + Number(point.latitude) + "," + Number(point.longitude)} style={{ color: "#3867e8" }}><MapPin size={14} style={{ verticalAlign: "middle" }}/> {Number(point.latitude).toFixed(5)}, {Number(point.longitude).toFixed(5)}</a> : <span>נקודת GPS לא תקינה</span>}
            </div>)}
        </div>}
      </article>)}
    <p style={{fontSize:12,color:"#718096",marginTop:18}}>לשמירה על ביצועים מוצגות עד 500 נקודות GPS אחרונות לכל נסיעה. נקודות GPS הן נתוני מיקום מדווחים מהדפדפן, אינן מאומתות ואינן תחליף למדידה מוסמכת.</p>
  </main>;
}
const btn = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #e1e7f0", background: "white", padding: "9px 12px", borderRadius: 10, cursor: "pointer", color: "#172338" };
