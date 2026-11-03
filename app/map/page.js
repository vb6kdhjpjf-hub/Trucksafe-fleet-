"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ArrowRight, MapPin, RefreshCw, Truck } from "lucide-react";

export default function FleetMapPage() {
  const router = useRouter();
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const markers = useRef([]);
  const routeLines = useRef([]);
  const [session, setSession] = useState(null);
  const [fleetId, setFleetId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");

  async function loadLocations(id) {
    if (!id) return;
    const { data: trips, error: tripError } = await supabase.from("trips")
      .select("id,driver_id,vehicle_id,origin_address,destination_address,started_at")
      .eq("fleet_id", id).eq("status", "active");
    if (tripError) { setError("לא ניתן לטעון נסיעות: " + tripError.message); return; }
    const points = await Promise.all((trips || []).map(async trip => {
      const [{ data: loc }, { data: history }, { data: driver }, { data: vehicle }] = await Promise.all([
        supabase.from("trip_locations").select("id,latitude,longitude,speed_kmh,recorded_at")
          .eq("trip_id", trip.id).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("trip_locations").select("latitude,longitude,recorded_at").eq("trip_id", trip.id).order("recorded_at", { ascending: false }).limit(3000),
        supabase.from("drivers").select("full_name").eq("id", trip.driver_id).maybeSingle(),
        supabase.from("vehicles").select("registration_number").eq("id", trip.vehicle_id).maybeSingle()
      ]);
      return loc ? { ...trip, ...loc, history: (history || []).reverse(), driver: driver?.full_name || "נהג", vehicle: vehicle?.registration_number || "רכב" } : null;
    }));
    setLocations(points.filter(Boolean));
    setError("");
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      setSession(data.session);
      const { data: membership, error: membershipError } = await supabase.from("fleet_members")
        .select("fleet_id").eq("user_id", data.session.user.id).limit(1).maybeSingle();
      if (membershipError || !membership) { setError("לא נמצא צי המשויך לחשבון."); setLoading(false); return; }
      setFleetId(membership.fleet_id);
      await loadLocations(membership.fleet_id);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!fleetId) return;
    const timer = setInterval(() => loadLocations(fleetId), 15000);
    return () => clearInterval(timer);
  }, [fleetId]);

  useEffect(() => {
    if (!mapElement.current || typeof window === "undefined") return;
    let cancelled = false;
    const loadMapLibrary = () => new Promise((resolve, reject) => {
      if (window.L) { resolve(window.L); return; }
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.body.appendChild(script);
    });
    loadMapLibrary().then(L => {
      if (cancelled || !mapElement.current || mapInstance.current) return;
      mapInstance.current = L.map(mapElement.current).setView([31.5, 34.9], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
      }).addTo(mapInstance.current);
      setMapReady(true);
    }).catch(() => setError("המפה לא נטענה. בדוק חיבור לאינטרנט ונסה שוב."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const L = typeof window !== "undefined" ? window.L : null;
    if (!mapReady || !map || !L) return;
    markers.current.forEach(marker => marker.remove());
    routeLines.current.forEach(line => line.remove());
    markers.current = locations.map(loc => {
      const marker = L.marker([Number(loc.latitude), Number(loc.longitude)]).addTo(map);
      marker.bindPopup("<b>" + loc.driver + "</b><br/>רכב: " + loc.vehicle +
        "<br/>מהירות: " + (loc.speed_kmh == null ? "לא זמינה" : Math.round(Number(loc.speed_kmh)) + " קמ״ש") +
        "<br/>עודכן: " + new Date(loc.recorded_at).toLocaleString("he-IL") + "<br/>" + (Date.now() - new Date(loc.recorded_at).getTime() > 120000 ? "אזהרה: המיקום מתעכב" : "המיקום מעודכן"));
      return marker;
    });
    const colors = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626"];
    routeLines.current = locations.map((loc, i) => {
      const path = (loc.history || []).map(p => [Number(p.latitude), Number(p.longitude)]);
      return path.length > 1 ? L.polyline(path, { color: colors[i % colors.length], weight: 5, opacity: 0.8 }).addTo(map) : null;
    }).filter(Boolean);
    const layers = [...markers.current, ...routeLines.current];
    if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds().pad(0.2));
  }, [locations, mapReady]);

  return <main dir="rtl" style={{ minHeight: "100vh", padding: 24, background: "#f5f7fb", color: "#172338" }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0 }}>מפת הנהגים</h1><p style={{ margin: "5px 0", color: "#718096" }}>מיקום הנהגים ומסלול הנסיעה שנשמר עד כה · רענון אוטומטי כל 15 שניות</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => loadLocations(fleetId)} style={buttonStyle}><RefreshCw size={16}/> רענון</button>
        <button onClick={() => router.push("/")} style={buttonStyle}><ArrowRight size={16}/> חזרה ללוח הבקרה</button>
      </div>
    </header>
    {error && <p style={{ background: "#fff0f0", padding: 12, borderRadius: 10 }}>{error}</p>}
    {loading ? <p>טוען נתונים...</p> : <>
      <section style={{ background: "white", borderRadius: 16, padding: 14, marginBottom: 14, boxShadow: "0 4px 20px #17233810" }}>
        <div ref={mapElement} style={{ height: "min(65vh, 620px)", minHeight: 340, borderRadius: 12, zIndex: 0 }} />
      </section>
      <section style={{ background: "white", borderRadius: 16, padding: 18 }}>
        <h3 style={{ marginTop: 0 }}><Truck size={18} style={{ verticalAlign: "middle" }}/> נסיעות ומסלולים עם GPS ({locations.length})</h3>
        {locations.length === 0 ? <p style={{ color: "#718096" }}>אין כרגע נקודות GPS בנסיעות הפעילות. הנהג צריך להתחיל מעקב GPS במסך משימות ונסיעות.</p> :
          locations.map(loc => <div key={loc.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid #edf0f5", flexWrap: "wrap" }}>
            <div><b>{loc.driver} · {loc.vehicle}</b><div style={{ color: "#718096", fontSize: 13 }}>עודכן {new Date(loc.recorded_at).toLocaleString("he-IL")} · {loc.speed_kmh == null ? "מהירות לא זמינה" : Math.round(Number(loc.speed_kmh)) + " קמ״ש"}</div><div style={{ fontSize: 13, color: Date.now() - new Date(loc.recorded_at).getTime() > 120000 ? "#b45309" : "#15803d", fontWeight: 600 }}>{Date.now() - new Date(loc.recorded_at).getTime() > 600000 ? "המיקום לא עודכן מעל 10 דקות" : Date.now() - new Date(loc.recorded_at).getTime() > 120000 ? "המיקום מתעכב — מעל 2 דקות" : "המיקום מעודכן"}</div></div>
            <a target="_blank" rel="noreferrer" href={"https://www.google.com/maps?q=" + loc.latitude + "," + loc.longitude} style={{ color: "#3867e8" }}><MapPin size={15} style={{ verticalAlign: "middle" }}/> ניווט לנקודה</a>
          </div>)}
      </section>
    </>}
  </main>;
}

const buttonStyle = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #e1e7f0", background: "white", padding: "10px 13px", borderRadius: 10, cursor: "pointer", color: "#172338" };
