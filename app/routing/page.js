"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ArrowRight, MapPin, Navigation, Route, ShieldAlert, Truck } from "lucide-react";

const initial = {
  origin: "",
  destination: "",
  heightCm: "",
  widthCm: "",
  lengthCm: "",
  grossWeightKg: "",
  currentWeightKg: "",
  weightPerAxleKg: "",
  vehicleType: "StraightTruck",
  axleCount: "",
  trailerCount: "0",
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
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMessage("החיבור למערכת אינו מוגדר."); setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) { router.replace("/"); return; }
      const { data: memberships, error: membershipError } = await supabase.from("fleet_members")
        .select("fleet_id").eq("user_id", data.session.user.id).limit(2);
      if (membershipError) {
        setMessage("לא הצלחנו לאמת את החברות בצי. לא נטען רכב עד לבדיקת ההרשאות.");
      } else if ((memberships || []).length > 1) {
        setMessage("החשבון משויך ליותר מצי אחד. בחירת צי מרובה עדיין לא הוגדרה, ולכן לא נבחר צי אוטומטית.");
      } else if (memberships?.[0]?.fleet_id) {
        const { data: fleetVehicles, error: vehicleError } = await supabase.from("vehicles")
          .select("id,registration_number,routing_vehicle_type,height_cm,width_cm,length_cm,gross_weight_kg,axle_count,trailer_count,weight_per_axle_kg,is_demo")
          .eq("fleet_id", memberships[0].fleet_id).eq("is_demo", false).order("registration_number");
        if (vehicleError) setMessage("לא הצלחנו לטעון את כלי הרכב המורשים.");
        else setVehicles(fleetVehicles || []);
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

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value, ...(key === "origin" ? { originCoordinates: null } : {}) }));
  }

  function chooseVehicle(id) {
    setSelectedVehicleId(id);
    const vehicle = vehicles.find(item => item.id === id);
    if (!vehicle) return;
    setForm(current => ({
      ...current,
      heightCm: vehicle.height_cm == null ? "" : String(vehicle.height_cm),
      widthCm: vehicle.width_cm == null ? "" : String(vehicle.width_cm),
      lengthCm: vehicle.length_cm == null ? "" : String(vehicle.length_cm),
      grossWeightKg: vehicle.gross_weight_kg == null ? "" : String(vehicle.gross_weight_kg),
      weightPerAxleKg: vehicle.weight_per_axle_kg == null ? "" : String(vehicle.weight_per_axle_kg),
      vehicleType: vehicle.routing_vehicle_type || "StraightTruck",
      axleCount: vehicle.axle_count == null ? "" : String(vehicle.axle_count),
      trailerCount: vehicle.trailer_count == null ? "0" : String(vehicle.trailer_count)
    }));
    setResult(null);
    setMessage("פרטי הרכב נטענו. יש להזין את המשקל בפועל לנסיעה הנוכחית.");
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
    if (!selectedVehicleId) { setMessage("יש לבחור רכב שמור מהצי. נתוני רכב שמוזנים ידנית אינם משמשים לחישוב מסלול בטיחותי."); return; }
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
          vehicleId: selectedVehicleId,
          ...form,
          heightCm: Number(form.heightCm),
          widthCm: Number(form.widthCm),
          lengthCm: Number(form.lengthCm),
          grossWeightKg: Number(form.grossWeightKg),
          currentWeightKg: Number(form.currentWeightKg),
          weightPerAxleKg: form.weightPerAxleKg ? Number(form.weightPerAxleKg) : null,
          vehicleType: form.vehicleType,
          axleCount: Number(form.axleCount),
          trailerCount: Number(form.trailerCount),
          originCoordinates: form.originCoordinates
        })
      });
      const responseText = await response.text();
      let data = null;
      try { data = responseText ? JSON.parse(responseText) : null; } catch { /* handled below */ }
      if (!data || typeof data !== "object") {
        console.error("Truck route returned a non-JSON response", { status: response.status });
        setMessage("שירות חישוב המסלולים החזיר תשובה לא תקינה (קוד " + response.status + "). נסה לרענן. אם התקלה חוזרת, פנה לתמיכה.");
        return;
      }
      if (!response.ok) {
        console.error("Truck route request failed", { status: response.status, error: data.error || "unknown" });
        setMessage((data.error || "לא הצלחנו לחשב מסלול.") + " (קוד " + response.status + ")");
        return;
      }
      if (!Array.isArray(data.sections) || data.sections.length === 0) {
        console.error("Truck route response missing route sections");
        setMessage("התקבלה תשובה ללא נתוני מסלול. לא נוצר מסלול לנסיעה.");
        return;
      }
      setResult(data);
      if (data.hasCriticalNotices) setMessage("המסלול כולל התראות קריטיות. אין לצאת לדרך על סמך מסלול זה.");
      else setMessage("המסלול חושב. יש לאמת שילוט והגבלות בשטח לפני היציאה.");
    } catch (error) {
      console.error("Truck route request could not be completed", error?.name || "unknown");
      setMessage("החיבור לשירות חישוב המסלולים נכשל. בדוק אינטרנט ורענן את הדף. אם התקלה חוזרת, נבדוק את קוד השגיאה.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="truck-safe-tool-page" dir="rtl" style={{ padding: 24 }}>טוען...</main>;

  const field = { width: "100%", padding: 12, border: "1px solid #dce3ee", borderRadius: 10, marginTop: 6, background: "white", color: "#172338" };
  const label = { display: "block", fontSize: 13, fontWeight: 600, color: "#344054" };
  const button = { border: 0, borderRadius: 10, background: "#245bd7", color: "white", padding: "12px 18px", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.65 : 1 };

  return <main className="truck-safe-tool-page" dir="rtl" style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172338", padding: 18 }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div><h1 style={{ margin: 0, fontSize: 25 }}><Truck size={24} style={{ verticalAlign: "middle" }}/> ניווט משאיות</h1><p style={{ color: "#718096", margin: "6px 0" }}>תכנון מסלול לפי מידות ומשקל הרכב והגבלות משאיות בישראל</p></div>
        <button type="button" onClick={() => router.push("/")} style={{ ...field, width: "auto", margin: 0, cursor: "pointer" }}><ArrowRight size={15} style={{ verticalAlign: "middle" }}/> לוח הבקרה</button>
      </header>

      <section style={{ background: "#fff8e8", border: "1px solid #f0d9a8", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <b><ShieldAlert size={17} style={{ verticalAlign: "middle" }}/> בטיחות לפני הכול</b>
        <p style={{ margin: "7px 0 0", lineHeight: 1.6, fontSize: 13 }}>המערכת משתמשת בנתוני ניתוב למשאיות של HERE. גם מסלול ללא התראות אינו הבטחה שהדרך בטוחה או חוקית בכל רגע. חובה לבדוק שילוט, הוראות משטרה, עבודות בכביש ומגבלות מקומיות לפני ובמהלך הנסיעה. מסלול עם התראה קריטית אינו מאושר ליציאה.</p>
        <p style={{ margin: "8px 0 0", lineHeight: 1.6, fontSize: 13, color: "#8a4b08" }}><b>חשוב:</b> מגבלות דרך שהוזנו ידנית במערכת עדיין אינן משולבות אוטומטית בחישוב המסלול. יש לבדוק אותן בנפרד לפני היציאה.</p>
      </section>

      {message && <div role="status" style={{ background: result?.hasCriticalNotices ? "#fff0f0" : "#eef4ff", border: "1px solid #dce6f7", borderRadius: 10, padding: 12, marginBottom: 14, lineHeight: 1.5 }}>{message}</div>}

      <form onSubmit={calculate} style={{ background: "white", border: "1px solid #e5eaf1", borderRadius: 16, padding: 18, boxShadow: "0 5px 20px #17233808" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>פרטי הנסיעה והרכב</h2>
        {vehicles.length === 0 && <p role="status" style={{ color: "#8a4b08", lineHeight: 1.6 }}>אין רכב שמור זמין לניווט בצי. יש להוסיף רכב ולעדכן את מידותיו לפי רישיון הרכב בלוח הבקרה.</p>}
        {vehicles.length > 0 && <label style={{ ...label, marginBottom: 14 }}>בחירת רכב מהצי
          <select style={field} value={selectedVehicleId} onChange={e => chooseVehicle(e.target.value)}>
            <option value="">הזנת פרטי רכב ידנית</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number}{vehicle.height_cm ? " · "+vehicle.height_cm+" ס״מ" : " · חסרים נתוני מידות"}</option>)}
          </select>
        </label>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          <label style={label}>מוצא בישראל<div style={{ display: "flex", gap: 7, marginTop: 6 }}><input required maxLength={180} style={{ ...field, marginTop: 0, minWidth: 0 }} value={form.origin} onChange={e => update("origin", e.target.value)} placeholder="כתובת, יישוב או אזור"/><button type="button" onClick={useCurrentLocation} disabled={locating || busy} style={{ ...field, width: "auto", whiteSpace: "nowrap", marginTop: 0, cursor: "pointer" }}><MapPin size={15} style={{ verticalAlign: "middle" }}/> {locating ? "מאתר..." : "המיקום שלי"}</button></div></label>
          <label style={label}>יעד בישראל<input required maxLength={180} style={field} value={form.destination} onChange={e => update("destination", e.target.value)} placeholder="כתובת, יישוב או אזור"/></label>
          <label style={label}>גובה כולל (ס״מ)<input required readOnly type="number" min="100" max="600" step="1" style={field} value={form.heightCm} onChange={e => update("heightCm", e.target.value)} placeholder="לדוגמה: 400"/></label>
          <label style={label}>רוחב כולל (ס״מ)<input required readOnly type="number" min="100" max="350" step="1" style={field} value={form.widthCm} onChange={e => update("widthCm", e.target.value)} placeholder="לדוגמה: 250"/></label>
          <label style={label}>אורך כולל (ס״מ)<input required readOnly type="number" min="200" max="3000" step="1" style={field} value={form.lengthCm} onChange={e => update("lengthCm", e.target.value)} placeholder="כולל נגרר"/></label>
          <label style={label}>משקל כולל מותר (ק״ג)<input required readOnly type="number" min="1000" max="100000" step="100" style={field} value={form.grossWeightKg} onChange={e => update("grossWeightKg", e.target.value)} placeholder="לפי רישיון הרכב"/></label>
          <label style={label}>משקל בפועל בנסיעה (ק״ג)<input required type="number" min="1000" max="100000" step="100" style={field} value={form.currentWeightKg} onChange={e => update("currentWeightKg", e.target.value)} placeholder="רכב + מטען + נגרר"/></label>
          <label style={label}>סוג משאית<select required style={field} value={form.vehicleType} onChange={e => update("vehicleType", e.target.value)}><option value="StraightTruck">משאית קשיחה</option><option value="Tractor">גורר / ראש גורר</option></select></label>
          <label style={label}>מספר סרנים<input required readOnly type="number" min="2" max="12" step="1" style={field} value={form.axleCount} onChange={e => update("axleCount", e.target.value)} placeholder="לפי רישיון הרכב"/></label>
          <label style={label}>מספר נגררים<input required readOnly type="number" min="0" max="3" step="1" style={field} value={form.trailerCount} onChange={e => update("trailerCount", e.target.value)}/></label>
          <label style={label}>משקל מרבי לסרן (ק״ג, אם ידוע)<input readOnly type="number" min="500" max="30000" step="100" style={field} value={form.weightPerAxleKg} onChange={e => update("weightPerAxleKg", e.target.value)} placeholder="אופציונלי"/></label>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
          <button type="submit" disabled={busy || !providerReady || !selectedVehicleId} style={button}><Route size={17} style={{ verticalAlign: "middle" }}/> {busy ? "מחשב מסלול..." : providerReady ? "חשב מסלול למשאית" : "ממתין לחיבור שירות הניווט"}</button>
          <span style={{ color: "#718096", fontSize: 12 }}>המשקלים והמידות נדרשים כדי למנוע חישוב לפי פרופיל משאית שגוי.</span>
        </div>
      </form>

      {result && <section style={{ marginTop: 16, display: "grid", gap: 14 }}>
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
