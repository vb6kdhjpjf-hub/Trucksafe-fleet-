"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getSavedTruckRoutingProfile } from "../../lib/truck-routing-profile.mjs";
import { ArrowRight, MapPin, Navigation, Route, ShieldAlert, Truck } from "lucide-react";

const initial = {
  origin: "",
  destination: "",
  currentWeightKg: "",
  originCoordinates: null
};

function decodeUnsigned(encoded, state) {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = encoded.charCodeAt(state.index++) - 63;
    result += (byte & 0x1f) * (2 ** shift);
    shift += 5;
  } while (byte >= 0x20 && state.index < encoded.length);
  return result;
}

function decodeSigned(value) {
  return value & 1 ? ~(value >> 1) : value >> 1;
}

function decodeFlexiblePolyline(encoded) {
  if (!encoded) return [];
  const state = { index: 0 };
  const version = decodeUnsigned(encoded, state);
  if (version !== 1) return [];
  const precision = decodeUnsigned(encoded, state);
  const thirdDimension = decodeUnsigned(encoded, state);
  decodeUnsigned(encoded, state);
  const factor = 10 ** precision;
  let lat = 0;
  let lng = 0;
  let z = 0;
  const points = [];
  while (state.index < encoded.length) {
    lat += decodeSigned(decodeUnsigned(encoded, state));
    lng += decodeSigned(decodeUnsigned(encoded, state));
    if (thirdDimension) z += decodeSigned(decodeUnsigned(encoded, state));
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return meters >= 1000 ? (meters / 1000).toFixed(1) + " ק״מ" : Math.round(meters) + " מ׳";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? hours + " שעות ו-" + (minutes % 60) + " דקות" : minutes + " דקות";
}

export default function TruckRoutingPage() {
  const router = useRouter();
  const mapElement = useRef(null);
  const [form, setForm] = useState(initial);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [mapMessage, setMapMessage] = useState("");
  const [providerReady, setProviderReady] = useState(false);
  const [ptvChecking, setPtvChecking] = useState(false);
  const [ptvCheckResult, setPtvCheckResult] = useState(null);
  const [ptvRouteChecking, setPtvRouteChecking] = useState(false);
  const [ptvRouteResult, setPtvRouteResult] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למערכת אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      const { data: vehicleRows, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id,registration_number,make,model,status,is_demo,registration_verification_status,registration_document_path,registration_verified_at,registration_verified_by,routing_vehicle_type,height_cm,width_cm,length_cm,gross_weight_kg,empty_weight_kg,axle_count,trailer_count,weight_per_axle_kg")
        .in("status", ["available", "assigned"])
        .order("registration_number", { ascending: true });
      if (!alive) return;
      if (vehicleError) {
        setMessage("לא ניתן לטעון את כלי הרכב המורשים לניווט. נסה לטעון מחדש.");
        setVehicles([]);
      } else {
        const eligibleVehicles = (vehicleRows || []).filter(vehicle => getSavedTruckRoutingProfile(vehicle));
        setVehicles(eligibleVehicles);
        if (eligibleVehicles.length === 1) setSelectedVehicleId(eligibleVehicles[0].id);
      }
      setLoading(false);
      fetch("/api/truck-route").then(response => response.json()).then(status => {
        if (!alive) return;
        setProviderReady(Boolean(status.configured));
        if (!status.configured) setMessage("מנוע ניתוב המשאיות עדיין לא הופעל. יש להשלים חיבור לספק מאושר ולבדוק אותו לפני שימוש.");
      }).catch(() => { if (alive) setMessage("לא ניתן לבדוק את זמינות שירות הניווט."); });
    }).catch(() => { if (alive) { setMessage("לא ניתן לאמת את ההתחברות."); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!result || !mapElement.current) return;
    let cancelled = false;
    let map = null;
    let script = null;
    let style = null;
    const loadLeaflet = () => new Promise((resolve, reject) => {
      if (window.L) { resolve(window.L); return; }
      style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      style.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      style.crossOrigin = "";
      document.head.appendChild(style);
      script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.body.appendChild(script);
    });
    loadLeaflet().then(L => {
      if (cancelled || !mapElement.current) return;
      const points = result.sections.flatMap(section => decodeFlexiblePolyline(section.polyline));
      if (!points.length) return;
      map = L.map(mapElement.current, { scrollWheelZoom: false }).setView(points[0], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      const line = L.polyline(points, { color: "#245bd7", weight: 6, opacity: 0.9 }).addTo(map);
      L.marker(points[0]).addTo(map).bindPopup("מוצא");
      L.marker(points[points.length - 1]).addTo(map).bindPopup("יעד");
      map.fitBounds(line.getBounds().pad(0.12));
    }).catch(() => setMapMessage("המסלול חושב, אך לא הצלחנו לטעון את שכבת המפה. אפשר לעיין בהוראות הנסיעה."));
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [result]);

  async function checkPTVProfiles() {
    setPtvChecking(true);
    setPtvCheckResult(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setPtvCheckResult({ ok: false, reason: "יש להתחבר מחדש למערכת." });
        return;
      }
      const response = await fetch("/api/ptv-profile-check", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token }
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const messages = {
          ptv_key_not_configured: "מפתח PTV לא מוגדר בסביבת הבדיקות.",
          fleet_manager_required: "בדיקת החיבור זמינה לבעלים או למנהל צי בלבד.",
          ptv_authentication_rejected: "PTV דחתה את המפתח. צריך לבדוק שהחשבון הופעל והמפתח תקין.",
          ptv_data_api_unavailable: "שירות הנתונים של PTV אינו זמין כרגע.",
          ptv_profile_catalog_malformed: "PTV החזירה קטלוג פרופילים במבנה לא צפוי.",
          ptv_request_timeout: "הבדיקה מול PTV חרגה מזמן ההמתנה.",
          ptv_request_failed: "לא ניתן להשלים את הבדיקה מול PTV."
        };
        setPtvCheckResult({ ok: false, reason: messages[data.reason] || "בדיקת PTV נכשלה.", diagnosticCode: data.reason || "unknown", upstreamStatus: Number.isInteger(data.upstreamStatus) ? data.upstreamStatus : null, traceId: typeof data.traceId === "string" ? data.traceId : null, requestedAt: typeof data.requestedAt === "string" ? data.requestedAt : null });
        return;
      }
      setPtvCheckResult({ ok: true, ...data });
    } catch {
      setPtvCheckResult({ ok: false, reason: "לא ניתן להתחבר לבדיקת PTV." });
    } finally {
      setPtvChecking(false);
    }
  }

  async function checkPTVRouting() {
    setPtvRouteChecking(true);
    setPtvRouteResult(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setPtvRouteResult({ ok: false, reason: "יש להתחבר מחדש למערכת." });
        return;
      }
      const response = await fetch("/api/ptv-routing-check", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token }
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const messages = {
          ptv_key_not_configured: "מפתח PTV אינו מוגדר בסביבת הבדיקות.",
          fleet_manager_required: "הבדיקה זמינה לבעלים או למנהל צי בלבד.",
          ptv_routing_auth_rejected: "PTV דחתה את ההרשאה ל־Routing API.",
          ptv_routing_unavailable: "שירות Routing API אינו זמין כרגע.",
          ptv_routing_response_invalid: "PTV החזירה תשובת מסלול במבנה לא צפוי.",
          ptv_routing_timeout: "בדיקת Routing API חרגה מזמן ההמתנה.",
          ptv_routing_request_failed: "לא ניתן להשלים בדיקת Routing API."
        };
        setPtvRouteResult({
          ok: false,
          reason: messages[data.reason] || "בדיקת Routing API נכשלה.",
          diagnosticCode: data.reason || "unknown",
          upstreamStatus: Number.isInteger(data.upstreamStatus) ? data.upstreamStatus : null,
          traceId: typeof data.traceId === "string" ? data.traceId : null
        });
        return;
      }
      setPtvRouteResult({ ok: true, ...data });
    } catch {
      setPtvRouteResult({ ok: false, reason: "לא ניתן להתחבר לבדיקת Routing API." });
    } finally {
      setPtvRouteChecking(false);
    }
  }

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value, ...(key === "origin" ? { originCoordinates: null } : {}) }));
  }

  function selectVehicle(vehicleId) {
    setSelectedVehicleId(vehicleId);
    setForm(current => ({ ...current, currentWeightKg: "" }));
    setResult(null);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setMessage("הדפדפן אינו תומך באיתור מיקום."); return; }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(position => {
      setForm(current => ({
        ...current,
        origin: "המיקום הנוכחי",
        originCoordinates: { lat: position.coords.latitude, lng: position.coords.longitude }
      }));
      setMessage("המיקום הנוכחי נקלט. בדוק שהוא מתאים לנקודת היציאה.");
      setLocating(false);
    }, error => {
      setMessage(error.code === 1 ? "לא אושרה גישה למיקום. אפשר להזין כתובת ידנית." : "לא הצלחנו לקבל מיקום. בדוק GPS ונסה שוב.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  async function calculate(event) {
    event.preventDefault();
    if (!selectedVehicleId || !vehicles.some(vehicle => vehicle.id === selectedVehicleId)) {
      setMessage("יש לבחור רכב שמור, זמין ומאומת מתוך הצי.");
      return;
    }
    const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedVehicleId);
    const currentWeightKg = Number(form.currentWeightKg);
    const savedProfile = getSavedTruckRoutingProfile(selectedVehicle);
    if (!savedProfile || !Number.isFinite(currentWeightKg) ||
        currentWeightKg < savedProfile.emptyWeightKg || currentWeightKg > savedProfile.grossWeightKg) {
      setMessage("יש להזין משקל בפועל תקין, בין משקל הרכב הריק למשקל הכולל המותר לפי הנתונים המאומתים.");
      return;
    }
    if (!providerReady) { setMessage("מנוע ניתוב המשאיות עדיין לא הופעל. אין לחשב מסלול עד להשלמת החיבור והבדיקות."); return; }
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setMessage("פג תוקף החיבור. יש להתחבר מחדש.");
        return;
      }
      const response = await fetch("/api/truck-route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token
        },
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          vehicleId: selectedVehicleId,
          currentWeightKg,
          originCoordinates: form.originCoordinates
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const details = [
          ...(data.restrictionValidation?.conflicts || []).map(item => item.roadName ? item.roadName + " — התנגשות עם מגבלה" : "התנגשות עם מגבלת דרך"),
          ...(data.restrictionValidation?.unresolved || []).map(item => item.roadName ? item.roadName + " — נדרש אימות" : "רשומת מגבלה דורשת אימות")
        ];
        setMessage((data.error || "לא הצלחנו לחשב מסלול.") + (details.length ? " " + details.join("; ") : ""));
        return;
      }
      setResult(data);
      if (data.hasCriticalNotices) setMessage("המסלול כולל התראות קריטיות. אין לצאת לדרך על סמך מסלול זה.");
      else setMessage("המסלול חושב. יש לאמת שילוט והגבלות בשטח לפני היציאה.");
    } catch {
      setMessage("לא ניתן להתחבר לשירות חישוב המסלולים. בדוק חיבור לאינטרנט ונסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main dir="rtl" style={{ padding: 24 }}>טוען...</main>;

  const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedVehicleId) || null;
  const selectedProfile = selectedVehicle ? getSavedTruckRoutingProfile(selectedVehicle) : null;
  const field = { width: "100%", padding: 12, border: "1px solid #dce3ee", borderRadius: 10, marginTop: 6, background: "white", color: "#172338" };
  const label = { display: "block", fontSize: 13, fontWeight: 600, color: "#344054" };
  const button = { border: 0, borderRadius: 10, background: "#245bd7", color: "white", padding: "12px 18px", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.65 : 1 };

  return <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172338", padding: 18 }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div><h1 style={{ margin: 0, fontSize: 25 }}><Truck size={24} style={{ verticalAlign: "middle" }}/> ניווט משאיות</h1><p style={{ color: "#718096", margin: "6px 0" }}>תכנון מסלול לפי מידות ומשקל הרכב והגבלות משאיות בישראל</p></div>
        <button type="button" onClick={() => router.push("/")} style={{ ...field, width: "auto", margin: 0, cursor: "pointer" }}><ArrowRight size={15} style={{ verticalAlign: "middle" }}/> לוח הבקרה</button>
      </header>

      <section style={{ background: "#fff8e8", border: "1px solid #f0d9a8", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <b><ShieldAlert size={17} style={{ verticalAlign: "middle" }}/> בטיחות לפני הכול</b>
        <p style={{ margin: "7px 0 0", lineHeight: 1.6, fontSize: 13 }}>המערכת משתמשת בנתוני ניתוב למשאיות של HERE. גם מסלול ללא התראות אינו הבטחה שהדרך בטוחה או חוקית בכל רגע. חובה לבדוק שילוט, הוראות משטרה, עבודות בכביש ומגבלות מקומיות לפני ובמהלך הנסיעה. מסלול עם התראה קריטית אינו מאושר ליציאה.</p>
      </section>

      {message && <div role="status" style={{ background: result?.hasCriticalNotices ? "#fff0f0" : "#eef4ff", border: "1px solid #dce6f7", borderRadius: 10, padding: 12, marginBottom: 14, lineHeight: 1.5 }}>{message}</div>}

      <section style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><b>בדיקת חיבור PTV</b><p style={{ margin: "5px 0 0", color: "#718096", fontSize: 12 }}>בדיקה מאובטחת של קטלוג פרופילי המשאיות בלבד. אינה מחשבת מסלול ואינה מפעילה ניווט.</p></div>
          <button type="button" onClick={checkPTVProfiles} disabled={ptvChecking || busy} style={{ ...field, width: "auto", margin: 0, cursor: "pointer" }}>{ptvChecking ? "בודק מול PTV..." : "בדוק חיבור PTV"}</button>
        </div>
        {ptvCheckResult && <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: ptvCheckResult.ok ? "#edf8f0" : "#fff0f0", lineHeight: 1.5 }}>
          {ptvCheckResult.ok ? <><b>החיבור ל־PTV עובד.</b><div>נמצאו {ptvCheckResult.profileCount} פרופילים בסך הכול, מתוכם {ptvCheckResult.truckCandidateCount} פרופילי משאית.</div>
            {ptvCheckResult.truckProfiles.length > 0 && <><div style={{ marginTop: 8, color: "#7c4a03", fontSize: 12 }}>המידות הן נתוני פרופיל כלליים של PTV. יש לאמת אותן מול רישיון הרכב או מדידה בפועל לפני שימוש.</div><ul style={{ margin: "6px 0", paddingRight: 20 }}>{ptvCheckResult.truckProfiles.map(profile => <li key={profile.name} style={{ marginBottom: 10 }}><div><b>{profile.name}</b> · {profile.region} · גובה {profile.vehicle.height ?? "לא ידוע"} ס״מ · רוחב {profile.vehicle.width ?? "לא ידוע"} ס״מ · אורך {profile.vehicle.length ?? "לא ידוע"} ס״מ · משקל כולל מותר {profile.vehicle.totalPermittedWeight ?? "לא ידוע"} ק״ג · סרנים {profile.vehicle.numberOfAxles ?? "לא ידוע"} · נגררים {profile.vehicle.numberOfTrailers ?? "לא ידוע"}</div><small style={{ color: "#7c4a03" }}>פרופיל כללי בלבד — אינו מחליף נתוני רכב מאומתים ואינו מועתק לרכב השמור.</small></li>)}</ul></>}
          </> : <>{ptvCheckResult.reason}{ptvCheckResult.upstreamStatus !== null && <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>קוד תגובת PTV: HTTP {ptvCheckResult.upstreamStatus} · קוד אבחון: {ptvCheckResult.diagnosticCode}</div>}{ptvCheckResult.traceId && <div style={{ marginTop: 6, fontSize: 12 }}>traceId: <code>{ptvCheckResult.traceId}</code></div>}{ptvCheckResult.requestedAt && <div style={{ fontSize: 12 }}>שעת הבדיקה: {ptvCheckResult.requestedAt}</div>}</>}
        </div>}
      </section>

      <section style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><b>בדיקת PTV Routing API</b><p style={{ margin: "5px 0 0", color: "#718096", fontSize: 12 }}>בדיקת תקשורת בלבד בין שתי נקודות קבועות בישראל. לא נשלחים פרטי משאית, לא נשמר מסלול ולא מופעל ניווט.</p></div>
          <button type="button" onClick={checkPTVRouting} disabled={ptvRouteChecking || ptvChecking || busy} style={{ ...field, width: "auto", margin: 0, cursor: "pointer" }}>{ptvRouteChecking ? "בודק Routing API..." : "בדוק Routing API"}</button>
        </div>
        {ptvRouteResult && <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: ptvRouteResult.ok ? "#edf8f0" : "#fff0f0", lineHeight: 1.5 }}>
          {ptvRouteResult.ok ? <><b>שירות Routing API הגיב בהצלחה.</b><div>{ptvRouteResult.routeFound ? "נמצא מסלול בין נקודות הבדיקה." : "הספק החזיר דגל הפרה; בדיקת התקשורת הצליחה אך לא נמצא מסלול תקין."}</div><div>מרחק: {formatDistance(ptvRouteResult.distanceMeters)} · זמן: {formatDuration(ptvRouteResult.durationSeconds)}</div><small style={{ color: "#7c4a03" }}>{ptvRouteResult.safetyNotice}</small></> : <>{ptvRouteResult.reason}{ptvRouteResult.upstreamStatus !== null && <div style={{ fontSize: 12 }}>HTTP {ptvRouteResult.upstreamStatus} · קוד אבחון: {ptvRouteResult.diagnosticCode}</div>}{ptvRouteResult.traceId && <div style={{ fontSize: 12 }}>traceId: <code>{ptvRouteResult.traceId}</code></div>}</>}
        </div>}
      </section>

      <form onSubmit={calculate} style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 16, padding: 18, boxShadow: "0 5px 20px #17233808" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>פרטי הנסיעה והרכב</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          <label style={label}>רכב שמור ומאומת מהצי<select required style={field} value={selectedVehicleId} onChange={event => selectVehicle(event.target.value)}><option value="">בחר רכב מאומת</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number}{vehicle.make ? " · " + vehicle.make : ""}</option>)}</select></label>
          <label style={label}>מוצא בישראל<div style={{ display: "flex", gap: 7, marginTop: 6 }}><input required maxLength={180} style={{ ...field, marginTop: 0, minWidth: 0 }} value={form.origin} onChange={e => update("origin", e.target.value)} placeholder="כתובת, יישוב או אזור"/><button type="button" onClick={useCurrentLocation} disabled={locating || busy} style={{ ...field, width: "auto", whiteSpace: "nowrap", marginTop: 0, cursor: "pointer" }}><MapPin size={15} style={{ verticalAlign: "middle" }}/> {locating ? "מאתר..." : "המיקום שלי"}</button></div></label>
          <label style={label}>יעד בישראל<input required maxLength={180} style={field} value={form.destination} onChange={e => update("destination", e.target.value)} placeholder="כתובת, יישוב או אזור"/></label>
          <label style={label}>משקל בפועל בנסיעה (ק״ג)<input required type="number" min={selectedProfile?.emptyWeightKg || 1} max={selectedProfile?.grossWeightKg || 100000} step="1" style={field} value={form.currentWeightKg} onChange={e => update("currentWeightKg", e.target.value)} placeholder={selectedProfile ? `בין ${selectedProfile.emptyWeightKg} ל־${selectedProfile.grossWeightKg}` : "בחר רכב תחילה"} disabled={!selectedProfile}/></label>
        </div>
        {selectedVehicle && selectedProfile ? <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#f5f8fc", border: "1px solid #e1e8f0", lineHeight: 1.7, fontSize: 13 }}>
          <b>פרופיל מאומת של הרכב</b>
          <div>גובה: {selectedProfile.heightCm} ס״מ · רוחב: {selectedProfile.widthCm} ס״מ · אורך: {selectedProfile.lengthCm} ס״מ</div>
          <div>משקל ריק: {selectedProfile.emptyWeightKg.toLocaleString("he-IL")} ק״ג · משקל כולל מותר: {selectedProfile.grossWeightKg.toLocaleString("he-IL")} ק״ג</div>
          <div>סרנים: {selectedProfile.axleCount} · נגררים: {selectedProfile.trailerCount} · משקל סרן שמור: {selectedProfile.weightPerAxleKg.toLocaleString("he-IL")} ק״ג</div>
          <small style={{ color: "#667085" }}>המידות והנתונים נלקחים מפרופיל הרכב השמור שאומת מול מסמכי הרכב. נתוני הנסיעה אינם משנים את פרופיל הרכב.</small>
        </div> : <p style={{ color: "#8a4b12", fontSize: 13 }}>לא נמצאו כלי רכב זמינים עם פרופיל ניתוב מלא ואימות רישיון. יש להשלים את פרטי הרכב ואימות המסמכים בלוח הבקרה לפני תכנון מסלול.</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
          <button type="submit" disabled={busy || !providerReady || !selectedVehicleId || !selectedProfile} style={button}><Route size={17} style={{ verticalAlign: "middle" }}/> {busy ? "מחשב מסלול..." : providerReady ? "חשב מסלול למשאית" : "ממתין לחיבור שירות הניווט"}</button>
          <span style={{ color: "#718096", fontSize: 12 }}>המערכת משתמשת רק בפרופיל רכב שמור ומאומת; יש להזין את המשקל בפועל לנסיעה הנוכחית.</span>
        </div>
      </form>

      {result && <section style={{ marginTop: 16, display: "grid", gap: 14 }}>
        {result.restrictionValidation?.validated && <div style={{ background: "#eef7f0", border: "1px solid #cde7d3", borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.5 }}>
          <b>בדיקת מאגר מגבלות הצי הושלמה.</b>
          <div>נבדקו {result.restrictionValidation.checkedRecords} רשומות פעילות/לא פעילות. הבדיקה מוגבלת למידע שהוזן ואומת בצי ואינה כוללת בהכרח את כל ההגבלות הרשמיות בישראל.</div>
        </div>}
        <div style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div><b>{result.origin}</b><div style={{ color: "#718096", margin: "5px 0" }}>אל</div><b>{result.destination}</b></div>
            <div style={{ display: "flex", gap: 18 }}><div><small style={{ color: "#718096" }}>מרחק</small><div style={{ fontSize: 21, fontWeight: 800 }}>{formatDistance(result.distanceMeters)}</div></div><div><small style={{ color: "#718096" }}>זמן משוער</small><div style={{ fontSize: 21, fontWeight: 800 }}>{formatDuration(result.durationSeconds)}</div></div></div>
          </div>
        </div>
        {result.hasCriticalNotices && <div role="alert" style={{ background: "#fff0f0", border: "1px solid #f1c5c5", borderRadius: 12, padding: 14, color: "#9b2525" }}><b>עצור — התקבלו התראות קריטיות מהניווט</b><ul>{result.notices.filter(n => n.severity.toLowerCase() === "critical").map((n,i)=><li key={i}>{n.title}</li>)}</ul>אין להשתמש במסלול זה לנסיעה.</div>}
        {result.notices.filter(n => n.severity.toLowerCase() !== "critical").length > 0 && <div style={{ background: "#fff8e8", border: "1px solid #f0d9a8", borderRadius: 12, padding: 14 }}><b>הודעות ספק הניווט</b><ul>{result.notices.filter(n => n.severity.toLowerCase() !== "critical").map((n,i)=><li key={i}>{n.title}</li>)}</ul></div>}
        <div style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 14, padding: 12 }}>
          <h3 style={{ margin: "4px 4px 10px", fontSize: 16 }}>מפת המסלול למשאית</h3>
          <div ref={mapElement} style={{ height: 360, minHeight: 280, borderRadius: 10, zIndex: 0, background: "#edf1f6" }}/>
          {mapMessage && <p role="status" style={{ color: "#9b5b16", fontSize: 12 }}>{mapMessage}</p>}
        </div>
        {result.actions.length > 0 && <div style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 14, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>הוראות נסיעה</h3>
          <ol style={{ paddingRight: 22, lineHeight: 1.8 }}>{result.actions.map((action,i)=><li key={i} style={{ padding: "5px 0" }}>{action.instruction}{action.length ? <small style={{ color: "#718096" }}> · {formatDistance(action.length)}</small> : null}</li>)}</ol>
        </div>}
      </section>}
      <footer style={{ color: "#8290a3", fontSize: 11, margin: "18px 4px" }}>TruckSafe Fleet · נתוני מסלול: HERE · שכבת מפה: © OpenStreetMap contributors</footer>
    </div>
  </main>;
}
