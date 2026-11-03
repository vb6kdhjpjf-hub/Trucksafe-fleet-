"use client";

import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowUpLeft, Bell, CheckCircle2,
  ChevronLeft, Clock3, Fuel, Gauge, MapPin, Menu, MoreHorizontal,
  Navigation, Plus, Search, ShieldCheck, Truck, Users, Wrench
} from "lucide-react";

const initialTrips = [
  { id: "TS-2048", driver: "יוסי כהן", vehicle: "משאית 482-65-301", route: "מגדל ← חיפה", status: "בדרך", eta: "14:45", progress: 72, tone: "blue" },
  { id: "TS-2049", driver: "מוחמד ח׳טיב", vehicle: "משאית 771-22-104", route: "טבריה ← עפולה", status: "בדרך", eta: "15:10", progress: 48, tone: "blue" },
  { id: "TS-2050", driver: "דוד לוי", vehicle: "משאית 190-44-802", route: "צפת ← מגדל", status: "ממתין ליציאה", eta: "15:35", progress: 0, tone: "amber" }
];

const nav = [
  ["סקירה כללית", Gauge], ["שיבוץ חכם", Activity], ["כלי רכב", Truck],
  ["נהגים", Users], ["נסיעות פעילות", Navigation], ["מרכז אירועים", AlertTriangle],
  ["תחזוקה", Wrench]
];

function StatCard({ label, value, note, icon: Icon, color, trend }) {
  return <div className="stat-card">
    <div className="stat-top"><span className={"stat-icon " + color}><Icon size={19}/></span><span className="stat-note">{note}</span></div>
    <div className="stat-value">{value}</div><div className="stat-label">{label}</div>
    <div className={"stat-trend " + (trend === "up" ? "positive" : "")}>{trend === "up" ? <ArrowUpLeft size={14}/> : <ArrowDownLeft size={14}/>} {trend === "up" ? "לעומת אתמול" : "דורש מעקב"}</div>
  </div>;
}

export default function Home() {
  const [active, setActive] = useState("סקירה כללית");
  const [query, setQuery] = useState("");
  const [trips, setTrips] = useState(initialTrips);
  const [notice, setNotice] = useState("");
  const filtered = trips.filter(t => (t.driver + t.vehicle + t.route + t.id).includes(query));
  function addTrip() {
    const next = { id: "TS-" + (2051 + trips.length - 3), driver: "נהג חדש", vehicle: "טרם שובץ רכב", route: "משימה חדשה", status: "ממתין לשיבוץ", eta: "--:--", progress: 0, tone: "amber" };
    setTrips([...trips, next]);
    setNotice("נוספה משימה חדשה לרשימה");
    setTimeout(() => setNotice(""), 2800);
  }
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Truck size={23}/></div><div><strong>TruckSafe</strong><span>FLEET MANAGEMENT</span></div></div>
      <div className="workspace"><span className="workspace-dot"></span><div><b>הצי הראשי</b><small>סביבת ניהול</small></div><MoreHorizontal size={18}/></div>
      <div className="nav-caption">תפריט ראשי</div>
      <nav>{nav.map(([label, Icon]) => <button key={label} className={"nav-item " + (active === label ? "selected" : "")} onClick={() => setActive(label)}><Icon size={18}/><span>{label}</span>{label === "מרכז אירועים" && <i className="nav-alert">2</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="safety-card"><ShieldCheck size={20}/><b>הבטיחות לפני הכול</b><p>המערכת מנטרת חריגות ומסייעת לשמור על הנהגים והצי.</p><span>מערכת פעילה</span></div><div className="profile"><div className="avatar">מ</div><div><b>מנהל צי</b><small>מנהל מערכת</small></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="mobile-brand"><Truck size={21}/> TruckSafe</div><div className="crumb">ניהול צי <ChevronLeft size={14}/> <b>{active}</b></div><div className="top-actions"><div className="system-status"><span></span> כל המערכות תקינות</div><button className="icon-btn" aria-label="התראות"><Bell size={19}/><i></i></button><div className="top-avatar">מ</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow">יום שלישי, סביבת הדגמה</div><h1>{active === "סקירה כללית" ? "שלום, מנהל הצי 👋" : active}</h1><p>הנה תמונת המצב של הצי שלך בזמן אמת.</p></div><button className="primary-btn" onClick={addTrip}><Plus size={17}/> יצירת משימה חדשה</button></div>
        {notice && <div className="notice"><CheckCircle2 size={17}/>{notice}</div>}
        <div className="stats-grid">
          <StatCard label="כלי רכב בצי" value="24" note="מתוך 28" icon={Truck} color="purple" trend="up"/>
          <StatCard label="נסיעות פעילות" value={trips.filter(t=>t.status==="בדרך").length.toString().padStart(2,"0")} note="כרגע" icon={Navigation} color="blue" trend="up"/>
          <StatCard label="נהגים במשמרת" value="18" note="מתוך 22" icon={Users} color="green" trend="up"/>
          <StatCard label="אירועי בטיחות פתוחים" value="02" note="לטיפול" icon={AlertTriangle} color="orange" trend="down"/>
        </div>
        <div className="section-grid">
          <section className="panel trips-panel">
            <div className="panel-heading"><div><h2>נסיעות ומשימות פעילות</h2><p>מעקב אחר התקדמות הנהגים והמשלוחים</p></div><button className="text-btn" onClick={()=>setActive("נסיעות פעילות")}>לכל הנסיעות <ChevronLeft size={15}/></button></div>
            <div className="table-tools"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="חיפוש נהג, רכב או מסלול"/></div><span className="live-label"><i></i> עדכון חי</span></div>
            <div className="trip-list">{filtered.map(t=><div className="trip-row" key={t.id}><div className="trip-symbol"><Truck size={19}/></div><div className="trip-main"><div className="trip-title">{t.route}<span className={"status " + (t.tone==="blue"?"status-blue":"status-amber")}>{t.status}</span></div><div className="trip-meta">{t.driver} <span>•</span> {t.vehicle} <span>•</span> {t.id}</div><div className="progress"><i style={{width:t.progress+"%"}}/></div></div><div className="trip-eta"><small>הגעה משוערת</small><b>{t.eta}</b></div><button className="dots-btn" aria-label="אפשרויות"><MoreHorizontal size={18}/></button></div>)}
              {filtered.length===0 && <div className="empty">לא נמצאו נסיעות מתאימות.</div>}
            </div>
          </section>
          <section className="panel alerts-panel">
            <div className="panel-heading"><div><h2>מרכז בטיחות</h2><p>אירועים שדורשים תשומת לב</p></div><span className="count-badge">2 פתוחים</span></div>
            <div className="alert-item critical"><div className="alert-icon"><AlertTriangle size={18}/></div><div><b>חריגה מזמן נהיגה</b><p>רכב 482-65-301 · לפני 12 דקות</p><span>נדרשת בדיקה מול הנהג</span></div></div>
            <div className="alert-item warning"><div className="alert-icon"><Fuel size={18}/></div><div><b>דלק נמוך</b><p>רכב 190-44-802 · לפני 28 דקות</p><span>מומלץ לתכנן תדלוק</span></div></div>
            <button className="outline-btn" onClick={()=>setActive("מרכז אירועים")}>פתיחת מרכז האירועים <ChevronLeft size={15}/></button>
          </section>
        </div>
        <div className="bottom-grid">
          <section className="panel mini-panel"><div className="mini-icon mint"><Gauge size={19}/></div><div><b>ציון בטיחות צי</b><strong>94<span>/100</span></strong><small>ביצועים טובים מאוד</small></div><div className="score-ring"><span>94</span></div></section>
          <section className="panel mini-panel"><div className="mini-icon lilac"><Wrench size={19}/></div><div><b>תחזוקה קרובה</b><strong>3 <span>כלי רכב</span></strong><small>טיפולים ב-7 הימים הקרובים</small></div><button className="mini-link" onClick={()=>setActive("תחזוקה")}>לצפייה <ChevronLeft size={14}/></button></section>
          <section className="panel mini-panel"><div className="mini-icon sky"><Clock3 size={19}/></div><div><b>זמן נסיעה ממוצע</b><strong>2.4 <span>שעות</span></strong><small>ירידה של 8% השבוע</small></div></section>
        </div>
        <footer>TruckSafe Fleet V1 <span>•</span> סביבת הדגמה ראשונית · הנתונים המוצגים לדוגמה בלבד</footer>
      </div>
    </section>
  </main>;
}
