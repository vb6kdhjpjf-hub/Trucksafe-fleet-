"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSpreadsheet, ShieldCheck, AlertTriangle, Upload, Download, RefreshCw } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { resolveFleetWorkspace } from "../../lib/fleet-workspace.mjs";
import { parseEnterpriseCsv } from "../../lib/enterprise-import-csv.mjs";
import { suggestImportColumnMappings, validateEnterpriseImportRows } from "../../lib/enterprise-import-mapping.mjs";
import { serializeEnterpriseCsv } from "../../lib/enterprise-import-export.mjs";
import { flagExistingEnterpriseIdentityConflicts } from "../../lib/enterprise-import-conflicts.mjs";

const FIELD_LABELS = {
  drivers: {
    full_name: "שם מלא",
    phone: "טלפון",
    license_number: "מספר רישיון נהיגה",
    license_class: "דרגת רישיון",
    license_expires_at: "תוקף רישיון",
    status: "סטטוס נהג"
  },
  vehicles: {
    registration_number: "מספר רישוי",
    make: "יצרן",
    model: "דגם",
    year: "שנת ייצור",
    vehicle_type: "סוג רכב",
    capacity_kg: "קיבולת (ק״ג)",
    status: "סטטוס רכב",
    odometer_km: "מד אוץ (ק״מ)",
    next_service_at: "טיפול הבא",
    test_due_at: "מועד טסט",
    insurance_due_at: "תוקף ביטוח",
    registration_due_at: "תוקף רישיון רכב",
    notes: "הערות",
    height_cm: "גובה (ס״מ)",
    width_cm: "רוחב (ס״מ)",
    length_cm: "אורך (ס״מ)",
    gross_weight_kg: "משקל כולל (ק״ג)",
    empty_weight_kg: "משקל עצמי (ק״ג)",
    axle_count: "מספר סרנים",
    trailer_count: "מספר נגררים",
    weight_per_axle_kg: "משקל לסרן (ק״ג)"
  }
};

const ERROR_LABELS = {
  column_count_mismatch: "מספר העמודות בשורה אינו תואם לכותרות",
  required_value_missing: "חסר ערך בשדה חובה",
  date_requires_iso_yyyy_mm_dd: "תאריך חייב להיות בפורמט YYYY-MM-DD",
  invalid_numeric_format: "ערך מספרי אינו תקין או אינו חד-משמעי",
  numeric_value_out_of_range: "ערך מספרי מחוץ לטווח המותר",
  status_requires_manual_mapping: "ערך הסטטוס אינו נתמך ודורש התאמה ידנית",
  duplicate_identity_in_fleet: "המזהה כבר קיים בצי ודורש בדיקה לפני קליטה"
};

function downloadCsv(filename, rows) {
  const csv = serializeEnterpriseCsv(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fleet, setFleet] = useState(null);
  const [role, setRole] = useState("");
  const [entityType, setEntityType] = useState("drivers");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [validation, setValidation] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [existingIdentityValues, setExistingIdentityValues] = useState([]);
  const [identityPreflight, setIdentityPreflight] = useState({ status: "idle", message: "" });

  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured) {
      setMessage("החיבור למסד הנתונים אינו מוגדר.");
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) {
        router.replace("/");
        return;
      }
      const result = await resolveFleetWorkspace(supabase, data.session.user.id);
      if (!alive) return;
      if (result.error) {
        if (result.error.code === "AUTH_REQUIRED" || result.error.code === "NO_FLEET") router.replace("/");
        else setMessage("לא ניתן לאמת את סביבת העבודה: " + result.error.message);
      } else {
        setFleet(result.data.fleet);
        setRole(result.data.membership.role);
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  const canManage = role === "owner" || role === "fleet_manager";
  const fields = FIELD_LABELS[entityType];

  function clearPreview() {
    setFilename("");
    setParsed(null);
    setMapping({});
    setValidation(null);
    setExistingIdentityValues([]);
    setIdentityPreflight({ status: "idle", message: "" });
    setMessage("");
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearPreview();
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setMessage("בשלב זה נתמכים קובצי CSV בלבד. יש לייצא קובצי Excel לפורמט CSV לפני ההעלאה.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setMessage("הקובץ גדול מהמגבלה של 20MB.");
        return;
      }
      const text = await file.text();
      const result = parseEnterpriseCsv(text);
      if (!result.ok) {
        setMessage("לא ניתן לקרוא את הקובץ: " + result.error);
        return;
      }
      const suggested = suggestImportColumnMappings(result.headers, entityType);
      if (!suggested.ok) {
        setMessage("סוג הנתונים שבחרת אינו נתמך.");
        return;
      }
      const initial = Object.fromEntries(Object.entries(suggested.fields).map(([field, source]) => [field, source.sourceIndex]));
      setFilename(file.name);
      setParsed(result);
      setMapping(initial);
      setMessage("");
    } catch (error) {
      setMessage("קריאת הקובץ נכשלה: " + (error?.message || "שגיאה לא ידועה"));
    } finally {
      setBusy(false);
    }
  }

  const preview = useMemo(() => {
    if (!parsed) return null;
    const result = validateEnterpriseImportRows(parsed, entityType, { fields: mapping });
    return result.ok ? result : null;
  }, [parsed, entityType, mapping]);

  useEffect(() => {
    let alive = true;
    if (!parsed || !fleet?.id || !canManage) {
      setExistingIdentityValues([]);
      setIdentityPreflight({ status: "idle", message: "" });
      return () => { alive = false; };
    }

    const table = entityType === "drivers" ? "drivers" : "vehicles";
    const identityField = entityType === "drivers" ? "license_number" : "registration_number";
    setIdentityPreflight({ status: "loading", message: "בודק מזהים מול הרשומות הקיימות בצי…" });
    setExistingIdentityValues([]);

    (async () => {
      const values = [];
      const pageSize = 1000;
      const maximumRows = 100000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from(table)
          .select(identityField)
          .eq("fleet_id", fleet.id)
          .not(identityField, "is", null)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const batch = (data || []).map(row => row[identityField]).filter(value => value != null && String(value).trim());
        values.push(...batch);
        if (values.length >= maximumRows && batch.length === pageSize) {
          throw new Error("לא ניתן להשלים בדיקת כפילויות מלאה עבור צי גדול במיוחד.");
        }
        if (batch.length < pageSize) break;
      }
      if (alive) {
        setExistingIdentityValues(values);
        setIdentityPreflight({ status: "ready", message: `נבדקו ${values.length.toLocaleString("he-IL")} מזהים קיימים בצי.` });
      }
    })().catch(error => {
      if (alive) {
        setExistingIdentityValues([]);
        setIdentityPreflight({ status: "error", message: error?.message || "בדיקת המזהים מול הצי נכשלה." });
      }
    });

    return () => { alive = false; };
  }, [parsed, entityType, fleet?.id, canManage]);

  const displayPreview = useMemo(() => {
    if (!preview || identityPreflight.status !== "ready") return preview;
    return flagExistingEnterpriseIdentityConflicts(preview, entityType, existingIdentityValues);
  }, [preview, entityType, existingIdentityValues, identityPreflight.status]);

  const missingRequired = useMemo(() => Object.entries(fields)
    .filter(([field]) => field === "full_name" || field === "registration_number")
    .filter(([field]) => mapping[field] === undefined || mapping[field] === ""), [fields, mapping]);

  const duplicateSourceMappings = useMemo(() => {
    const counts = new Map();
    for (const source of Object.values(mapping)) {
      if (source === undefined || source === "") continue;
      counts.set(source, (counts.get(source) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([source]) => parsed?.headers?.[source] ?? String(source));
  }, [mapping, parsed]);

  function exportRejected() {
    if (!displayPreview || identityPreflight.status !== "ready") return;
    const rows = [["שורת מקור", "סוג נתונים", "שדות", "שגיאות", "אזהרות"]];
    displayPreview.rows.filter(row => row.errors.length || row.warnings.length).forEach(row => {
      rows.push([
        row.rowNumber,
        entityType === "drivers" ? "נהגים" : "רכבים",
        Object.keys(row.data).join("; "),
        row.errors.map(error => ERROR_LABELS[error.code] || error.code).join("; "),
        row.warnings.map(warning => warning.code).join("; ")
      ]);
    });
    downloadCsv("trucksafe-import-review.csv", rows);
  }

  if (loading) return <main className="fleet-main"><p>טוען סביבת עבודה מאובטחת…</p></main>;

  return (
    <main className="fleet-main" dir="rtl">
      <header className="fleet-header">
        <div>
          <a className="nav-link" href="/"><ArrowRight size={16}/> חזרה ללוח הבקרה</a>
          <h1 style={{ margin: "14px 0 4px" }}>מרכז קליטת נתונים</h1>
          <p style={{ margin: 0, color: "#718096" }}>מעבר לצי קיים בלי להזין כל נהג ורכב מחדש.</p>
        </div>
        <div className="drivers-header-actions"><span className="status-pending">תצוגה מקדימה בלבד</span></div>
      </header>

      {message && <div className="fleet-panel" role="status" style={{ borderRight: "4px solid #d97706" }}>{message}</div>}

      <section className="fleet-panel">
        <div className="fleet-panel-head">
          <div><h3>1. בחירת סוג הנתונים</h3><p>הייבוא משויך לצי: {fleet?.name || "לא זוהה"}</p></div>
          <FileSpreadsheet size={24}/>
        </div>
        <div className="form-grid">
          <label>מה ברצונך לקלוט?
            <select value={entityType} disabled={Boolean(parsed) || busy} onChange={event => { setEntityType(event.target.value); clearPreview(); }}>
              <option value="drivers">נהגים</option>
              <option value="vehicles">רכבים</option>
            </select>
          </label>
          <label>בחירת קובץ CSV
            <input type="file" accept=".csv,text/csv" disabled={!canManage || busy} onChange={handleFile}/>
          </label>
        </div>
        {!canManage && <p className="status-late">ייבוא נתונים זמין לבעל הצי ולמנהל הצי בלבד.</p>}
        <p style={{ color: "#718096", fontSize: 13 }}>הקובץ נקרא בזיכרון הדפדפן בלבד. בשלב זה הוא אינו מועלה לשרת, אינו נשמר ואינו משנה נתונים בצי.</p>
      </section>

      {parsed && <>
        <section className="fleet-panel">
          <div className="fleet-panel-head"><div><h3>2. התאמת עמודות</h3><p>{filename} · {parsed.rows.length.toLocaleString("he-IL")} שורות · מפריד: {parsed.delimiter === "\t" ? "טאב" : parsed.delimiter}</p></div><button className="secondary-btn" onClick={clearPreview}><RefreshCw size={15}/> בחירת קובץ אחר</button></div>
          <div className="form-grid">
            {Object.entries(fields).map(([field, label]) => (
              <label key={field}>{label}
                <select value={mapping[field] ?? ""} onChange={event => { setMapping(current => ({ ...current, [field]: event.target.value === "" ? "" : Number(event.target.value) })); setMessage(""); }}>
                  <option value="">לא לייבא</option>
                  {parsed.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && <p className="status-late">נדרשת התאמה של שדה חובה: {missingRequired.map(([, label]) => label).join(", ")}.</p>}
          {duplicateSourceMappings.length > 0 && <p className="status-late">אותה עמודה משויכת ליותר משדה אחד: {duplicateSourceMappings.join(", ")}. יש לבחור עמודה שונה לכל שדה.</p>}
        </section>

        <section className="fleet-panel">
          <div className="fleet-panel-head"><div><h3>3. תוצאות בדיקת הקובץ</h3><p>הבדיקה אינה שומרת נתונים. יש לאשר ולבדוק את כל האזהרות לפני קליטה עתידית.</p></div><ShieldCheck size={24}/></div>
          {identityPreflight.status === "loading" && <p role="status">{identityPreflight.message}</p>}
          {identityPreflight.status === "error" && <p className="status-late" role="alert">לא ניתן להשלים בדיקת כפילויות מול הצי הקיים. התוצאות אינן מלאות ולכן אין להסתמך עליהן: {identityPreflight.message}</p>}
          {identityPreflight.status === "ready" && <p style={{ color: "#718096", fontSize: 13 }} role="status">{identityPreflight.message} הבדיקה לקריאה בלבד.</p>}
          {identityPreflight.status !== "ready" || !displayPreview ? <p className="status-late">לא ניתן להציג תוצאות מלאות עד להשלמת בדיקת הכפילויות מול הצי.</p> : <>
            <div className="vehicle-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
              <div className="fleet-stat"><b>{displayPreview.summary.total}</b><span>סה״כ שורות</span></div>
              <div className="fleet-stat"><b>{displayPreview.summary.ready}</b><span>תקינות</span></div>
              <div className="fleet-stat"><b>{displayPreview.summary.review}</b><span>דורשות בדיקה</span></div>
              <div className="fleet-stat"><b>{displayPreview.summary.rejected}</b><span>נדחו</span></div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
              <button className="secondary-btn" onClick={exportRejected} disabled={identityPreflight.status !== "ready" || !displayPreview?.rows.some(row => row.errors.length || row.warnings.length)}><Download size={15}/> הורדת דוח בדיקה</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                <thead><tr><th style={{ textAlign: "right", padding: 10 }}>שורה</th><th style={{ textAlign: "right", padding: 10 }}>מזהה</th><th style={{ textAlign: "right", padding: 10 }}>תוצאה</th><th style={{ textAlign: "right", padding: 10 }}>פירוט</th></tr></thead>
                <tbody>{displayPreview.rows.slice(0, 50).map(row => {
                  const identity = row.data.full_name || row.data.registration_number || "—";
                  const details = [...row.errors.map(error => ERROR_LABELS[error.code] || error.code), ...row.warnings.map(warning => warning.code === "safety_document_review_required" ? "נתון בטיחותי מחייב אימות מול מסמכי הרכב" : warning.code === "duplicate_identity_in_file" ? "מזהה כפול בקובץ" : ERROR_LABELS[warning.code] || warning.code)];
                  return <tr key={row.rowNumber} style={{ borderTop: "1px solid #e8edf3" }}><td style={{ padding: 10 }}>{row.rowNumber}</td><td style={{ padding: 10 }}>{identity}</td><td style={{ padding: 10 }}>{row.disposition === "ready" ? "תקין" : row.disposition === "review" ? "בדיקה" : "נדחה"}</td><td style={{ padding: 10, color: details.length ? "#a15c00" : "#16803c" }}>{details.join(" · ") || "עבר בדיקת מבנה וערכים"}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {displayPreview.rows.length > 50 && <p style={{ color: "#718096" }}>מוצגות 50 השורות הראשונות בלבד. דוח הבדיקה כולל את כל השורות שדורשות טיפול.</p>}
          </>}
        </section>
      </>}

      <section className="fleet-panel" style={{ borderRight: "4px solid #3867e8" }}>
        <div className="fleet-panel-head"><div><h3>הגנת נתונים ובטיחות</h3><p>קליטה אמיתית תתווסף רק לאחר השלמת מנגנון שרת מאובטח.</p></div><AlertTriangle size={23}/></div>
        <ul style={{ lineHeight: 2, paddingRight: 22 }}>
          <li>לא מיובאים מזהי משתמשים, מזהי ציים או הרשאות.</li>
          <li>נתוני גובה, רוחב, משקל וסרנים אינם מאומתים אוטומטית מול רישיון הרכב.</li>
          <li>כפילויות וערכים לא ברורים מסומנים לבדיקה ידנית.</li>
          <li>אין אפשרות לבצע קליטה או עדכון נתונים במסך זה.</li>
        </ul>
      </section>
    </main>
  );
}
